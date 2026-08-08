# 24-Hour J3 Productions Birthday Sale — 2026-08-07

Flash sale honoring Willie Johnson of J3 Productions (birthday 8/7). Approved by
Nelson 2026-08-07 ~6pm CT.

## Offer
- Window: **2026-08-07 7:00pm CT → 2026-08-08 7:00pm CT** (epochs 1786147200 / 1786233600).
- Code **J3PRODUCTIONS** at Stripe checkout = **$20 off**: Digitals $100 → $80, Headshots $150 → $130.
- Code is shown publicly in the page banners (Nelson's call). Buyers book during
  the window; the shoot itself is later (24h min-notice), copy sells that.

## Implementation
- **Stripe**: coupon `LQ62Ywk8` ($20 off, once) + promotion code
  `promo_1U1xwpA2eIGiS0WsA6DLSmPA` (`J3PRODUCTIONS`, expires_at = sale end).
  Created by one-shot `bk-setup-sale` fn (in repo, deployment deleted after use).
- **bk-create-checkout v9**: `allow_promotion_codes` only when the invoice's
  first line title matches /headshot|digital/i AND now < sale end. Auto-reverts.
- **bk-stripe-webhook v9**: reconciliation accepts
  `amount_total + total_details.amount_discount === invoice amount`; discount is
  stamped into `payment_note`. Unexplained shortfalls still alert + stay unpaid.
- **Pages** (`/headshots/`, `/digitals/`): gold sale bar above the nav + hint in
  the `#book` section, both `[hidden]` until `js/sale.js` reveals them inside the
  window (client-side time gate — no 7pm deploy needed, self-expires).
  Preview anytime with `?sale=preview`. Base prices + JSON-LD untouched.

## Teardown
Nothing to do. Banner and promo-field gating expire by timestamp; the Stripe
code expires server-side. Repo copies of the sale markup can be removed any
time after 2026-08-08.
