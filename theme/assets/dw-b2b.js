/* Digital World Shop B2B storefront interactions.
   Talks to the companion app through the App Proxy:
     /apps/dw/offers   - create offers, list mine, accept/counter/withdraw
     /apps/dw/watches  - notify bells (restock / price drop alerts)
   All requests are same-origin; Shopify signs them and identifies the
   logged-in customer server-side. A 401 means "not signed in". */

(function () {
  var root = document.querySelector('[data-dw-b2b]');
  if (!root) return;
  var loginUrl = root.dataset.dwLoginUrl || '/account/login';
  var customerEmail = root.dataset.dwCustomerEmail || '';
  var loggedIn = root.dataset.dwLoggedIn === 'true';

  var money = function (cents) {
    return (
      '$' + (cents / 100).toLocaleString('en-US', { minimumFractionDigits: cents % 100 ? 2 : 0 })
    );
  };

  var toastEl;
  function toast(message) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'dw-toast';
      toastEl.setAttribute('role', 'status');
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = message;
    toastEl.classList.add('dw-toast--show');
    clearTimeout(toastEl._t);
    toastEl._t = setTimeout(function () {
      toastEl.classList.remove('dw-toast--show');
    }, 2600);
  }

  function api(path, options) {
    return fetch('/apps/dw/' + path, options).then(function (response) {
      if (response.status === 401) {
        window.location.href = loginUrl;
        throw new Error('sign-in required');
      }
      return response.json().then(function (data) {
        if (!response.ok) throw new Error(data.error || 'Something went wrong');
        return data;
      });
    });
  }

  /* ---------- notify bells ---------- */
  var bells = document.querySelectorAll('[data-dw-bell]');
  if (bells.length && loggedIn) {
    api('watches', { method: 'GET' })
      .then(function (data) {
        var watched = {};
        (data.watches || []).forEach(function (w) {
          watched[w.variantId] = true;
        });
        bells.forEach(function (bell) {
          if (watched[bell.dataset.variantGid]) {
            bell.classList.add('dw-bell--on');
            bell.setAttribute('aria-pressed', 'true');
          }
        });
      })
      .catch(function () {});
  }
  bells.forEach(function (bell) {
    bell.addEventListener('click', function () {
      if (!loggedIn) {
        window.location.href = loginUrl;
        return;
      }
      var on = bell.classList.contains('dw-bell--on');
      api('watches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: on ? 'unwatch' : 'watch',
          variantId: bell.dataset.variantGid,
          productId: bell.dataset.productGid,
          sku: bell.dataset.sku,
          productTitle: bell.dataset.title,
          email: customerEmail,
        }),
      })
        .then(function () {
          bell.classList.toggle('dw-bell--on', !on);
          bell.setAttribute('aria-pressed', String(!on));
          toast(
            !on
              ? 'Watching ' + bell.dataset.sku + ': restock and price-drop alerts on'
              : 'Alerts off for ' + bell.dataset.sku
          );
        })
        .catch(function (error) {
          if (error.message !== 'sign-in required') toast(error.message);
        });
    });
  });

  /* ---------- make offer modal ---------- */
  var modal = document.getElementById('DwOfferModal');
  if (modal) {
    var qtyInput = modal.querySelector('[name="quantity"]');
    var priceInput = modal.querySelector('[name="price"]');
    var durationSelect = modal.querySelector('[name="duration"]');
    var totalEl = modal.querySelector('[data-dw-offer-total]');
    var errorEl = modal.querySelector('[data-dw-offer-error]');
    var productEl = modal.querySelector('[data-dw-offer-product]');
    var current = null;

    function updateTotal() {
      var total = Math.round(Number(priceInput.value || 0) * 100) * Number(qtyInput.value || 0);
      totalEl.textContent = money(total);
    }
    qtyInput.addEventListener('input', updateTotal);
    priceInput.addEventListener('input', updateTotal);
    qtyInput.addEventListener('change', function () {
      var moq = Number(qtyInput.min) || 1;
      var value = Number(qtyInput.value) || moq;
      if (value < moq) value = moq;
      qtyInput.value = Math.ceil(value / moq) * moq;
      updateTotal();
    });

    document.querySelectorAll('[data-dw-offer]').forEach(function (button) {
      button.addEventListener('click', function () {
        if (!loggedIn) {
          window.location.href = loginUrl;
          return;
        }
        current = button.dataset;
        var listCents = Number(current.priceCents);
        var moq = Number(current.moq) || 1;
        productEl.textContent =
          current.title + '. List ' + money(listCents) + ' per unit, MOQ ' + moq + '.';
        qtyInput.min = moq;
        qtyInput.step = moq;
        qtyInput.value = moq;
        priceInput.value = ((listCents / 100) * 0.95).toFixed(2);
        priceInput.max = (listCents / 100).toFixed(2);
        errorEl.hidden = true;
        updateTotal();
        modal.showModal();
      });
    });

    modal.querySelector('[data-dw-offer-cancel]').addEventListener('click', function () {
      modal.close();
    });

    modal.querySelector('form').addEventListener('submit', function (event) {
      event.preventDefault();
      if (!current) return;
      var submit = modal.querySelector('[type="submit"]');
      submit.disabled = true;
      api('offers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create',
          variantId: current.variantGid,
          productId: current.productGid,
          sku: current.sku,
          productTitle: current.title,
          quantity: Number(qtyInput.value),
          listPriceCents: Number(current.priceCents),
          offerCents: Math.round(Number(priceInput.value) * 100),
          durationHours: Number(durationSelect.value),
          email: customerEmail,
        }),
      })
        .then(function () {
          modal.close();
          toast('Offer sent for ' + current.sku + '. Sales responds within 24 hours');
        })
        .catch(function (error) {
          if (error.message === 'sign-in required') return;
          errorEl.textContent = error.message;
          errorEl.hidden = false;
        })
        .finally(function () {
          submit.disabled = false;
        });
    });
  }

  /* ---------- my offers page ---------- */
  var offersList = document.getElementById('DwMyOffers');
  if (offersList && loggedIn) {
    var STATUS_LABELS = {
      PENDING: 'Pending',
      COUNTERED: 'Countered',
      ACCEPTED: 'Accepted',
      DECLINED: 'Declined',
      EXPIRED: 'Expired',
      WITHDRAWN: 'Withdrawn',
    };

    var renderOffers = function () {
      api('offers', { method: 'GET' })
        .then(function (data) {
          var slots = document.getElementById('DwOfferSlots');
          if (slots && data.slots) {
            slots.textContent =
              data.slots.used + ' of ' + data.slots.total + ' offer slots in use.' +
              ' Slots free up when an offer is accepted, declined or expires.';
          }
          if (!data.offers || data.offers.length === 0) {
            offersList.innerHTML =
              '<div class="dw-mo__empty">No offers yet. Find a product in the Shop and press Make Offer.</div>';
            return;
          }
          offersList.innerHTML = '';
          data.offers.forEach(function (offer) {
            var details = document.createElement('details');
            details.className = 'dw-mo__offer';
            var unit = offer.counterCents || offer.offerCents;
            var statusClass = 'dw-mo__status--' + offer.status.toLowerCase();
            var messages = (offer.messages || [])
              .map(function (m) {
                return (
                  '<div class="dw-mo__msg' + (m.from === 'BUYER' ? ' dw-mo__msg--you' : '') + '">' +
                  '<span class="dw-mo__who">' + (m.from === 'BUYER' ? 'You' : 'DW Sales') + '</span>' +
                  '<span class="dw-mo__bubble">' + m.body + '</span></div>'
                );
              })
              .join('');
            var actions = '';
            if (offer.status === 'COUNTERED') {
              actions =
                '<button class="dw-btn-money" data-act="accept">Accept ' + money(offer.counterCents) + '</button>' +
                '<button class="dw-btn-line" data-act="counter">Counter</button>' +
                '<button class="dw-mo__quiet" data-act="withdraw">Withdraw</button>';
            } else if (offer.status === 'PENDING') {
              actions = '<button class="dw-mo__quiet" data-act="withdraw">Withdraw Offer</button>';
            } else if (offer.status === 'ACCEPTED' && offer.invoiceUrl) {
              actions =
                '<a class="dw-btn-money" href="' + offer.invoiceUrl + '">Pay Invoice, ' +
                money(offer.offerCents * offer.quantity) + '</a>';
            }
            details.innerHTML =
              '<summary class="dw-mo__row">' +
              '<span class="dw-mono dw-mo__id">#' + offer.id + '</span>' +
              '<span class="dw-mo__name"><span class="dw-mo__title">' + offer.productTitle + '</span>' +
              '<span class="dw-mono dw-mo__sku">' + offer.sku + '</span></span>' +
              '<span class="dw-mono dw-mo__r">' + offer.quantity + '</span>' +
              '<span class="dw-mono dw-mo__r dw-mo__b">' + money(unit) + '</span>' +
              '<span class="dw-mono dw-mo__r dw-mo__b">' + money(unit * offer.quantity) + '</span>' +
              '<span><span class="dw-mo__status ' + statusClass + '">' + (STATUS_LABELS[offer.status] || offer.status) + '</span></span>' +
              '<span class="dw-mo__chev">&#9662;</span>' +
              '</summary>' +
              '<div class="dw-mo__thread">' + messages +
              '<div class="dw-mo__actions">' + actions + '</div></div>';

            details.querySelectorAll('[data-act]').forEach(function (button) {
              button.addEventListener('click', function (event) {
                event.preventDefault();
                var act = button.dataset.act;
                if (act === 'counter') {
                  var value = window.prompt('Your new unit price (USD):');
                  if (!value) return;
                  api('offers', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'counter', offerId: offer.id, cents: Math.round(Number(value) * 100) }),
                  }).then(renderOffers).catch(function (e) { toast(e.message); });
                  return;
                }
                api('offers', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ action: act, offerId: offer.id }),
                }).then(renderOffers).catch(function (e) { toast(e.message); });
              });
            });
            offersList.appendChild(details);
          });
        })
        .catch(function (error) {
          if (error.message !== 'sign-in required') {
            offersList.innerHTML = '<div class="dw-mo__empty">' + error.message + '</div>';
          }
        });
    };
    renderOffers();
  }

  /* ---------- notification center page ---------- */
  var watchList = document.getElementById('DwWatchList');
  if (watchList && loggedIn) {
    var renderWatches = function () {
      api('watches', { method: 'GET' })
        .then(function (data) {
          if (!data.watches || data.watches.length === 0) {
            watchList.innerHTML =
              '<div class="dw-mo__empty">You are not watching any items. Tap the bell on any product in the Shop.</div>';
            return;
          }
          watchList.innerHTML = '';
          data.watches.forEach(function (watch) {
            var row = document.createElement('div');
            row.className = 'dw-nc__row';
            row.innerHTML =
              '<span class="dw-nc__name"><span class="dw-nc__title">' + watch.productTitle + '</span>' +
              '<span class="dw-mono dw-nc__sku">' + watch.sku + '</span></span>' +
              '<span class="dw-nc__kinds">Price drop and restock alerts</span>' +
              '<button class="dw-btn-line" data-unwatch>Stop Watching</button>';
            row.querySelector('[data-unwatch]').addEventListener('click', function () {
              api('watches', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'unwatch', variantId: watch.variantId }),
              }).then(function () {
                toast('Alerts off for ' + watch.sku);
                renderWatches();
              }).catch(function (e) { toast(e.message); });
            });
            watchList.appendChild(row);
          });
        })
        .catch(function () {});
    };
    renderWatches();
  }
})();
