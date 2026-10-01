-- TAYLORMADE/CREATIVE — Senior photo sessions (studio OR on location in DFW)
--   engine + inactive services; the switch-on and the Birthday Full price
--   change are in 20260930b_bk_senior_launch.sql (see ROLLOUT ORDER below)
--
-- Nelson, 2026-09-30:
--   Senior Mini  $150 · 30 min · 1 look   · 3 edited photos
--   Senior Full  $350 · 60 min · 2+ looks · 8 edited photos
--   Both paid in full at checkout. Studio or on location anywhere in DFW, same
--   price. On-location sessions block 1 hour of travel on each side.
--   "Full price for anything over $150" → Birthday Full ($350) drops its 50%
--   deposit and is paid in full at checkout (launch file). Birthday Mini is unchanged.
--
-- How travel works:
--   bk_services.location_ok  — the service may be shot on location (senior-* only)
--   bk_bookings.travel_min   — minutes of travel blocked on EACH side of the shoot
--                              (0 = studio; bk_config.travel_min, default 60, on location)
--   The gap required between two bookings is now
--     greatest(buffer_min, existing booking's travel, candidate's travel)
--   so studio-next-to-studio is exactly the old 30-minute buffer, and anything
--   next to an on-location shoot keeps a full hour clear for the drive.
--   A 60-min on-location shoot at 3pm holds 2pm–5pm against every other booking.
--
-- bk_open_slots(text,date,date) keeps its exact signature and grants (every
-- existing widget calls it); it now wraps bk_open_slots_where(..., false).
-- bk_create_booking keeps its signature: for a location_ok service, a non-blank
-- p_location means "on location" (stored as the booking's location, travel
-- blocked); blank means the studio (studio address stamped, no travel).
--
-- Also fixes: birthday bookings never stamped the studio address, so their
-- confirmation emails had no address although the page promises one (no
-- birthday booking existed yet, so no client was affected).
--
-- Existing birthday-full bookings with a scheduled balance are untouched:
-- bk-charge-balances works off each booking's own balance_cents snapshot.
--
-- ROLLOUT ORDER (scripts/apply-seniors.sh): this file installs the engine with
-- the senior services INACTIVE and does not touch birthday pricing. The site is
-- pushed next (so /book/ redirects senior-* to /senior-photos/ before they can
-- appear there), and only then 20260930b_bk_senior_launch.sql switches the
-- seniors on and drops the Birthday Full deposit. Re-running either file never
-- overwrites later edits made in schedule.html.

begin;
set local lock_timeout = '5s';   -- never queue the booking widgets behind a stuck session

-- ---------------------------------------------------------------- columns + config
alter table public.bk_services
  add column if not exists location_ok boolean not null default false;

alter table public.bk_bookings
  add column if not exists travel_min integer not null default 0;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'bk_bookings_travel_min_check') then
    alter table public.bk_bookings
      add constraint bk_bookings_travel_min_check check (travel_min between 0 and 240);
  end if;
end $$;

insert into public.bk_config (key, value) values ('travel_min', '60')
on conflict (key) do nothing;

-- ---------------------------------------------------------------- slots, aware of travel
create or replace function public.bk_open_slots_where(
  p_service text, p_from date default null, p_to date default null,
  p_on_location boolean default false)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_svc bk_services%rowtype;
  v_tz text; v_step int; v_buffer int; v_notice int; v_advance int; v_travel int;
  v_today date; v_from date; v_to date;
  v_custom boolean;
  v_slots jsonb;
