-- TAYLORMADE/CREATIVE — payment safety net
-- Written 2026-07-27. NOT YET APPLIED — run this in the Supabase SQL editor.
--
-- WHY THIS EXISTS
-- On 2026-07-16 a client paid $100 for a digitals session. Stripe took the money,
-- the webhook never reconciled it, the invoice stayed 'sent', the booking stayed
-- 'pending_payment', its 30-minute hold expired, the slot was silently released,
-- and nobody — client or Nelson — was told anything. It surfaced two days later
-- only because the client sent a DM.
--
-- The hardened bk-stripe-webhook (v8) makes the webhook's OWN failure modes loud.
-- This migration is the backstop for the case the webhook cannot cover: the webhook
-- never runs at all (endpoint disabled, wrong mode, wrong event subscription, or a
-- signing-secret mismatch that rejects every delivery at the door). It watches the
-- database for the SYMPTOM instead, so a missed payment can never again go
-- unnoticed for days.
--
-- It deliberately does NOT talk to Stripe. It needs no API key and no deployed
-- function, which is exactly why it keeps working when the rest of the payment
-- path is broken.
--
-- It watches for two distinct failures:
--   'payment_stuck'   — a hold expired without the invoice ever being paid.
--   'payment_orphan'  — the invoice IS paid but the booking never became
--                       confirmed. That is the worse case: money is in the bank
--                       and no shoot is on the calendar.

begin;

-- One alert per booking per kind, ever. Without this the cron would re-alert on
-- the same abandoned checkout every 15 minutes, forever, and Nelson would learn
-- to ignore the channel — which defeats the entire point.
create table if not exists bk_payment_alerts (
  booking_id  uuid        not null references bk_bookings(id) on delete cascade,
  kind        text        not null,
  alerted_at  timestamptz not null default now(),
  primary key (booking_id, kind)
);

-- Staff-only bookkeeping. Nothing anon/authenticated should ever read or write
-- it: a public insert could pre-seed a booking_id and permanently suppress the
-- alert for that booking.
alter table bk_payment_alerts enable row level security;
revoke all on table bk_payment_alerts from anon, authenticated;

create or replace function bk_alert_stuck_payments()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer := 0;
  r record;
begin
  for r in
    select b.id            as booking_id,
           b.starts_at,
           b.status        as booking_status,
           b.invoice_id,
           i.status        as invoice_status,
           p.client_name,
           p.client_email,
           s.name          as service_name,
           case
             when i.status = 'paid' then 'payment_orphan'
             else 'payment_stuck'
           end             as alert_kind
      from bk_bookings b
      join bk_projects  p on p.id = b.project_id
      join bk_services  s on s.id = b.service_id
      join bk_invoices  i on i.id = b.invoice_id
     where b.status = 'pending_payment'
       and b.expires_at is not null
       and b.expires_at < now()
       -- 7 days, not 24 hours: a weekend outage, a disabled endpoint, or simply
       -- nobody looking on a Friday must not create a permanent blind spot.
       -- The dedupe key makes a wide window free of extra noise.
       and b.expires_at > now() - interval '7 days'
       and not exists (
         select 1 from bk_payment_alerts a
          where a.booking_id = b.id
            and a.kind = case when i.status = 'paid' then 'payment_orphan' else 'payment_stuck' end
       )
  loop
    insert into bk_payment_alerts (booking_id, kind)
    values (r.booking_id, r.alert_kind)
    -- a manual run racing the cron must not abort the whole sweep
    on conflict (booking_id, kind) do nothing;

    if not found then
      continue;   -- another run already claimed this one
    end if;

    insert into bk_email_queue (kind, booking_id, payload)
    values (
      'nelson_alert',
      r.booking_id,
      jsonb_build_object(
        'type',           r.alert_kind,
        'client_name',    r.client_name,
        'client_email',   r.client_email,
        'service_name',   r.service_name,
        'invoice_id',     r.invoice_id,
        'invoice_status', r.invoice_status,
        'starts_at_ct',   to_char(r.starts_at at time zone 'America/Chicago', 'Dy Mon DD, YYYY at HH12:MI AM')
      )
    );
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke all on function bk_alert_stuck_payments() from public, anon, authenticated;

-- every 15 minutes; the mailer's own cron drains the queue right behind it
select cron.schedule(
  'bk-stuck-payment-sweep',
  '*/15 * * * *',
  $$select public.bk_alert_stuck_payments();$$
);

commit;

-- Verification (run after apply):
--   select bk_alert_stuck_payments();          -- returns 0 when nothing is stuck
--   select jobname, schedule, active from cron.job where jobname = 'bk-stuck-payment-sweep';
--   -- confirm the sweep is actually running (should be recent and status 'succeeded'):
--   select start_time, status, return_message from cron.job_run_details
--     where jobid = (select jobid from cron.job where jobname = 'bk-stuck-payment-sweep')
--     order by start_time desc limit 5;
--
-- To undo:
--   select cron.unschedule('bk-stuck-payment-sweep');
--   drop function bk_alert_stuck_payments();
--   drop table bk_payment_alerts;
