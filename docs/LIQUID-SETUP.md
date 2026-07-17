# Liquid Theme Setup Guide

The `theme/` folder is Dawn 15.5.0 with the Digital World Shop B2B layer on top.
Everything custom is prefixed `dw-` so Dawn upgrades stay easy to merge.

## What is converted so far

| Design file | Theme implementation |
|---|---|
| 01-main-selling-page.html | `sections/dw-main-inventory.liquid` + `templates/collection.json` + `assets/dw-inventory.js` |
| Header + announcement | `sections/dw-header.liquid`, `sections/dw-announcement.liquid`, `sections/header-group.json` |
| Design tokens | `assets/dw-tokens.css`, fonts via `snippets/dw-fonts.liquid` (loaded in `layout/theme.liquid`) |
| Cart drawer | Dawn's built-in AJAX drawer, wired to our Add to Cart buttons (custom styling pass still to do) |

Still to convert: Past Purchases (customer account templates), Price List page,
product detail template, account application page, cart drawer restyle.
My Offers and the Notification Center wait for the custom app (App Proxy).

## One-time store setup (Shopify admin)

1. **Metafield definitions** (Settings → Custom data → Products), all in namespace `custom`:
   - `moq` — Integer. Minimum order quantity; rows step by this. Defaults to 1 when empty.
   - `condition` — Single line text. Use `N` (new) or `R` (refurbished).
   - `warehouse` — Single line text. Example: `Miami, FL`.
2. **Inventory**: every product variant must have "Track quantity" on so the Avail
   column can show real numbers. Enter SKU on the variant (the grid shows it).
3. **Price Drop flag**: set the variant's Compare-at price above the price. The flag
   and strikethrough render automatically.
4. **Just Launched flag**: add the product tag `just-launched`.
5. **Filters** (brand rail, in-stock toggle, condition filter): install Shopify's free
   **Search & Discovery** app and add filters for: Availability, Vendor (this becomes
   the brand chip rail), and the Condition metafield.
6. **Navigation**: Online Store → Navigation → main-menu: Shop (→ /collections/all),
   Price List, Past Purchases (→ /account), My Offers. The header renders this menu.
7. **Price gating** (optional, non-Plus wholesale pattern): in the collection template
   settings turn on "Hide prices from non-approved customers". Approved buyers get the
   customer tag `approved` (tag name configurable). Everyone else sees
   "Sign in for pricing".
8. **Waitlist**: put a sales email in the section's Waitlist email setting; sold-out
   rows then show Join Waitlist.

## Previewing the theme

Requires a Shopify store (a free development store from your Partner dashboard works).

```bash
cd theme
shopify theme dev --store your-store.myshopify.com
```

This serves a live preview at 127.0.0.1:9292 with hot reload. To push it as an
unpublished theme instead: `shopify theme push --unpublished`.

## Notes and deliberate choices

- **Fonts** load from Google Fonts for now (`snippets/dw-fonts.liquid`). Before
  production, self-host: download the Geist, Geist Mono, and Archivo woff2 files into
  `assets/` and replace the snippet with `@font-face` rules.
- **MOQ is front-end only** so far (inputs snap to multiples). Server-side enforcement
  comes with the custom app's cart validation function.
- **Make Offer and notify bells** are intentionally absent from the Liquid grid until
  the custom app exists; they will arrive as app blocks so the theme never breaks
  without the app.
- Dawn's own header/announcement/product-grid sections still exist untouched; we swap
  ours in via the JSON templates, so reverting is a one-line change.