begin
  select * into v_svc from bk_services where slug = p_service and active;
  if not found then raise exception 'service not found'; end if;
  if coalesce(p_on_location, false) and not v_svc.location_ok then
    raise exception 'on-location not offered for this service';
  end if;

  v_tz := coalesce((select value from bk_config where key = 'timezone'), 'America/Chicago');
  v_step := bk_cfg_int('slot_step_min', 30);
  v_buffer := bk_cfg_int('buffer_min', 30);
  v_notice := bk_cfg_int('min_notice_hours', 24);
  v_advance := bk_cfg_int('max_advance_days', 60);
  v_travel := case when coalesce(p_on_location, false) then least(greatest(bk_cfg_int('travel_min', 60), 0), 240) else 0 end;

  v_custom := exists (
    select 1 from bk_service_hours h where h.service_id = v_svc.id and h.active);

  v_today := (now() at time zone v_tz)::date;
  v_from := greatest(coalesce(p_from, v_today), v_today);
  v_to := least(coalesce(p_to, v_from + 41), v_today + v_advance, v_from + 41);
  if v_to < v_from then
    return jsonb_build_object('timezone', v_tz, 'slots', '[]'::jsonb);
  end if;

  select coalesce(jsonb_agg(to_jsonb(s.slot_start) order by s.slot_start), '[]'::jsonb)
  into v_slots
  from (
    select ((d.d::date)::timestamp + make_interval(mins => m.m)) at time zone v_tz as slot_start
    from generate_series(v_from::timestamp, v_to::timestamp, interval '1 day') as d(d)
    join (
      select h.dow, h.start_min, h.end_min
        from bk_service_hours h
       where v_custom and h.service_id = v_svc.id and h.active
      union all
      select r.dow, r.start_min, r.end_min
        from bk_availability_rules r
       where (not v_custom) and r.active
    ) r on r.dow = extract(dow from d.d)::int
    cross join lateral generate_series(r.start_min, r.end_min - v_svc.duration_min, v_step) as m(m)
    where not exists (
      select 1 from bk_blackouts b where d.d::date between b.starts_on and b.ends_on
    )
  ) s
  where s.slot_start >= now() + make_interval(hours => v_notice)
    and not exists (
      select 1 from bk_bookings bk
      where (bk.status = 'confirmed'
             or (bk.status = 'pending_payment' and bk.expires_at > now()))
        and tstzrange(bk.starts_at - make_interval(mins => greatest(v_buffer, bk.travel_min, v_travel)),
                      bk.starts_at + make_interval(mins => bk.duration_min + greatest(v_buffer, bk.travel_min, v_travel)))
            && tstzrange(s.slot_start, s.slot_start + make_interval(mins => v_svc.duration_min))
    );

  return jsonb_build_object(
    'service', jsonb_build_object('slug', v_svc.slug, 'name', v_svc.name, 'kind', v_svc.kind,
      'duration_min', v_svc.duration_min, 'price_cents', v_svc.price_cents,
      'deposit_cents', v_svc.deposit_cents),
    'timezone', v_tz, 'from', v_from, 'to', v_to, 'on_location', coalesce(p_on_location, false),
    'slots', v_slots);
end $$;

grant execute on function public.bk_open_slots_where(text, date, date, boolean) to anon, authenticated, service_role;

-- same signature, same grants: every existing widget keeps calling this
create or replace function public.bk_open_slots(p_service text, p_from date default null, p_to date default null)
returns jsonb
language sql stable security definer set search_path = public as $$
  select public.bk_open_slots_where(p_service, p_from, p_to, false);
$$;

