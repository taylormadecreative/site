-- TAYLORMADE/CREATIVE — 50% deposit now, balance auto-charged the day before
--
-- Nelson, 2026-09-23: birthday shoots take a 50% deposit at booking and the
-- remaining balance comes off the same card automatically the day before.
--
-- How it fits together:
--   1. bk_services.deposit_cents set  → bk_create_booking charges the deposit
--      (unchanged function; it already supports kind='deposit').
--   2. bk_bookings.balance_cents is snapshotted at insert (this trigger), so a
--      later price edit can never change what an existing client owes.
--   3. bk-create-checkout v11 saves the card (setup_future_usage=off_session)
--      on deposit checkouts that carry a balance, and tells the buyer the
--      balance amount + date on the Stripe page.
--   4. bk-charge-balances (hourly cron below) charges confirmed bookings whose
--      shoot is < 24h away, off-session, against that saved card.
--        success → balance invoice paid → client receipt + Nelson payment alert
--        failure → balance invoice 'sent' (payable in the portal) → client
--                  "balance due" email with the portal link + Nelson alert
--   5. A cancelled booking is never charged (the job only takes 'confirmed'),
--      and cancelling voids any still-unpaid balance invoice.
--   6. Only services with auto_balance = true get any of this (birthday-* for
--      now) — a deposit set on any other service keeps today's behaviour.
--   balance_status: scheduled → charging → paid | failed (client got a pay
--   link) | attention (Nelson alerted, client NOT emailed) | waived (already
--   paid another way / invoice voided — never charged)

begin;

-- ---------------------------------------------------------------- columns
alter table public.bk_services
  add column if not exists auto_balance boolean not null default false;

alter table public.bk_bookings
  add column if not exists balance_cents        integer check (balance_cents is null or balance_cents > 0),
  add column if not exists balance_status       text check (balance_status is null or balance_status in
                                                   ('scheduled','charging','paid','failed','attention','waived')),
  add column if not exists balance_invoice_id   uuid references public.bk_invoices(id) on delete set null,
  add column if not exists balance_attempted_at timestamptz,
  add column if not exists balance_error        text,
  add column if not exists balance_attempts     integer not null default 0,
  add column if not exists balance_payment_intent text;

create index if not exists bk_bookings_balance_due_idx
  on public.bk_bookings(starts_at) where balance_status = 'scheduled';

-- ---------------------------------------------------------------- snapshot the balance at booking time
create or replace function public.bk_booking_set_balance() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_svc bk_services%rowtype;
  v_tz text;
  v_price int;
begin
  select * into v_svc from bk_services where id = new.service_id;
  if not found or v_svc.deposit_cents is null or not v_svc.auto_balance then return new; end if;
  v_tz := coalesce((select value from bk_config where key = 'timezone'), 'America/Chicago');
  v_price := case when extract(dow from (new.starts_at at time zone v_tz))::int in (0, 6)
                  then coalesce(v_svc.weekend_price_cents, v_svc.price_cents)
                  else v_svc.price_cents end;
  if v_price is not null and v_price > v_svc.deposit_cents then
    new.balance_cents  := v_price - v_svc.deposit_cents;
    new.balance_status := 'scheduled';
  end if;
  return new;
end $$;

drop trigger if exists bk_booking_set_balance on public.bk_bookings;
create trigger bk_booking_set_balance before insert on public.bk_bookings
  for each row execute function public.bk_booking_set_balance();

-- ---------------------------------------------------------------- balance invoice paid (auto OR by the client in the portal)
create or replace function public.bk_on_balance_paid() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.bk_bookings
     set balance_status = 'paid', balance_error = null
   where balance_invoice_id = new.id and balance_status is distinct from 'paid';
  return new;
end $$;

drop trigger if exists bk_balance_paid on public.bk_invoices;
create trigger bk_balance_paid after update on public.bk_invoices
  for each row when (new.kind = 'balance' and new.status = 'paid' and old.status is distinct from 'paid')
  execute function public.bk_on_balance_paid();

-- ---------------------------------------------------------------- cancelled booking: nothing left to pay
-- BEFORE update so the booking's own balance_status flips in the same write
-- (a scheduled balance on a cancelled booking must never be charged or swept)
create or replace function public.bk_on_booking_cancelled_balance() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.balance_status = 'scheduled' then
    new.balance_status := 'waived';
    new.balance_error  := 'booking cancelled';
  end if;
  if new.balance_invoice_id is not null then
    update public.bk_invoices set status = 'void'
     where id = new.balance_invoice_id and status in ('draft','sent');
  end if;
  return new;
end $$;

drop trigger if exists bk_booking_cancelled_balance on public.bk_bookings;
create trigger bk_booking_cancelled_balance before update on public.bk_bookings
  for each row when (new.status = 'cancelled' and old.status is distinct from 'cancelled')
  execute function public.bk_on_booking_cancelled_balance();

-- ---------------------------------------------------------------- no "Your quote is ready" email for an auto-balance invoice
-- (a declined auto-charge flips its invoice to 'sent' so it's payable in the
-- portal; bk-charge-balances sends its own "balance due" email instead)
create or replace function public.bk_on_invoice_sent() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- same-transaction-as-project = auto-created by bk_create_booking; skip
  if exists (select 1 from public.bk_projects p
             where p.id = new.project_id and p.created_at = new.created_at) then
    return new;
  end if;
  -- auto-balance invoice: bk-charge-balances handles the client email
  if new.kind = 'balance' and exists (select 1 from public.bk_bookings b
                                      where b.balance_invoice_id = new.id) then
    return new;
  end if;
  insert into public.bk_email_queue (project_id, kind, payload)
  values (new.project_id, 'invoice_sent',
          jsonb_build_object('invoice_id', new.id));
  return new;
end $$;

-- ---------------------------------------------------------------- two new client email kinds
-- rebuilt from the LIVE constraint so no existing kind is ever dropped
do $$
declare v_def text;
begin
  select pg_get_constraintdef(oid) into v_def
    from pg_constraint where conname = 'bk_email_queue_kind_check';
  if v_def is not null and v_def not like '%balance_charged%' then
    execute 'alter table public.bk_email_queue drop constraint bk_email_queue_kind_check';
    execute 'alter table public.bk_email_queue add constraint bk_email_queue_kind_check '
         || replace(v_def, 'ARRAY[', 'ARRAY[''balance_charged''::text, ''balance_failed''::text, ');
  end if;
  select pg_get_constraintdef(oid) into v_def
    from pg_constraint where conname = 'bk_email_queue_kind_check';
  if v_def is null or v_def not like '%balance_charged%' or v_def not like '%contract_sent%' then
    raise exception 'email kind constraint rebuild failed: %', v_def;
  end if;
end $$;

-- ---------------------------------------------------------------- birthday shoots: 50% deposit
update public.bk_services set deposit_cents = 7500,  auto_balance = true where slug = 'birthday-mini';   -- of $150
update public.bk_services set deposit_cents = 17500, auto_balance = true where slug = 'birthday-full';   -- of $350

-- ---------------------------------------------------------------- hourly charge run (secret read at fire time, never stored in the job)
select cron.unschedule('bk-charge-balances') where exists (select 1 from cron.job where jobname = 'bk-charge-balances');
select cron.schedule(
  'bk-charge-balances',
  '7 * * * *',
  $cron$
  select net.http_post(
    url := 'https://pgqdmnmessbbzyszjfvr.supabase.co/functions/v1/bk-charge-balances',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-mailer-secret', (select value from public.bk_config where key = 'mailer_secret')
    ),
    body := '{}'::jsonb
  )
  $cron$
);

commit;
