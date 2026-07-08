# taylormadecreative.net Rebuild — Design Spec (2026-07-08)

## Goal
Replace the Squarespace site + HoneyBook with a self-hosted flagship agency site at
**www.taylormadecreative.net** where clients schedule shoots (real date/time slots), pay
deposits through Stripe, and receive automated confirmation + prep + reminder emails.
Zero recurring platform fees: GitHub Pages (free) + existing Supabase project (free tier)
+ Stripe (per-transaction only) + Resend (free tier, already configured).
Positioning: high-end agency — AI content, websites, videography, photography,
social media content, live workshops. SEO/AEO powerhouse.

## Architecture (chosen over: extending book repo; SaaS scheduler embed)
- **Front-end:** new repo `taylormadecreative/site` (local `~/taylormade-site`), static
  HTML/CSS/JS, deployed via GitHub Actions Pages workflow (same proven pipeline as `book`
  repo — legacy Jekyll builder breaks on CNAME files). Custom domain www.taylormadecreative.net
  after DNS flip; preview at taylormadecreative.github.io/site/.
- **Backend:** SHARED Supabase project `taylormade-studio` (pgqdmnmessbbzyszjfvr) — extends the
  live `bk_*` booking system (projects/invoices/messages/portal/admin) rather than duplicating it.
  The existing client portal + admin at book.taylormadecreative.net stay the delivery/CRM layer.
- **Payments:** existing `bk-create-checkout` + `bk-stripe-webhook` edge functions.
  STRIPE_SECRET_KEY is already set (probe returned 404 not 503). Webhook endpoint for bk-
  provisioned via a one-shot `bk-setup-webhook` (pattern proven by retired `ea-setup-webhook`).
- **Email:** Resend (RESEND_API_KEY already set; sends from hello@taylormadecreative.net —
  proven by academy stack). New `bk-mailer` edge function + `bk_email_queue` table +
  pg_cron (to enable) → pg_net (installed) invoking bk-mailer every 10 min.

## Scheduling data model (new, all in one migration)
- `bk_services` — slug, name, tagline, kind ('session' = instant-book | 'project' = inquiry),
  duration_min, price_cents (nullable), deposit_cents (nullable), prep_notes, active, sort.
  Seed ONLY documented pricing: Digitals $100 flat (authorized public price). Web design tiers
  ($1,200/$2,000/$3,500/$6,000+) shown on the web-design page as documented. Everything else
  = "custom quote" project lane. Nelson edits prices in admin.
- `bk_availability_rules` — dow, start_min, end_min, active. Seeded defaults (Tue–Sat 10:00–18:00
  America/Chicago) FLAGGED for Nelson to adjust in admin.
- `bk_blackouts` — date ranges Nelson blocks off.
- `bk_bookings` — project_id FK, service_id FK, starts_at timestamptz, duration_min, status
  ('pending_payment','confirmed','completed','cancelled'), location, created_at. Pending holds
  expire after 30 min (ignored by slot math after expiry).
- `bk_email_queue` — booking/project FK, kind ('confirmation','prep','reminder','nelson_alert',
  'inquiry_ack'), send_at, sent_at, attempts, last_error, payload jsonb.
- `bk_config` — key/value: min_notice_hours (24), max_advance_days (60), slot_step_min (30),
  buffer_min (30), timezone (America/Chicago).
- RPCs (SECURITY DEFINER, anon-granted, matching bk_submit_inquiry conventions):
  - `bk_open_slots(service_slug, from_date, to_date)` → open start times: rules − blackouts −
    live bookings − buffer − min-notice/max-advance. All slot math in America/Chicago.
  - `bk_create_booking(...)` → project + booking(pending_payment) + deposit invoice(sent) →
    returns ids + token; front-end hands off to bk-create-checkout → Stripe Checkout.
  - `bk_submit_inquiry` (existing) wrapped so project-lane inquiries also queue `inquiry_ack`
    + `nelson_alert` emails.
- Webhook flow: checkout.session.completed → invoice paid → booking confirmed → queue
  confirmation (now) + prep (T-3d) + reminder (T-1d) + nelson_alert → bk-mailer sends via Resend.

## Site map (SEO hub-and-spoke; mirrors old Squarespace paths where they ranked)
- `/` — flagship home: intro animation, hero, services overview, selected work, process,
  testimonials (real: Kerry, Stevona, Kristina L.), about, FAQ teaser, booking CTA.
- `/video-production/`, `/photography/` (headshots + product + branding sections w/ anchors),
  `/ai-creative/`, `/web-design/` (documented tier pricing), `/social-media/`, `/workshops/`.
- `/book/` — the booking engine. Two lanes: **Book a session** (service → calendar → time →
  details → Stripe deposit) and **Start a project** (inquiry wizard → portal, Nelson quotes).
- `/faqs/`, `/success/` (post-payment), `404.html` with JS redirect map from old paths
  (/headshots-dallas-fort-worth → /photography/#headshots, /faqs-1 → /faqs/, etc.).
- Client portal/gallery links → book.taylormadecreative.net (already live).

## SEO/AEO (baseline to beat: AEO 5.3/10, Lighthouse Perf 32, LCP 55s, pos 6.6)
- Static + inline critical CSS + lazy media + preloaded self-hosted-ready fonts → Perf 95+.
- JSON-LD per page: ProfessionalService (areaServed DFW — NO street address, studio location
  is private), Service, FAQPage, VideoObject (films), Person (Nelson), BreadcrumbList.
- Question-form H2/H3s, citable first-paragraph definitions, entity-first copy
  ("Taylormade Creative is a Dallas–Fort Worth creative agency…").
- sitemap.xml, robots.txt, llms.txt + llms-full.txt (AEO), canonical tags, OG/Twitter cards.
- GA4 G-PS0H5W3ZX7 carried over. GSC property (URL-format) stays valid after cutover.
- Accurate credentials only: 14 yrs design/creative direction, shipped iOS apps (Run It UP! etc.).

## Design language
Black / white / gold (locked TC palette), evolution of the book site's cinematic "Viewfinder"
family — Unbounded + Familjen Grotesk + Martian Mono. Scroll-first (no exotic nav), fire
load-in intro, GSAP-style scroll choreography, magnetic CTAs, film-grain texture (no
mix-blend-mode full-screen layers), `overflow-x: clip` on html+body. Mobile-first.

## Admin (extends ~/taylormade-book/admin.html)
New Schedule tab: upcoming bookings, availability rules editor, blackouts, services/pricing
editor, email queue log. Deploys on push to book repo.

## Go-live (the only Nelson steps)
1. Squarespace DNS: www CNAME ext-sq.squarespace.com → taylormadecreative.github.io;
   apex A → 185.199.108/109/110/111.153. (Domain + DNS remain free after canceling the
   Squarespace *site* subscription; MX/TXT/Resend records untouched.)
2. Then cancel Squarespace site plan + HoneyBook.

## Testing
End-to-end via Playwright: slot fetch, booking creation, Stripe session creation (no live
charge — session created then abandoned; test rows voided/cleaned), email queue processing
(real test email to taylormademd@gmail.com), mobile + desktop screenshots, then the standing
4-agent review (Marketing / Web Dev / UI-UX / Art Direction) before delivery.
