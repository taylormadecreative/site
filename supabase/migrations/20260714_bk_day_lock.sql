-- BK DAY LOCK — harden the instant-booking race guard.
-- The advisory lock used to key on the exact start instant, so two concurrent
-- bookings at DIFFERENT times whose durations+buffers overlap could both pass
-- the open-slot re-check. Locking on the (Central) calendar day serializes all
-- writers that could possibly conflict. Function body otherwise identical to
-- the live definition (add-ons, weekend pricing, studio address stamping).

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

  -- studio rentals happen AT the studio: stamp the address so the emails carry it
  v_location := case when v_svc.slug like 'studio-%'
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

  -- the requested slot must still be open
  v_open := bk_open_slots(p_service, v_day, v_day) -> 'slots';
  if not (v_open @> jsonb_build_array(to_jsonb(p_starts_at))) then
    raise exception 'slot no longer available';
  end if;

  insert into public.bk_projects
    (client_name, client_email, client_phone, service, title, event_date, event_time,
     location, details, referral_source)
  values
    (trim(p_name), lower(trim(p_email)), p_phone, v_svc.legacy_service,
     trim(p_name) || ' — ' || v_svc.name,
     v_day, trim(to_char(p_starts_at at time zone v_tz, 'FMHH12:MI AM')),
     v_location,
     case when v_addon_names = '' then p_details
          else 'Add-ons: ' || v_addon_names || E'\n\n' || coalesce(p_details, '') end,
     'website-booking')
  returning id, access_token into v_project, v_token;

  insert into public.bk_bookings
    (project_id, service_id, starts_at, duration_min, status, expires_at, location)
  values
    (v_project, v_svc.id, p_starts_at, v_svc.duration_min, 'pending_payment',
     now() + interval '30 minutes', v_location)
  returning id into v_booking;

  insert into public.bk_invoices (project_id, title, line_items, amount_cents, kind, status, due_date)
  values
    (v_project,
     case when v_kind = 'full' then 'Session payment' else 'Booking deposit' end,
     jsonb_build_array(jsonb_build_object(
       'title', v_svc.name || ' · ' || to_char(p_starts_at at time zone v_tz, 'FMMon DD, YYYY FMHH12:MI AM'),
       'amount_cents', v_amount)) || v_addon_lines,
     v_amount + v_addon_total, v_kind, 'sent', v_day)
  returning id into v_invoice;

  update public.bk_bookings set invoice_id = v_invoice where id = v_booking;

  return jsonb_build_object(
    'project_id', v_project, 'token', v_token, 'booking_id', v_booking,
    'invoice_id', v_invoice, 'amount_cents', v_amount + v_addon_total,
    'addon_cents', v_addon_total,
    'starts_at', p_starts_at, 'service_name', v_svc.name);
end $function$

