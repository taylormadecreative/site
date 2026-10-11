-- JENEL STUDIOS — Podcast sessions + the $100 episode edit
--
-- 2026-10-10, Nelson: "i want to offer podcast bookings and thats $65/hr
-- weekdays and $75/hr on weekends and they can get their videos edited by me
-- for $100 they need to have their logos and branding at the time of the shoot
-- and its a 3-4 day turnaround." Confirmed in session: Nelson's set, cameras and
-- mics, and he runs the recording; the $100 edit = one full episode.
--
--   studio-podcast  instant-book session on the Jenel booking page, 60 min,
--                   $65 weekday / $75 weekend (weekend pricing is already
--                   server-side in bk_create_booking). studio-* prefix keeps it
--                   off the www booking page and stamps the studio address.
--   podcast-edit    $100 add-on, offered ONLY on studio-podcast.
--
-- Add-ons were global (every studio booking saw all gear), so bk_addons gains a
-- `services` list. The default is the three room-rental blocks, so the existing
-- gear rows (and any gear added later from the schedule admin) stay on rentals.
-- NULL = offered on every studio service. bk_public_addons exposes the list and
-- bk_create_booking rejects an add-on that isn't offered on the booked service.
--
-- Idempotent: re-running updates the rows in place.

begin;

alter table bk_addons add column if not exists services text[]
  default array['studio-hourly', 'studio-half-day', 'studio-full-day'];

insert into bk_services
  (slug, name, tagline, kind, legacy_service, duration_min, price_cents,
   weekend_price_cents, prep_notes, active, sort, location_ok)
values
  ('studio-podcast', 'Podcast Session — Hourly',
   'Our set, cameras, and mics, and we run the recording. $65/hr weekdays · $75/hr weekends. Add a full-episode edit for $100.',
   'session', 'brand_content', 60, 6500, 7500,
   'Your confirmation email has the exact address and access details. The podcast set, cameras, and mics are ours, and we run the recording, so bring your guests and your topic. If you added the edit, have your logo and branding with you at the shoot; your edited episode comes back within 3–4 days. Your session runs inside your booked time.',
   true, 15, false)
on conflict (slug) do update
   set name                = excluded.name,
       tagline             = excluded.tagline,
       kind                = excluded.kind,
       legacy_service      = excluded.legacy_service,
       duration_min        = excluded.duration_min,
       price_cents         = excluded.price_cents,
       weekend_price_cents = excluded.weekend_price_cents,
       prep_notes          = excluded.prep_notes,
       active              = true,
       sort                = excluded.sort;

insert into bk_addons (slug, name, price_cents, active, sort, services)
values ('podcast-edit', 'Episode edit (one full episode)', 10000, true, 60, array['studio-podcast'])
on conflict (slug) do update
   set name = excluded.name, price_cents = excluded.price_cents,
       active = true, sort = excluded.sort, services = excluded.services;

CREATE OR REPLACE FUNCTION public.bk_public_addons()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(jsonb_agg(jsonb_build_object(
    'slug', slug, 'name', name, 'price_cents', price_cents, 'services', services
  ) order by sort, name), '[]'::jsonb)
  from bk_addons where active;
$function$;

CREATE OR REPLACE FUNCTION public.bk_create_booking(p_service text, p_starts_at timestamp with time zone, p_name text, p_email text, p_phone text DEFAULT NULL::text, p_location text DEFAULT NULL::text, p_details text DEFAULT NULL::text, p_addons text[] DEFAULT NULL::text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    for r in select * from bk_addons where active and slug = any(p_addons)
        and (services is null or p_service = any(services)) order by sort loop
      v_addon_total := v_addon_total + coalesce(r.price_cents, 0);
      v_addon_lines := v_addon_lines || jsonb_build_object(
        'title', r.name || case when r.price_cents is null then ' — priced on request' else '' end,
        'amount_cents', coalesce(r.price_cents, 0));
      v_addon_names := v_addon_names || case when v_addon_names = '' then '' else ', ' end
        || r.name || case when r.price_cents is null then ' (priced on request)' else '' end;
    end loop;
    if (select count(*) from bk_addons where active and slug = any(p_addons)
        and (services is null or p_service = any(services))) <> v_requested then
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
end $function$;

commit;
