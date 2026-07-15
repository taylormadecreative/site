-- BK SERVICE HOURS — per-service booking windows layered over the global rules.
-- A service with active rows here uses its own weekly windows; every other service
-- keeps bk_availability_rules. All conflict math (buffers, blackouts, holds) is
-- unchanged and shared, so a digitals booking still blocks any other booking over
-- the same time and vice versa — one production calendar.
-- Seeded: digitals bookable 9:00am–9:00pm, 7 days a week.

create table if not exists public.bk_service_hours (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  service_id uuid not null references public.bk_services(id) on delete cascade,
  dow smallint not null check (dow between 0 and 6), -- 0 = Sunday
  start_min integer not null check (start_min between 0 and 1439),
  end_min integer not null check (end_min between 1 and 1440),
  active boolean not null default true,
  check (end_min > start_min)
);
create index if not exists bk_service_hours_service_idx on public.bk_service_hours(service_id);

alter table public.bk_service_hours enable row level security;
drop policy if exists bk_service_hours_staff on public.bk_service_hours;
create policy bk_service_hours_staff on public.bk_service_hours for all
  using (public.bk_is_staff()) with check (public.bk_is_staff());

-- Same signature and result shape as before; only the availability-rule source is
-- widened. bk_create_booking re-validates through this function, so the 9–9 window
-- is enforced server-side too.
create or replace function public.bk_open_slots(p_service text, p_from date default null, p_to date default null)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_svc bk_services%rowtype;
  v_tz text; v_step int; v_buffer int; v_notice int; v_advance int;
  v_today date; v_from date; v_to date;
  v_custom boolean;
  v_slots jsonb;
begin
  select * into v_svc from bk_services where slug = p_service and active;
  if not found then raise exception 'service not found'; end if;

  v_tz := coalesce((select value from bk_config where key = 'timezone'), 'America/Chicago');
  v_step := bk_cfg_int('slot_step_min', 30);
  v_buffer := bk_cfg_int('buffer_min', 30);
  v_notice := bk_cfg_int('min_notice_hours', 24);
  v_advance := bk_cfg_int('max_advance_days', 60);

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
        and tstzrange(bk.starts_at - make_interval(mins => v_buffer),
                      bk.starts_at + make_interval(mins => bk.duration_min + v_buffer))
            && tstzrange(s.slot_start, s.slot_start + make_interval(mins => v_svc.duration_min))
    );

  return jsonb_build_object(
    'service', jsonb_build_object('slug', v_svc.slug, 'name', v_svc.name, 'kind', v_svc.kind,
      'duration_min', v_svc.duration_min, 'price_cents', v_svc.price_cents,
      'deposit_cents', v_svc.deposit_cents),
    'timezone', v_tz, 'from', v_from, 'to', v_to, 'slots', v_slots);
end $$;

-- Digitals: self-serve 9am–9pm, every day. Trim days/hours anytime in
-- schedule.html or by editing bk_service_hours.
insert into public.bk_service_hours (service_id, dow, start_min, end_min)
select s.id, d.dow, 540, 1260
from bk_services s, generate_series(0, 6) as d(dow)
where s.slug = 'digitals'
  and not exists (select 1 from bk_service_hours h where h.service_id = s.id);
