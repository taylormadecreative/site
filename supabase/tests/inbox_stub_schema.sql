-- Minimal stand-in for the live schema so the inbox migration + test run in PGlite (tests/run_inbox_sql_test.mjs).
-- Mirrors the repo migrations; it is NOT applied anywhere real.
create role anon; create role authenticated;
create schema auth; create schema net;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$
  select ((nullif(current_setting('request.jwt.claims', true), '')::jsonb) ->> 'sub')::uuid $$;
create table net.calls (id bigserial primary key, url text, headers jsonb, body jsonb);
create function net.http_post(url text, headers jsonb default '{}', body jsonb default '{}') returns bigint
language sql as $$ insert into net.calls (url, headers, body) values (url, headers, body) returning id $$;

create table public.profiles (id uuid primary key references auth.users(id), role text, created_at timestamptz default now());
create function public.bk_is_staff() returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.profiles where id = auth.uid() and role in ('admin','employee')) $$;

create table public.bk_projects (
  id uuid primary key default gen_random_uuid(), created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  access_token uuid not null default gen_random_uuid(),
  client_name text not null, client_email text not null, client_phone text, company text,
  service text not null check (service in ('music_video','brand_content','photography','event','other')),
  title text, event_date date, event_time text, location text, budget_range text, details text,
  referral_source text, status text not null default 'new');
-- live has this BEFORE UPDATE touch trigger (booking_system_v1); the admin list sorts on updated_at
create function public.bk_touch() returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end $$;
create trigger bk_projects_touch before update on public.bk_projects for each row execute function public.bk_touch();
create table public.bk_messages (
  id uuid primary key default gen_random_uuid(), created_at timestamptz not null default now(),
  project_id uuid not null references public.bk_projects(id) on delete cascade,
  sender text not null check (sender in ('studio','client')),
  body text not null check (length(body) between 1 and 4000), read_at timestamptz);
create table public.bk_services (
  id uuid primary key default gen_random_uuid(), slug text unique, name text, kind text,
  price_cents integer, deposit_cents integer);
create table public.bk_bookings (
  id uuid primary key default gen_random_uuid(), created_at timestamptz not null default now(),
  project_id uuid not null references public.bk_projects(id) on delete cascade,
  service_id uuid not null references public.bk_services(id), starts_at timestamptz not null,
  duration_min integer not null, status text not null default 'pending_payment', location text);
create table public.bk_email_queue (
  id uuid primary key default gen_random_uuid(), created_at timestamptz not null default now(),
  project_id uuid references public.bk_projects(id) on delete cascade,
  booking_id uuid references public.bk_bookings(id) on delete cascade, kind text not null, send_at timestamptz not null default now(),
  sent_at timestamptz, attempts integer not null default 0, last_error text,
  payload jsonb not null default '{}'::jsonb);
alter table public.bk_email_queue add constraint bk_email_queue_kind_check
  check (kind in ('balance_charged','balance_failed','confirmation','prep','reminder','nelson_alert',
                  'inquiry_ack','invoice_sent','new_message','contract_sent'));
create table public.bk_config (key text primary key, value text not null);
insert into public.bk_config values ('mailer_secret', 'test-mailer-secret');

create function public.bk_submit_inquiry(
  p_name text, p_email text, p_service text, p_phone text default null, p_company text default null,
  p_event_date date default null, p_location text default null, p_budget text default null,
  p_details text default null, p_source text default null, p_event_time text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_token uuid;
begin
  insert into public.bk_projects (client_name, client_email, client_phone, company, service, event_date, event_time, location, budget_range, details, referral_source, title)
  values (trim(p_name), lower(trim(p_email)), p_phone, p_company, p_service, p_event_date, p_event_time, p_location, p_budget, p_details, p_source,
          trim(p_name) || ' — ' || initcap(replace(p_service,'_',' ')))
  returning id, access_token into v_id, v_token;
  insert into public.bk_email_queue (project_id, kind, payload) values
    (v_id, 'inquiry_ack', jsonb_build_object('service', p_service)),
    (v_id, 'nelson_alert', jsonb_build_object('type', 'inquiry', 'service', p_service));
  return jsonb_build_object('id', v_id, 'token', v_token);
end $$;

create function public.bk_on_studio_message() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.bk_email_queue q where q.project_id = new.project_id
                   and q.kind = 'new_message' and q.sent_at is null) then
    insert into public.bk_email_queue (project_id, kind, payload)
    values (new.project_id, 'new_message', jsonb_build_object('snippet', left(new.body, 200)));
  end if;
  return new;
end $$;
create trigger bk_studio_message after insert on public.bk_messages
  for each row when (new.sender = 'studio') execute function public.bk_on_studio_message();

-- seed: one admin, one older project
insert into auth.users values ('00000000-0000-0000-0000-00000000000a');
insert into public.profiles (id, role) values ('00000000-0000-0000-0000-00000000000a', 'admin');
with p as (insert into public.bk_projects (client_name, client_email, service, created_at)
  values ('Old Client', 'old@example.com', 'other', now() - interval '30 days') returning id)
insert into public.bk_email_queue (project_id, kind, payload, created_at)
  select id, 'nelson_alert', '{"type":"inquiry"}', now() - interval '30 days' from p;
