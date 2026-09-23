-- TAYLORMADE/CREATIVE — Birthday photoshoots: two new instant-book services
--
-- Offer (Nelson, 2026-09-23):
--   Mini shoot  $150 · 30 min · 1 look       · 3 edited photos
--   Full shoot  $350 · 60 min · 2+ looks     · 8 edited photos
-- deposit_cents NULL => bk_create_booking charges the full price at checkout,
-- exactly like digitals and headshots. legacy_service 'photography' so the
-- admin pipeline + proofing portal treat them as photo sessions.
--
-- Availability: 9am–9pm CT all 7 days, the same bk_service_hours override
-- headshots and digitals use. Blackouts, buffers, 24h min-notice and the
-- cross-service conflict check still apply — one shared production calendar.

begin;

insert into bk_services (slug, name, tagline, kind, legacy_service, duration_min, price_cents, deposit_cents, prep_notes, active, sort)
values
  ('birthday-mini', 'Birthday Shoot — Mini',
   'Mini birthday shoot — 30 minutes, 1 look, 3 edited photos. $150.',
   'session', 'photography', 30, 15000, null,
   'Bring your birthday outfit (one look) and any props you want in the shot: balloons, a crown or sash, a cake, a number sign. Come camera-ready on hair and makeup. After the shoot you''ll pick your 3 favorites from your proofing gallery for editing.',
   true, 12),
  ('birthday-full', 'Birthday Shoot — Full',
   'Full birthday shoot — 1 hour, 2+ looks, 8 edited photos. $350.',
   'session', 'photography', 60, 35000, null,
   'Bring two or more outfits and any props you want in the shot: balloons, a crown or sash, a cake, a number sign. Come camera-ready on hair and makeup. After the shoot you''ll pick your 8 favorites from your proofing gallery for editing.',
   true, 13)
on conflict (slug) do update
  set name = excluded.name, tagline = excluded.tagline, kind = excluded.kind,
      legacy_service = excluded.legacy_service, duration_min = excluded.duration_min,
      price_cents = excluded.price_cents, deposit_cents = excluded.deposit_cents,
      prep_notes = excluded.prep_notes, active = excluded.active, sort = excluded.sort;

-- 9am (540) to 9pm (1260), dow 0=Sun .. 6=Sat
insert into bk_service_hours (service_id, dow, start_min, end_min, active)
select s.id, d.dow, 540, 1260, true
  from bk_services s
  cross join (select generate_series(0, 6) as dow) d
 where s.slug in ('birthday-mini', 'birthday-full')
   and not exists (
     select 1 from bk_service_hours h
      where h.service_id = s.id and h.dow = d.dow
   );

commit;
