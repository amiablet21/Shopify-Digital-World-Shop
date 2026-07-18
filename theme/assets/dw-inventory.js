/* Digital World Shop inventory grid behavior:
   - facet/sort form submits on change (GET, standard storefront filtering)
   - quantity inputs snap to MOQ multiples
   - Add to Cart posts to the AJAX cart API with bundled section rendering,
     then hands the sections to Dawn's cart drawer so it updates and opens. */

(function () {
  // Facet form: submit on any change, dropping empty params for clean URLs.
  var facets = document.getElementById('DwFacets');
  if (facets) {
    facets.addEventListener('change', function () {
      facets.querySelectorAll('select, input').forEach(function (el) {
        if (el.value === '' || (el.type === 'checkbox' && !el.checked)) {
          el.disabled = true;
        }
      });
      facets.submit();
    });
  }

  // MOQ snapping: round up to the nearest multiple, never below the MOQ.
  function updateLineTotal(input) {
    var price = parseInt(input.dataset.dwPrice, 10);
    if (!price) return;
    var totalEl = input.closest('form') && input.closest('form').querySelector('[data-dw-total]');
    if (!totalEl) return;
    var cents = price * (parseInt(input.value, 10) || 0);
    totalEl.textContent =
      '$' + (cents / 100).toLocaleString('en-US', { minimumFractionDigits: cents % 100 ? 2 : 0 });
  }

  document.querySelectorAll('[data-moq]').forEach(function (input) {
    input.addEventListener('change', function () {
      var moq = parseInt(input.dataset.moq, 10) || 1;
      var value = parseInt(input.value, 10) || moq;
      if (value < moq) value = moq;
      input.value = Math.ceil(value / moq) * moq;
      updateLineTotal(input);
    });
  });

  // Stepper buttons (product page): adjust the sibling quantity input by one MOQ.
  document.querySelectorAll('[data-dw-step]').forEach(function (button) {
    button.addEventListener('click', function () {
      var form = button.closest('form');
      var input = form && form.querySelector('[data-moq]');
      if (!input) return;
      var moq = parseInt(input.dataset.moq, 10) || 1;
      var value = (parseInt(input.value, 10) || moq) + parseInt(button.dataset.dwStep, 10) * moq;
      if (value < moq) value = moq;
      input.value = value;
      updateLineTotal(input);
    });
  });

  // AJAX add to cart wired into Dawn's cart drawer.
  document.querySelectorAll('[data-dw-atc]').forEach(function (form) {
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      var button = form.querySelector('button[type="submit"]');
      var originalText = button.textContent;
      button.disabled = true;
      button.textContent = 'Adding';

      var body = new FormData(form);
      body.append('sections', 'cart-drawer,cart-icon-bubble');
      body.append('sections_url', window.location.pathname);

      fetch(window.Shopify && window.Shopify.routes ? window.Shopify.routes.root + 'cart/add.js' : '/cart/add.js', {
        method: 'POST',
        headers: { Accept: 'application/json' },
        body: body,
      })
        .then(function (response) {
          return response.json().then(function (data) {
            return { ok: response.ok, data: data };
          });
        })
        .then(function (result) {
          if (!result.ok) {
            var message = (result.data && result.data.description) || 'Could not add to cart.';
            window.alert(message);
            return;
          }
          var drawer = document.querySelector('cart-drawer');
          if (drawer && typeof drawer.renderContents === 'function' && result.data.sections) {
            drawer.renderContents(result.data);
          } else if (result.data.sections && result.data.sections['cart-icon-bubble']) {
            var bubble = document.getElementById('cart-icon-bubble');
            if (bubble) {
              var holder = document.createElement('div');
              holder.innerHTML = result.data.sections['cart-icon-bubble'];
              var inner = holder.querySelector('.shopify-section') || holder;
              bubble.innerHTML = inner.innerHTML;
            }
          }
        })
        .catch(function () {
          window.alert('Could not add to cart. Check your connection and try again.');
        })
        .finally(function () {
          button.disabled = false;
          button.textContent = originalText;
        });
    });
  });
})();
