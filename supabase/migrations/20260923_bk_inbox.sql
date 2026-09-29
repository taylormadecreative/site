-- INBOX APP — push alerts + Claude-drafted replies for Nelson (spec: taylormade-book
-- docs/superpowers/specs/2026-09-23-inbox-app-design.md). Applied by apply-inbox.sh.

-- ---------------------------------------------------------------- columns
-- rollout: history is not "unanswered"; only events from now on need a reply.
-- A column default fills existing rows WITHOUT an UPDATE, so bk_projects_touch never fires
-- (updated_at drives the admin sort and the 60-day rebook list), and a re-run never re-marks anything.
do $$
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'bk_projects' and column_name = 'inbox_handled_at') then
    alter table public.bk_projects add column inbox_handled_at timestamptz default now();
    alter table public.bk_projects alter column inbox_handled_at drop default;
  end if;
end $$;

alter table public.bk_messages add column if not exists emailed_direct boolean not null default false;
alter table public.bk_messages add column if not exists client_key text;
create unique index if not exists bk_messages_client_key_uidx on public.bk_messages(client_key) where client_key is not null;
create index if not exists bk_email_queue_project_idx on public.bk_email_queue(project_id, created_at);

-- ---------------------------------------------------------------- push subscriptions
create table if not exists public.bk_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique check (length(endpoint) between 10 and 1000),
  p256dh text not null check (length(p256dh) between 1 and 200),
  auth text not null check (length(auth) between 1 and 100),
  user_agent text check (user_agent is null or length(user_agent) <= 400),
  created_at timestamptz not null default now(),
  last_ok_at timestamptz
);
alter table public.bk_push_subscriptions enable row level security;
-- no policies: only the RPCs below (definer) and the service role touch it

-- ---------------------------------------------------------------- config
insert into public.bk_config (key, value) values ('inbox_push_secret', gen_random_uuid()::text)
  on conflict (key) do nothing;

-- ---------------------------------------------------------------- queue kind: studio_reply
-- rebuilt from the LIVE constraint so no existing kind is ever dropped
do $$
declare v_def text;
begin
  select pg_get_constraintdef(oid) into v_def from pg_constraint where conname = 'bk_email_queue_kind_check';
  if v_def is not null and v_def not like '%studio_reply%' then
    execute 'alter table public.bk_email_queue drop constraint bk_email_queue_kind_check';
    execute 'alter table public.bk_email_queue add constraint bk_email_queue_kind_check '
         || replace(v_def, 'ARRAY[', 'ARRAY[''studio_reply''::text, ');
  end if;
  select pg_get_constraintdef(oid) into v_def from pg_constraint where conname = 'bk_email_queue_kind_check';
  if v_def is null or v_def not like '%studio_reply%' or v_def not like '%nelson_alert%' or v_def not like '%new_message%' then
    raise exception 'email kind constraint rebuild failed: %', v_def;
  end if;
end $$;

-- ---------------------------------------------------------------- inbox replies skip the short "new message" email
drop trigger if exists bk_studio_message on public.bk_messages;
create trigger bk_studio_message after insert on public.bk_messages
  for each row when (new.sender = 'studio' and not new.emailed_direct)
  execute function public.bk_on_studio_message();

-- ---------------------------------------------------------------- notify: re-open + push
create or replace function public.bk_inbox_notify() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_source text := case when tg_table_name = 'bk_messages' then 'message' else 'alert' end;
begin
  if new.project_id is not null then
    update public.bk_projects set inbox_handled_at = null where id = new.project_id;
  end if;
  -- pg_net queues the request and sends it after commit; a failure here must never block the insert
  begin
    perform net.http_post(
      url := 'https://pgqdmnmessbbzyszjfvr.supabase.co/functions/v1/bk-push',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-push-secret', (select value from public.bk_config where key = 'inbox_push_secret')),
      body := jsonb_build_object('source', v_source, 'id', new.id));
  exception when others then
    raise warning 'bk_inbox_notify push enqueue failed: %', sqlerrm;
  end;
  return new;
end $$;

-- the payment safety net queues alerts with booking_id only; give them their project so they list + deep-link
create or replace function public.bk_inbox_fill_project() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.project_id is null and new.booking_id is not null then
    select project_id into new.project_id from public.bk_bookings where id = new.booking_id;
  end if;
  return new;
