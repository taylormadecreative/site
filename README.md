# taylormadecreative.net — flagship site + booking engine

The self-hosted replacement for the Squarespace site **and** HoneyBook. Clients pick a
real open time slot, pay online (Stripe), and get automatic confirmation, shoot-prep,
and reminder emails. Zero platform subscriptions: GitHub Pages + Supabase free tier +
Stripe per-transaction + Resend free tier.

## Surfaces
| URL | What |
|---|---|
| `/` | Flagship agency home (video, photo, AI, web, social, workshops) |
| `/book/` | Booking engine — instant-book sessions + project inquiries |
| `/video-production/` `/photography/` `/ai-creative/` `/web-design/` `/social-media/` `/workshops/` | SEO service pages |
| `/faqs/` | Full FAQ (FAQPage schema) |
| `/success/` | Post-payment confirmation |
| book.taylormadecreative.net/schedule.html | **Nelson's schedule panel** — availability, blackouts, services & pricing, bookings, email log |
| book.taylormadecreative.net/admin.html | Pipeline dashboard (projects, invoices, messages, galleries) |

## How a booking flows
1. `/book/` loads services via `bk_public_services`, open times via `bk_open_slots`
   (Tue–Sat 10–6 CT by default — **edit in the Schedule panel**, min notice 24 h, 60-day window).
2. Instant-book sessions call `bk_create_booking` → project + booking (30-min hold) +
   deposit invoice → `bk-create-checkout` → Stripe Checkout.
3. `bk-stripe-webhook` marks the invoice paid → DB triggers confirm the booking and queue
   emails: **confirmation** (instant), **prep** (3 days before, per-service notes),
   **reminder** (day before), plus a payment alert to Nelson.
4. `bk-mailer` (pg_cron, every 10 min + instant ping after payment) sends via Resend from
   hello@taylormadecreative.net.
5. Project inquiries use `bk_submit_inquiry` (ack email + Nelson alert automatic) and land
   in the existing admin pipeline; quoting/invoicing/portal delivery unchanged.

## Deploys
Push to `main` → GitHub Actions → Pages (same pipeline as the `book` repo; the legacy
Jekyll builder breaks on CNAME files, so never switch Pages back to "classic").

## GO-LIVE (the only manual steps, ~5 minutes)
1. **Squarespace → Settings → Domains → taylormadecreative.net → DNS settings**
   - Edit the `www` CNAME: `ext-sq.squarespace.com` → **`taylormadecreative.github.io`**
   - Edit the four apex `A` records (198.185.159.144/145, 198.49.23.144/145) →
     **185.199.108.153, 185.199.109.153, 185.199.110.153, 185.199.111.153**
   - Touch nothing else (MX, TXT, the `book` CNAME, Resend records all stay).
2. Add the custom domain to this repo: commit a `CNAME` file containing
   `www.taylormadecreative.net` (or `gh api repos/taylormadecreative/site/pages -X PUT -f cname=www.taylormadecreative.net`), enforce HTTPS once the cert issues.
3. Verify https://www.taylormadecreative.net loads, then:
   - **Cancel the Squarespace site subscription** (keep the domain/DNS — that part is free).
   - **Cancel HoneyBook** (pipeline lives at book.taylormadecreative.net/admin.html now).
4. Google Search Console: property already covers https://www.taylormadecreative.net/ —
   submit `sitemap.xml` after cutover.

## Backend (shared Supabase project `pgqdmnmessbbzyszjfvr`)
- Migrations in `supabase/migrations/` (applied): scheduling tables/RPCs + pg_cron mailer job.
- Edge functions in `supabase/functions/` (deployed): `bk-mailer`, `bk-stripe-webhook` v7,
  `bk-create-checkout` v8, `bk-setup-webhook` (retired tombstone — endpoint
  `we_1Tr3wQA2eIGiS0WsfxXjPGwa` provisioned 2026-07-08).
- Secrets in use: `STRIPE_SECRET_KEY`, `RESEND_API_KEY` (already set); webhook signing
  secret + mailer secret live in `bk_config` (DB, staff-only RLS).
