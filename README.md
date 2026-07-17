# Digital World Shop, B2B Storefront

Redesign of a Shopify Dawn theme into a B2B wholesale electronics storefront (HUBX-style, no product images, dense trading-desk grid).

## Workflow

1. Each page is sketched as a standalone interactive HTML file in `design/` (open directly in a browser).
2. Approved designs get converted to Shopify Liquid sections.
3. A custom Shopify app (separate, later) will handle: HUBX catalog/price sync, customer offers, back-in-stock and price-drop alerts, MOQ checkout validation.

## Design files

| File | Page |
|---|---|
| `design/01-main-selling-page.html` | Live Inventory grid (canonical, v3 final) |
| `design/02-my-offers.html` | My Offers with counteroffer threads |
| `design/00-compare.html` | Side-by-side viewer for the three explored variants |
| `design/01A-ledger.html`, `01B-cloud.html`, `01C-counter.html` | Variant explorations (A won) |

## Design language (locked)

- Cream ground `#f8f4ec`, ledger panels with 1px hairlines, 4px radius everywhere
- Navy `#1f3d6f` header and structure, blue `#3a6ccc` for info/filters
- Orange `#f97b28` reserved for money actions (soft-fill buttons with orange text `#c25107`)
- Red sold-out, gold low-stock; Geist + Geist Mono (data), Archivo wordmark; Phosphor icons
- Font/icon CDNs are fine for sketches; self-host as theme assets in the Liquid conversion
