/* Past Purchases: one-click reorder. Posts the order's line items to the
   AJAX cart API with bundled sections and hands them to Dawn's cart drawer. */

(function () {
  document.querySelectorAll('[data-dw-reorder]').forEach(function (button) {
    button.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();
      var items;
      try {
        items = JSON.parse(button.getAttribute('data-dw-reorder'));
      } catch (e) {
        return;
      }
      if (!Array.isArray(items) || items.length === 0) {
        window.alert('These items are no longer available to reorder.');
        return;
      }
      var originalText = button.textContent;
      button.disabled = true;
      button.textContent = 'Adding';

      fetch('/cart/add.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          items: items,
          sections: 'cart-drawer,cart-icon-bubble',
          sections_url: window.location.pathname,
        }),
      })
        .then(function (response) {
          return response.json().then(function (data) {
            return { ok: response.ok, data: data };
          });
        })
        .then(function (result) {
          if (!result.ok) {
            var message = (result.data && result.data.description) || 'Some items could not be added.';
            window.alert(message);
            return;
          }
          var drawer = document.querySelector('cart-drawer');
          if (drawer && typeof drawer.renderContents === 'function' && result.data.sections) {
            drawer.renderContents(result.data);
          }
        })
        .catch(function () {
          window.alert('Could not reorder. Check your connection and try again.');
        })
        .finally(function () {
          button.disabled = false;
          button.textContent = originalText;
        });
    });
  });
})();
