-- TAYLORMADE/CREATIVE — Headshots becomes the 2nd instant-book service
-- Applied to production 2026-07-27.
--
-- Context: `headshots` already existed as an inquiry-lane service (kind='project',
-- price_cents=null) since the 2026-07-08 seed. It had ZERO bookings, so converting
-- it in place is safe — no historical rows change meaning.
--
-- Offer (Nelson, 2026-07-27): $150 flat · 30 minutes · 1 look · full gallery to
-- choose from · 3 retouched finals · delivered in 48 hours.
-- deposit_cents stays NULL so bk_create_booking charges the full $150 up front
-- (v_kind = 'full'), exactly like digitals.
--
-- Availability: 9am–9pm CT all 7 days, same override pattern digitals uses.
-- bk_service_hours is per-service ALL-OR-NOTHING: the moment one active row
-- exists for a service, bk_open_slots stops consulting bk_availability_rules
-- for it entirely. Blackouts, buffers, min-notice and the cross-service conflict
-- check still apply, so headshots shares the one production calendar and cannot
-- double-book over a shoot or a studio rental.

begin;

update bk_services
   set kind          = 'session',
       price_cents   = 15000,      -- $150 flat
       deposit_cents = null,       -- null => charge the full amount at checkout
       duration_min  = 30,
       sort          = 11,         -- sits directly after digitals (10)
       tagline       = 'Professional headshots that open doors — $150 flat, booked online.',
       -- prep_notes had said "bring 2–3 tops", which contradicts the 1-look offer.
       prep_notes    = 'Bring the top you want to be seen in, plus one backup. Solid colors photograph best — busy patterns fight your face. Add a brush or touch-up kit if you use one. We''ll talk through how you want to come across before the first frame.'
 where slug = 'headshots';

-- 9am (540) to 9pm (1260), dow 0=Sun .. 6=Sat
insert into bk_service_hours (service_id, dow, start_min, end_min, active)
select s.id, d.dow, 540, 1260, true
  from bk_services s
  cross join (select generate_series(0, 6) as dow) d
 where s.slug = 'headshots'
   and not exists (
     select 1 from bk_service_hours h
      where h.service_id = s.id and h.dow = d.dow
   );

commit;

-- Verification (run after apply):
--   select slug, kind, price_cents, duration_min from bk_services where slug='headshots';
--     => headshots | session | 15000 | 30
--   select count(*) from bk_service_hours h join bk_services s on s.id=h.service_id
--    where s.slug='headshots' and h.active;
--     => 7
--   select jsonb_array_length((bk_open_slots('headshots', current_date, current_date+30))->'slots');
--     => a few hundred (24h min-notice still applies, so the first slot is >= tomorrow)
