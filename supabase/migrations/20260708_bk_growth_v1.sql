-- BK GROWTH v1 — marketing/newsletters, revenue tracking, and e-sign contracts
-- for the Taylormade Creative brand (parallel to the academy's ea_ stack).

-- ============ marketing: subscribers ============
create table public.bk_subscribers (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  email text not null unique check (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  name text check (name is null or length(name) <= 120),
  source text not null default 'website', -- website | booking | inquiry | client | import
  token uuid not null default gen_random_uuid(), -- unsubscribe token
  unsubscribed_at timestamptz
);
create index bk_subscribers_active_idx on public.bk_subscribers(email) where unsubscribed_at is null;

-- ============ marketing: campaigns ============
create table public.bk_campaigns (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  subject text not null check (length(subject) between 2 and 200),
  preheader text check (preheader is null or length(preheader) <= 200),
  body text not null, -- simple markdown-ish: blank-line paragraphs, ## headings, [label](url) links
  status text not null default 'draft' check (status in ('draft','sending','sent')),
  sent_at timestamptz,
  sent_count integer not null default 0,
  total_count integer not null default 0
);
-- per-recipient send log: resumable + duplicate-proof
create table public.bk_campaign_sends (
  campaign_id uuid not null references public.bk_campaigns(id) on delete cascade,
  subscriber_id uuid not null references public.bk_subscribers(id) on delete cascade,
  sent_at timestamptz not null default now(),
  primary key (campaign_id, subscriber_id)
);

-- ============ contracts ============
create table public.bk_contract_templates (
  id uuid primary key default gen_random_uuid(),
  updated_at timestamptz not null default now(),
  name text not null,
  body text not null
);
create table public.bk_contracts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  project_id uuid not null references public.bk_projects(id) on delete cascade,
  title text not null default 'Service Agreement',
  body text not null,
  status text not null default 'draft' check (status in ('draft','sent','signed','void')),
  sent_at timestamptz,
  signed_at timestamptz,
  signer_name text,
  signed_ip text,
  signed_ua text,
  body_sha256 text -- integrity fingerprint captured at signing
);
create index bk_contracts_project_idx on public.bk_contracts(project_id);

-- email kinds for contract delivery
alter table public.bk_email_queue drop constraint bk_email_queue_kind_check;
alter table public.bk_email_queue add constraint bk_email_queue_kind_check
  check (kind in ('confirmation','prep','reminder','nelson_alert','inquiry_ack',
                  'invoice_sent','new_message','contract_sent'));

-- ============ RLS (staff-only; public paths go through RPCs/functions) ============
alter table public.bk_subscribers enable row level security;
alter table public.bk_campaigns enable row level security;
alter table public.bk_campaign_sends enable row level security;
alter table public.bk_contract_templates enable row level security;
alter table public.bk_contracts enable row level security;

create policy bk_subscribers_staff on public.bk_subscribers for all
  using (public.bk_is_staff()) with check (public.bk_is_staff());
create policy bk_campaigns_staff on public.bk_campaigns for all
  using (public.bk_is_staff()) with check (public.bk_is_staff());
create policy bk_campaign_sends_staff on public.bk_campaign_sends for all
  using (public.bk_is_staff()) with check (public.bk_is_staff());
create policy bk_contract_templates_staff on public.bk_contract_templates for all
  using (public.bk_is_staff()) with check (public.bk_is_staff());
create policy bk_contracts_staff on public.bk_contracts for all
  using (public.bk_is_staff()) with check (public.bk_is_staff());

-- ============ public: newsletter signup ============
create or replace function public.bk_subscribe(
  p_email text, p_name text default null, p_source text default 'website'
) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if p_email is null or p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'valid email required'; end if;
  insert into public.bk_subscribers (email, name, source)
  values (lower(trim(p_email)), nullif(trim(coalesce(p_name,'')),''),
          case when p_source in ('website','booking','inquiry','client','import') then p_source else 'website' end)
  on conflict (email) do update
    set unsubscribed_at = null,
        name = coalesce(excluded.name, bk_subscribers.name);
  return jsonb_build_object('ok', true);
end $$;
grant execute on function public.bk_subscribe(text, text, text) to anon;

-- ============ contracts: triggers → emails ============
create or replace function public.bk_on_contract_sent() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.bk_email_queue (project_id, kind, payload)
  values (new.project_id, 'contract_sent', jsonb_build_object('contract_id', new.id, 'title', new.title));
  return new;
end $$;
create trigger bk_contract_sent_upd after update on public.bk_contracts
  for each row when (new.status = 'sent' and old.status is distinct from 'sent')
  execute function public.bk_on_contract_sent();
create trigger bk_contract_sent_ins after insert on public.bk_contracts
  for each row when (new.status = 'sent')
  execute function public.bk_on_contract_sent();

create or replace function public.bk_on_contract_signed() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.bk_email_queue (project_id, kind, payload)
  values (new.project_id, 'nelson_alert', jsonb_build_object(
    'type', 'contract_signed', 'title', new.title, 'signer', new.signer_name));
  return new;
end $$;
create trigger bk_contract_signed after update on public.bk_contracts
  for each row when (new.status = 'signed' and old.status is distinct from 'signed')
  execute function public.bk_on_contract_signed();

-- ============ contracts: client-side (token-gated) read + sign ============
-- portal read: replace bk_portal to include contracts
create or replace function public.bk_portal(p_project uuid, p_token uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
  if not exists (select 1 from public.bk_projects where id = p_project and access_token = p_token) then
    raise exception 'not found';
  end if;
  update public.bk_messages set read_at = now()
    where project_id = p_project and sender = 'studio' and read_at is null;
  select jsonb_build_object(
    'project', (select jsonb_build_object(
        'id', id, 'title', title, 'client_name', client_name, 'service', service,
        'event_date', event_date, 'event_time', event_time, 'location', location,
        'status', status, 'created_at', created_at)
      from public.bk_projects where id = p_project),
    'invoices', coalesce((select jsonb_agg(jsonb_build_object(
        'id', id, 'title', title, 'line_items', line_items, 'amount_cents', amount_cents,
        'kind', kind, 'status', status, 'due_date', due_date, 'paid_at', paid_at)
        order by created_at)
      from public.bk_invoices where project_id = p_project and status in ('sent','paid')), '[]'::jsonb),
    'contracts', coalesce((select jsonb_agg(jsonb_build_object(
        'id', id, 'title', title, 'body', body, 'status', status,
        'sent_at', sent_at, 'signed_at', signed_at, 'signer_name', signer_name)
        order by created_at)
      from public.bk_contracts where project_id = p_project and status in ('sent','signed')), '[]'::jsonb),
    'messages', coalesce((select jsonb_agg(jsonb_build_object(
        'id', id, 'sender', sender, 'body', body, 'created_at', created_at) order by created_at)
      from public.bk_messages where project_id = p_project), '[]'::jsonb),
    'files', coalesce((select jsonb_agg(jsonb_build_object(
        'id', id, 'label', label, 'url', url) order by created_at)
      from public.bk_files where project_id = p_project), '[]'::jsonb)
  ) into v;
  return v;
end $$;

-- sign: typed-name signature, timestamp, IP + UA from PostgREST request headers,
-- and a sha256 of the exact body signed
create or replace function public.bk_portal_sign_contract(
  p_project uuid, p_token uuid, p_contract uuid, p_signer_name text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_headers json;
  v_ip text; v_ua text;
  v_row bk_contracts%rowtype;
begin
  if not exists (select 1 from public.bk_projects where id = p_project and access_token = p_token) then
    raise exception 'not found';
  end if;
  if p_signer_name is null or length(trim(p_signer_name)) < 2 then
    raise exception 'type your full name to sign';
  end if;
  select * into v_row from public.bk_contracts
    where id = p_contract and project_id = p_project;
  if not found then raise exception 'not found'; end if;
  if v_row.status = 'signed' then
    return jsonb_build_object('ok', true, 'already_signed', true);
  end if;
  if v_row.status <> 'sent' then raise exception 'contract not open for signing'; end if;

  begin
    v_headers := current_setting('request.headers', true)::json;
    v_ip := split_part(coalesce(v_headers->>'x-forwarded-for',''), ',', 1);
    v_ua := v_headers->>'user-agent';
  exception when others then
    v_ip := null; v_ua := null;
  end;

  update public.bk_contracts set
    status = 'signed',
    signed_at = now(),
    signer_name = trim(p_signer_name),
    signed_ip = nullif(v_ip, ''),
    signed_ua = left(coalesce(v_ua,''), 300),
    body_sha256 = encode(extensions.digest(convert_to(body, 'UTF8'), 'sha256'), 'hex')
  where id = p_contract;

  return jsonb_build_object('ok', true, 'signed_at', now());
end $$;
grant execute on function public.bk_portal_sign_contract(uuid, uuid, uuid, text) to anon;

-- ============ money: staff-gated summary + growth nudges ============
create or replace function public.bk_money_summary() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  if not public.bk_is_staff() then raise exception 'staff only'; end if;
  select jsonb_build_object(
    'collected_total', coalesce((select sum(amount_cents) from bk_invoices where status='paid'), 0),
    'collected_30d', coalesce((select sum(amount_cents) from bk_invoices where status='paid' and paid_at > now() - interval '30 days'), 0),
    'collected_this_month', coalesce((select sum(amount_cents) from bk_invoices where status='paid'
        and paid_at >= date_trunc('month', now() at time zone 'America/Chicago')), 0),
    'outstanding', coalesce((select sum(amount_cents) from bk_invoices where status='sent'), 0),
    'outstanding_count', (select count(*) from bk_invoices where status='sent'),
    'avg_paid', coalesce((select avg(amount_cents)::int from bk_invoices where status='paid'), 0),
    'upcoming_7d', (select count(*) from bk_bookings where status='confirmed'
        and starts_at between now() and now() + interval '7 days'),
    'subscribers', (select count(*) from bk_subscribers where unsubscribed_at is null),
    'monthly', coalesce((select jsonb_agg(row order by row->>'month')
      from (select jsonb_build_object('month', to_char(paid_at at time zone 'America/Chicago', 'YYYY-MM'),
                                      'cents', sum(amount_cents)) as row
            from bk_invoices where status='paid' and paid_at > now() - interval '12 months'
            group by 1) m), '[]'::jsonb),
    'by_service', coalesce((select jsonb_agg(row order by (row->>'cents')::bigint desc)
      from (select jsonb_build_object('service', p.service, 'cents', sum(i.amount_cents)) as row
            from bk_invoices i join bk_projects p on p.id = i.project_id
            where i.status='paid' group by p.service) s), '[]'::jsonb)
  ) into v;
  return v;
end $$;
grant execute on function public.bk_money_summary() to authenticated;

create or replace function public.bk_growth_nudges() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  if not public.bk_is_staff() then raise exception 'staff only'; end if;
  select jsonb_build_object(
    -- money sitting on the table: quotes sent, unpaid for 7+ days
    'stale_unpaid', coalesce((select jsonb_agg(jsonb_build_object(
        'project_id', p.id, 'client', p.client_name, 'title', i.title,
        'amount_cents', i.amount_cents, 'days', (extract(epoch from now() - i.created_at)/86400)::int)
        order by i.created_at)
      from bk_invoices i join bk_projects p on p.id = i.project_id
      where i.status='sent' and i.created_at < now() - interval '7 days'), '[]'::jsonb),
    -- inquiries past the one-business-day promise with no reply and no quote
    'unanswered_inquiries', coalesce((select jsonb_agg(jsonb_build_object(
        'project_id', p.id, 'client', p.client_name, 'title', p.title,
        'hours', (extract(epoch from now() - p.created_at)/3600)::int)
        order by p.created_at)
      from bk_projects p
      where p.status = 'new' and p.created_at < now() - interval '24 hours'
        and not exists (select 1 from bk_messages m where m.project_id = p.id and m.sender='studio')
        and not exists (select 1 from bk_invoices i where i.project_id = p.id)), '[]'::jsonb),
    -- confirmed shoots with no contract attached
    'missing_contracts', coalesce((select jsonb_agg(jsonb_build_object(
        'project_id', p.id, 'client', p.client_name, 'title', p.title, 'starts_at', b.starts_at)
        order by b.starts_at)
      from bk_bookings b join bk_projects p on p.id = b.project_id
      where b.status='confirmed' and b.starts_at > now()
        and not exists (select 1 from bk_contracts c where c.project_id = p.id and c.status in ('sent','signed'))), '[]'::jsonb),
    -- delivered clients with nothing active in 60+ days: the rebook list
    'rebook', coalesce((select jsonb_agg(jsonb_build_object(
        'project_id', p.id, 'client', p.client_name, 'email', p.client_email,
        'title', p.title, 'days', (extract(epoch from now() - p.updated_at)/86400)::int)
        order by p.updated_at desc)
      from bk_projects p
      where p.status = 'delivered' and p.updated_at < now() - interval '60 days'
        and not exists (select 1 from bk_projects p2
              where p2.client_email = p.client_email
                and p2.status in ('new','quoted','booked','in_production'))
      limit 15), '[]'::jsonb)
  ) into v;
  return v;
end $$;
grant execute on function public.bk_growth_nudges() to authenticated;

-- ============ seed: starter contract template (Nelson's documented terms) ============
insert into public.bk_contract_templates (name, body) values (
'Production Services Agreement (starter)',
'PRODUCTION SERVICES AGREEMENT

Between Taylormade Creative ("Studio") and the client named on this project ("Client").

1. SERVICES. Studio will provide the creative services described in this project''s scope (the "Work"): [DESCRIBE THE SHOOT/PROJECT — dates, deliverables, locations].

2. PAYMENT. A 50% deposit is due to lock the production date; the remaining balance is due on the day of the shoot unless this agreement states otherwise. Deposits secure the date and Studio''s preparation time. All payments are made through the Client''s secure portal.

3. DELIVERY & REVISIONS. Standard delivery is approximately two (2) weeks from the shoot date and includes two (2) rounds of edits. Additional revision rounds or rush delivery may be quoted separately before work begins.

4. SCHEDULING. If the Client needs to reschedule, Client agrees to notify Studio as early as possible and both parties will coordinate a new date in good faith. [REVIEW: add your rescheduling/cancellation terms here before first use.]

5. CLIENT RESPONSIBILITIES. Client will arrive prepared per the prep instructions provided by email, secure any locations/permissions the Client controls, and obtain permission from any participants the Client brings to the shoot.

6. USAGE & CREDIT. [REVIEW: describe who owns the final deliverables and how each party may use them — e.g., Client receives the final edited deliverables for the agreed use, and Studio may display selected work in its portfolio unless the Client requests otherwise in writing.]

7. LIMITATION. Studio''s total liability under this agreement is limited to the amount actually paid by the Client for the Work.

8. ENTIRE AGREEMENT. This document plus the project scope and invoices in the Client portal make up the whole agreement. Signed electronically; an electronic signature is as valid as ink.

Signed by the Client via secure portal — name, date, and device details are recorded with the signature.');