-- ---------------------------------------------------------------- booking, aware of travel
create or replace function public.bk_create_booking(
  p_service text, p_starts_at timestamp with time zone, p_name text, p_email text,
  p_phone text default null, p_location text default null, p_details text default null,
  p_addons text[] default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_svc bk_services%rowtype;
  v_tz text; v_base int; v_amount int; v_kind text;
  v_project uuid; v_token uuid; v_booking uuid; v_invoice uuid;
  v_day date; v_open jsonb; v_weekend boolean;
  v_addon_lines jsonb := '[]'::jsonb;
  v_addon_total int := 0;
  v_addon_names text := '';
  r record; v_requested int;
  v_location text;
  v_on_location boolean := false;
  v_travel int := 0;
  v_place text;
begin
  if p_name is null or length(trim(p_name)) < 1 then raise exception 'name required'; end if;
  if p_email is null or p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'valid email required'; end if;
  if p_details is not null and length(p_details) > 4000 then raise exception 'details too long'; end if;

  select * into v_svc from bk_services where slug = p_service and active and kind = 'session';
  if not found then raise exception 'service not bookable'; end if;

  v_tz := coalesce((select value from bk_config where key = 'timezone'), 'America/Chicago');
  v_weekend := extract(dow from (p_starts_at at time zone v_tz))::int in (0, 6);
  v_base := case when v_weekend then coalesce(v_svc.weekend_price_cents, v_svc.price_cents)
                 else v_svc.price_cents end;
  v_amount := coalesce(v_svc.deposit_cents, v_base);
  if v_amount is null or v_amount <= 0 then raise exception 'service not bookable'; end if;
  v_kind := case when v_svc.deposit_cents is null then 'full' else 'deposit' end;

  -- location_ok services (senior-*): a typed location = on location, travel
  -- blocked both sides; blank = the studio. Edge whitespace (incl. non-breaking
  -- and zero-width spaces) is stripped, and a location only counts if it has a
  -- real letter or digit in it.
  v_place := regexp_replace(coalesce(p_location, ''), '^[\s\u00a0\u200b\ufeff]+|[\s\u00a0\u200b\ufeff]+$', '', 'g');
  if v_svc.location_ok and v_place ~ '[[:alnum:]]' then
    if length(v_place) > 200 then raise exception 'location too long'; end if;
    v_on_location := true;
    v_travel := least(greatest(bk_cfg_int('travel_min', 60), 0), 240);
  end if;

  -- studio sessions happen AT the studio: stamp the address so the emails carry it
  v_location := case
    when v_on_location then v_place
    when v_svc.slug like 'studio-%' or v_svc.slug like 'birthday-%' or v_svc.location_ok
         or v_svc.slug in ('digitals', 'headshots')
      then coalesce((select value from bk_config where key = 'studio_address'), p_location)
    else p_location end;

  -- add-ons: validate every requested slug, price server-side
  if p_addons is not null and array_length(p_addons, 1) > 0 then
    v_requested := (select count(distinct s) from unnest(p_addons) as s);
    for r in select * from bk_addons where active and slug = any(p_addons) order by sort loop
      v_addon_total := v_addon_total + coalesce(r.price_cents, 0);
      v_addon_lines := v_addon_lines || jsonb_build_object(
        'title', r.name || case when r.price_cents is null then ' — priced on request' else '' end,
        'amount_cents', coalesce(r.price_cents, 0));
      v_addon_names := v_addon_names || case when v_addon_names = '' then '' else ', ' end
        || r.name || case when r.price_cents is null then ' (priced on request)' else '' end;
    end loop;
    if (select count(*) from bk_addons where active and slug = any(p_addons)) <> v_requested then
      raise exception 'unknown add-on';
    end if;
  end if;

  -- one booking writer per calendar day: serializes every booking whose slot
  -- could overlap another (different start times + buffers), not just
  -- exact-instant collisions
  v_day := (p_starts_at at time zone v_tz)::date;
  perform pg_advisory_xact_lock(hashtextextended('bk_day:' || v_day::text, 42));

  -- the requested slot must still be open (with travel, if on location)
  v_open := bk_open_slots_where(p_service, v_day, v_day, v_on_location) -> 'slots';
  if not (v_open @> jsonb_build_array(to_jsonb(p_starts_at))) then
    raise exception 'slot no longer available';
  end if;

  insert into public.bk_projects
    (client_name, client_email, client_phone, service, title, event_date, event_time,
     location, details, referral_source)
  values
    (trim(p_name), lower(trim(p_email)), p_phone, v_svc.legacy_service,
     trim(p_name) || ' — ' || v_svc.name || case when v_on_location then ' (on location)' else '' end,
     v_day, trim(to_char(p_starts_at at time zone v_tz, 'FMHH12:MI AM')),
     v_location,
     case when v_addon_names = '' then p_details
          else 'Add-ons: ' || v_addon_names || E'\n\n' || coalesce(p_details, '') end,
     'website-booking')
  returning id, access_token into v_project, v_token;

  insert into public.bk_bookings
    (project_id, service_id, starts_at, duration_min, status, expires_at, location, travel_min)
  values
    (v_project, v_svc.id, p_starts_at, v_svc.duration_min, 'pending_payment',
     now() + interval '30 minutes', v_location, v_travel)
  returning id into v_booking;

  insert into public.bk_invoices (project_id, title, line_items, amount_cents, kind, status, due_date)
  values
    (v_project,
     case when v_kind = 'full' then 'Session payment' else 'Booking deposit' end,
     jsonb_build_array(jsonb_build_object(
       'title', v_svc.name || ' · ' || to_char(p_starts_at at time zone v_tz, 'FMMon DD, YYYY FMHH12:MI AM')
                || case when v_on_location then ' · on location' else '' end,
       'amount_cents', v_amount)) || v_addon_lines,
     v_amount + v_addon_total, v_kind, 'sent', v_day)
  returning id into v_invoice;

  update public.bk_bookings set invoice_id = v_invoice where id = v_booking;

  return jsonb_build_object(
    'project_id', v_project, 'token', v_token, 'booking_id', v_booking,
    'invoice_id', v_invoice, 'amount_cents', v_amount + v_addon_total,
    'addon_cents', v_addon_total,
    'starts_at', p_starts_at, 'service_name', v_svc.name,
    'on_location', v_on_location);
end $$;

-- ---------------------------------------------------------------- the two senior services
-- inserted INACTIVE; 20260930b_bk_senior_launch.sql switches them on after the
-- site is live. "do nothing" on conflict so a re-run never resets later edits.
insert into public.bk_services
  (slug, name, tagline, kind, legacy_service, duration_min, price_cents, deposit_cents,
   auto_balance, location_ok, prep_notes, active, sort)
values
  ('senior-mini', 'Senior Photos — Mini',
   'Mini senior session — 30 minutes, 1 look, 3 edited photos. Studio or on location in DFW. $150.',
   'session', 'photography', 30, 15000, null, false, true,
   'Bring your outfit (one look) and anything that tells your story: your cap and gown, a letterman jacket, a jersey, an instrument. Come camera-ready on hair and makeup. After the shoot you''ll pick your 3 favorites from your proofing gallery for editing.',
   false, 15),
  ('senior-full', 'Senior Photos — Full',
   'Full senior session — 1 hour, 2+ looks, 8 edited photos. Studio or on location in DFW. $350.',
   'session', 'photography', 60, 35000, null, false, true,
   'Bring two or more outfits and anything that tells your story: your cap and gown, a letterman jacket, a jersey, an instrument. Come camera-ready on hair and makeup. After the shoot you''ll pick your 8 favorites from your proofing gallery for editing.',
   false, 16)
on conflict (slug) do nothing;

-- 9am (540) to 9pm (1260), dow 0=Sun .. 6=Sat — same hours as birthday/headshots
insert into public.bk_service_hours (service_id, dow, start_min, end_min, active)
select s.id, d.dow, 540, 1260, true
  from public.bk_services s
  cross join (select generate_series(0, 6) as dow) d
 where s.slug in ('senior-mini', 'senior-full')
   and not exists (
     select 1 from public.bk_service_hours h
      where h.service_id = s.id and h.dow = d.dow
   );

-- ---------------------------------------------------------------- birthday bookings made before this: stamp the studio address
update public.bk_bookings b
   set location = (select value from public.bk_config where key = 'studio_address')
  from public.bk_services s
 where s.id = b.service_id and s.slug like 'birthday-%'
   and b.location is null and b.starts_at > now()
   and exists (select 1 from public.bk_config where key = 'studio_address');
update public.bk_projects p
   set location = b.location
  from public.bk_bookings b join public.bk_services s on s.id = b.service_id
 where b.project_id = p.id and s.slug like 'birthday-%'
   and p.location is null and b.location is not null and b.starts_at > now();

notify pgrst, 'reload schema';

commit;