end $$;
drop trigger if exists bk_inbox_fill_project on public.bk_email_queue;
create trigger bk_inbox_fill_project before insert on public.bk_email_queue
  for each row when (new.kind = 'nelson_alert' and new.project_id is null)
  execute function public.bk_inbox_fill_project();

-- any studio reply (Inbox or admin dashboard) counts as handled
create or replace function public.bk_inbox_studio_replied() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.bk_projects set inbox_handled_at = now() where id = new.project_id;
  return new;
end $$;
drop trigger if exists bk_inbox_studio_msg on public.bk_messages;
create trigger bk_inbox_studio_msg after insert on public.bk_messages
  for each row when (new.sender = 'studio') execute function public.bk_inbox_studio_replied();

drop trigger if exists bk_inbox_alert on public.bk_email_queue;
create trigger bk_inbox_alert after insert on public.bk_email_queue
  for each row when (new.kind = 'nelson_alert') execute function public.bk_inbox_notify();
drop trigger if exists bk_inbox_client_msg on public.bk_messages;
create trigger bk_inbox_client_msg after insert on public.bk_messages
  for each row when (new.sender = 'client') execute function public.bk_inbox_notify();

-- ---------------------------------------------------------------- RPCs
create or replace function public.bk_inbox_list(p_filter text default 'needs', p_before timestamptz default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.bk_is_staff() then raise exception 'forbidden' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(to_jsonb(r) order by r.last_at desc) from (
      select p.id, p.client_name, p.title, p.service, p.inbox_handled_at,
             a.at as last_at, a.kind as last_kind, a.summary as last_summary
        from public.bk_projects p
        join lateral (
          select e.at, e.kind, e.summary from (
            select q.created_at as at, 'alert'::text as kind, coalesce(q.payload->>'type', 'event') as summary
              from public.bk_email_queue q where q.project_id = p.id and q.kind = 'nelson_alert'
            union all
            select m.created_at, 'message', left(m.body, 140)
              from public.bk_messages m where m.project_id = p.id and m.sender = 'client'
          ) e order by e.at desc limit 1
        ) a on true
       where (p_filter = 'all' or p.inbox_handled_at is null)
         and (p_before is null or a.at < p_before)
       order by a.at desc
       limit 30
    ) r), '[]'::jsonb);
end $$;

create or replace function public.bk_inbox_item(p_project uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_email text;
begin
  if not public.bk_is_staff() then raise exception 'forbidden' using errcode = '42501'; end if;
  select client_email into v_email from public.bk_projects where id = p_project;
  if v_email is null then raise exception 'not found'; end if;
  return jsonb_build_object(
    'project', (select jsonb_build_object('id', id, 'client_name', client_name, 'client_email', client_email,
                  'client_phone', client_phone, 'company', company, 'service', service, 'title', title,
                  'event_date', event_date, 'event_time', event_time, 'location', location,
                  'budget_range', budget_range, 'details', details, 'created_at', created_at,
                  'inbox_handled_at', inbox_handled_at)
                  from public.bk_projects where id = p_project),
    'bookings', coalesce((select jsonb_agg(jsonb_build_object(
                  'id', b.id, 'starts_at', b.starts_at, 'duration_min', b.duration_min, 'status', b.status,
                  'balance_cents', to_jsonb(b) -> 'balance_cents', 'balance_status', to_jsonb(b) -> 'balance_status',
                  'service', case when s.id is null then null else jsonb_build_object(
                    'name', s.name, 'slug', s.slug, 'kind', s.kind,
                    'price_cents', s.price_cents, 'deposit_cents', s.deposit_cents) end)
                  order by b.starts_at)
                  from public.bk_bookings b left join public.bk_services s on s.id = b.service_id
                  where b.project_id = p_project and b.status <> 'cancelled'), '[]'::jsonb),
    'messages', coalesce((select jsonb_agg(jsonb_build_object('sender', sender, 'body', body, 'created_at', created_at)
                  order by created_at)
                  from (select * from public.bk_messages where project_id = p_project
                        order by created_at desc limit 10) m), '[]'::jsonb),
    'alerts', coalesce((select jsonb_agg(jsonb_build_object('type', payload->>'type', 'created_at', created_at)
                  order by created_at desc)
                  from (select * from public.bk_email_queue where project_id = p_project and kind = 'nelson_alert'
                        order by created_at desc limit 5) q), '[]'::jsonb),
    'past_projects', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'title', title,
                  'created_at', created_at, 'status', status) order by created_at desc)
                  from public.bk_projects where client_email = v_email and id <> p_project), '[]'::jsonb)
  );
