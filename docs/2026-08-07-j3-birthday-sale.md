# 24-Hour J3 Productions Birthday Sale — 2026-08-07

Flash sale honoring Willie Johnson of J3 Productions (birthday 8/7). Approved by
Nelson 2026-08-07 ~6pm CT.

## Offer
- Window: **2026-08-07 7:00pm CT → 2026-08-08 7:00pm CT** (epochs 1786147200 / 1786233600).
- Code **J3PRODUCTIONS** at Stripe checkout = **$20 off**: Digitals $100 → $80, Headshots $150 → $130.
- Code is shown publicly in the page banners (Nelson's call). Buyers book during
  the window; the shoot itself is later (24h min-notice), copy sells that.

## Implementation (v2 — as shipped)
- **Stripe**: coupon `LQ62Ywk8` ($20 off, once) + promotion code
  `promo_1U1xwpA2eIGiS0WsA6DLSmPA` (`J3PRODUCTIONS`, expires_at = sale end).
  Created by one-shot `bk-setup-sale` fn (in repo, deployment deleted after use).
- **CRITICAL DISCOVERY**: Stripe's hosted-checkout promo-code ENTRY field is
  broken account-wide (`payment_pages_promotion_code_invalid` for every valid
  live code — reproduced across coupon shapes, card-only sessions, fresh
  sessions), while server-side `discounts: [{promotion_code}]` attach works
  perfectly. So v1 (allow_promotion_codes) was replaced by v2:
- **Widgets** (`js/digitals.js` / `js/headshots.js`): the confirm step shows a
  promo-code input (pre-filled with J3PRODUCTIONS during the window), recomputes
  the total live ($80 / $130), and sends `promo_code` to checkout — including on
  the resume-checkout path (cached in sessionStorage).
- **bk-create-checkout v10**: normalizes the code (strips spaces, case-blind),
  validates window + /headshot|digital/i service, attaches the discount
  server-side; expires an open UNdiscounted session when the code arrives on
  retry; falls back to full price if the promo attach ever errors.
- **bk-stripe-webhook v9**: reconciliation accepts
  `amount_total + total_details.amount_discount === invoice amount`; discount is
  stamped into `payment_note`. Unexplained shortfalls still alert + stay unpaid.
- **Pages** (`/headshots/`, `/digitals/`): gold sale bar pinned below the fixed
  nav (CSS default top offset + JS refinement — never depend on cross-file CDN
  freshness: GitHub Pages' ~10-min edge cache served fresh HTML with stale JS
  during rollout) + hint in the `#book` section, both `[hidden]` until
  `js/sale.js` reveals them inside the window (client-side time gate — no 7pm
  deploy needed, self-expires). Preview anytime with `?sale=preview`.
  Base prices + JSON-LD untouched.
- **E2E-verified live**: real cs_live_ session showed `$100 → J3PRODUCTIONS
  −$20.00 → Total due $80.00`; widget confirm step verified on production;
  test bookings deleted, probe promo codes deactivated.

## Teardown
Nothing to do. Banner and promo-field gating expire by timestamp; the Stripe
code expires server-side. Repo copies of the sale markup can be removed any
time after 2026-08-08.