end $$;

create or replace function public.bk_inbox_send(p_project uuid, p_body text, p_key text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_body text := trim(coalesce(p_body, ''));
begin
  if not public.bk_is_staff() then raise exception 'forbidden' using errcode = '42501'; end if;
  if length(v_body) = 0 then raise exception 'Reply is empty'; end if;
  if length(v_body) > 4000 then raise exception 'Reply is too long (4000 characters max)'; end if;
  if p_key is null or length(p_key) not between 8 and 80 then raise exception 'bad send key'; end if;
  select id into v_id from public.bk_messages where client_key = p_key;
  if v_id is not null then return jsonb_build_object('id', v_id, 'duplicate', true); end if;
  if not exists (select 1 from public.bk_projects where id = p_project) then raise exception 'not found'; end if;

  insert into public.bk_messages (project_id, sender, body, emailed_direct, client_key)
    values (p_project, 'studio', v_body, true, p_key) returning id into v_id;
  insert into public.bk_email_queue (project_id, kind, payload)
    values (p_project, 'studio_reply', jsonb_build_object('message_id', v_id));
  update public.bk_projects set inbox_handled_at = now() where id = p_project;
  -- he has answered them: clear the admin dashboard's unread badge too
  update public.bk_messages set read_at = now()
   where project_id = p_project and sender = 'client' and read_at is null;
  begin
    perform net.http_post(
      url := 'https://pgqdmnmessbbzyszjfvr.supabase.co/functions/v1/bk-mailer',
      headers := jsonb_build_object('Content-Type', 'application/json',
        'x-mailer-secret', (select value from public.bk_config where key = 'mailer_secret')),
      body := '{}'::jsonb);
  exception when others then
    raise warning 'bk_inbox_send mailer ping failed (cron will send within 10 min): %', sqlerrm;
  end;
  return jsonb_build_object('id', v_id, 'duplicate', false);
exception when unique_violation then
  select id into v_id from public.bk_messages where client_key = p_key;
  return jsonb_build_object('id', v_id, 'duplicate', true);
end $$;

create or replace function public.bk_inbox_mark(p_project uuid, p_handled boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.bk_is_staff() then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.bk_projects set inbox_handled_at = case when p_handled then now() else null end where id = p_project;
end $$;

create or replace function public.bk_inbox_subscribe(p_endpoint text, p_p256dh text, p_auth text, p_ua text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.bk_is_staff() then raise exception 'forbidden' using errcode = '42501'; end if;
  insert into public.bk_push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
    values (auth.uid(), p_endpoint, p_p256dh, p_auth, left(p_ua, 400))
  on conflict (endpoint) do update
    set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth,
        user_agent = excluded.user_agent;
end $$;

create or replace function public.bk_inbox_unsubscribe(p_endpoint text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.bk_is_staff() then raise exception 'forbidden' using errcode = '42501'; end if;
  delete from public.bk_push_subscriptions where endpoint = p_endpoint;
end $$;

create or replace function public.bk_inbox_vapid_key()
returns text language plpgsql stable security definer set search_path = public as $$
begin
  if not public.bk_is_staff() then raise exception 'forbidden' using errcode = '42501'; end if;
  return (select value from public.bk_config where key = 'inbox_vapid_public');
end $$;

revoke all on function public.bk_inbox_list(text, timestamptz), public.bk_inbox_item(uuid),
  public.bk_inbox_send(uuid, text, text), public.bk_inbox_mark(uuid, boolean),
  public.bk_inbox_subscribe(text, text, text, text), public.bk_inbox_unsubscribe(text),
  public.bk_inbox_vapid_key(), public.bk_inbox_notify(), public.bk_inbox_fill_project(),
  public.bk_inbox_studio_replied() from public, anon;
grant execute on function public.bk_inbox_list(text, timestamptz), public.bk_inbox_item(uuid),
  public.bk_inbox_send(uuid, text, text), public.bk_inbox_mark(uuid, boolean),
  public.bk_inbox_subscribe(text, text, text, text), public.bk_inbox_unsubscribe(text),
  public.bk_inbox_vapid_key() to authenticated;
