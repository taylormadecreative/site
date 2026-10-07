-- PITCH AGENT, Phase 1 (review and send). The spec lives privately on Nelson's Mac.
-- This repo is PUBLIC: no personal data here. Footer address, sender name and the
-- do-not-contact list are written from the Mac at setup. Idempotent.

-- ---------------------------------------------------------------- tables
create table if not exists public.bk_outreach_settings (
  id boolean primary key default true check (id),
  footer_address text not null default '',
  sender_name text not null default '',
  send_days int[] not null default '{1,2,3,4,5}',
  window_start_min int not null default 480 check (window_start_min between 0 and 1439),
  window_end_min int not null default 990 check (window_end_min between 1 and 1440),
  daily_cap int not null default 12 check (daily_cap between 0 and 50),
  shadow_to text,
  paused boolean not null default false,
  imap_last_uid bigint,
  imap_uidvalidity bigint,
  updated_at timestamptz not null default now()
);
insert into public.bk_outreach_settings (id) values (true) on conflict (id) do nothing;

create table if not exists public.bk_outreach_prospects (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,80}$'),
  org text not null check (length(org) between 1 and 200),
  lane text not null check (lane in ('university','company','nonprofit','small_business','warm')),
  city text, website text, contact_name text, contact_role text,
  email text check (email is null or email = lower(email)),
  email_source_url text,
  instagram text,
  status text not null default 'new' check (status in ('new','pitched','replied','skipped','opted_out','bounced')),
  skip_reason text,
  skip_until date
);
create index if not exists bk_outreach_prospects_email_idx on public.bk_outreach_prospects(email);

create table if not exists public.bk_outreach_pitches (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  batch_date date not null,
  prospect_id uuid not null references public.bk_outreach_prospects(id) on delete cascade,
  offer_id text not null check (offer_id in ('content-day','corporate-video','team-headshots','video-podcast',
                                             'event-coverage','team-ai-workshops','academy-partner')),
  score jsonb not null,
  why text not null,
  channel text not null check (channel in ('email','dm')),
  parts jsonb not null,
  subject text, email_html text, fu1_html text, fu2_html text, dm_text text,
  proposal_slug text, proposal_url text, proposal_src text, proposal_hash text,
  shots jsonb not null default '[]'::jsonb,
  samples jsonb not null default '[]'::jsonb,
  content_hash text,
  status text not null default 'ready' check (status in ('rendering','ready','approved','sending','sent','done',
                                                         'dm_ready','skipped','cancelled','held')),
  hold_reason text,
  approved_hash text, approved_at timestamptz,
  step_done int not null default 0 check (step_done between 0 and 3),
  sending_step int check (sending_step between 1 and 3),
  sending_message_id text, sending_at timestamptz,
  thread_ids text[] not null default '{}',
  sent_at timestamptz,
  next_at timestamptz
);
create index if not exists bk_outreach_pitches_status_idx on public.bk_outreach_pitches(status);

create table if not exists public.bk_outreach_events (
  id uuid primary key default gen_random_uuid(),
  at timestamptz not null default now(),
  pitch_id uuid references public.bk_outreach_pitches(id) on delete cascade,
  kind text not null check (kind in ('batch_ready','approved','unapproved','edited','edited_ready','skipped',
    'dm_ready','dm_sent','sent','fu1_sent','fu2_sent','shadow_sent','reply','auto_reply','opt_out','bounce',
    'cancelled','held','error')),
  detail jsonb not null default '{}'::jsonb
);
create index if not exists bk_outreach_events_pitch_idx on public.bk_outreach_events(pitch_id, at desc);
create index if not exists bk_outreach_events_kind_idx on public.bk_outreach_events(kind, at desc);

create table if not exists public.bk_outreach_suppress (
  id uuid primary key default gen_random_uuid(),
  at timestamptz not null default now(),
  kind text not null check (kind in ('email','domain','org')),
  value text not null check (value = lower(value) and length(value) between 2 and 320),
  reason text not null check (reason in ('opt_out','bounce','dead_lead','personal','client','recent_contact','manual')),
  source text,
  unique (kind, value)
);

-- no policies: staff go through the definer RPCs below, the Mac uses the service role
alter table public.bk_outreach_settings enable row level security;
alter table public.bk_outreach_prospects enable row level security;
alter table public.bk_outreach_pitches enable row level security;
alter table public.bk_outreach_events enable row level security;
alter table public.bk_outreach_suppress enable row level security;

create or replace function public.bk_outreach_touch() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists bk_outreach_pitches_touch on public.bk_outreach_pitches;
create trigger bk_outreach_pitches_touch before update on public.bk_outreach_pitches
  for each row execute function public.bk_outreach_touch();

-- ---------------------------------------------------------------- suppression
create or replace function public.bk_outreach_norm_org(t text) returns text
language sql immutable as $$ select trim(regexp_replace(lower(coalesce(t, '')), '[^a-z0-9]+', ' ', 'g')) $$;

create or replace function public.bk_outreach_is_suppressed(p_email text, p_org text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.bk_outreach_suppress s
     where (s.kind = 'email' and p_email is not null and s.value = lower(p_email))
        or (s.kind = 'domain' and p_email is not null
            and s.value = lower(split_part(p_email, '@', 2))
            and lower(split_part(p_email, '@', 2)) not in ('gmail.com','yahoo.com','icloud.com','outlook.com',
                'hotmail.com','aol.com','me.com','live.com','msn.com','protonmail.com','proton.me'))
        or (s.kind = 'org' and (' ' || public.bk_outreach_norm_org(p_org) || ' ') like ('% ' || s.value || ' %'))
  ) $$;

-- ---------------------------------------------------------------- push
create or replace function public.bk_outreach_notify() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  begin
    perform net.http_post(
      url := 'https://pgqdmnmessbbzyszjfvr.supabase.co/functions/v1/bk-push',
      headers := jsonb_build_object('Content-Type', 'application/json',
        'x-push-secret', (select value from public.bk_config where key = 'inbox_push_secret')),
      body := jsonb_build_object('source', 'outreach', 'id', new.id));
  exception when others then
    raise warning 'bk_outreach_notify push enqueue failed: %', sqlerrm;
  end;
  return new;
end $$;
drop trigger if exists bk_outreach_push on public.bk_outreach_events;
create trigger bk_outreach_push after insert on public.bk_outreach_events
  for each row when (new.kind in ('batch_ready','edited_ready','dm_ready','reply','opt_out','bounce','held','error'))
  execute function public.bk_outreach_notify();

-- ---------------------------------------------------------------- RPCs (staff)
create or replace function public.bk_outreach_list(p_filter text default 'review')
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.bk_is_staff() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_filter not in ('review','active','all') then raise exception 'bad filter'; end if;
  return coalesce((
    select jsonb_agg(to_jsonb(r) order by r.sort_at desc) from (
      select p.id, p.batch_date, p.offer_id, p.channel, p.status, p.hold_reason, p.why,
             (p.score->>'total')::int as score_total, pr.org, pr.lane, pr.contact_name, p.updated_at as sort_at
        from public.bk_outreach_pitches p
        join public.bk_outreach_prospects pr on pr.id = p.prospect_id
       where case p_filter
               when 'review' then p.status in ('ready','held','dm_ready','rendering')
               when 'active' then p.status in ('approved','sending','sent')
               else true end
       order by p.updated_at desc
       limit 100) r), '[]'::jsonb);
end $$;

create or replace function public.bk_outreach_item(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r jsonb;
begin
  if not public.bk_is_staff() then raise exception 'forbidden' using errcode = '42501'; end if;
  select jsonb_build_object(
    'pitch', to_jsonb(p),
    'prospect', to_jsonb(pr),
    'events', coalesce((select jsonb_agg(jsonb_build_object('kind', e.kind, 'at', e.at, 'detail', e.detail) order by e.at desc)
                 from (select * from public.bk_outreach_events where pitch_id = p.id order by at desc limit 30) e), '[]'::jsonb),
    'settings', (select jsonb_build_object('window_start_min', s.window_start_min, 'window_end_min', s.window_end_min,
                   'send_days', s.send_days, 'shadow', s.shadow_to is not null, 'paused', s.paused)
                   from public.bk_outreach_settings s where s.id))
    into r
    from public.bk_outreach_pitches p join public.bk_outreach_prospects pr on pr.id = p.prospect_id
   where p.id = p_id;
  if r is null then raise exception 'not found'; end if;
  return r;
end $$;

create or replace function public.bk_outreach_approve(p_id uuid, p_hash text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare p public.bk_outreach_pitches; pr public.bk_outreach_prospects;
begin
  if not public.bk_is_staff() then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into p from public.bk_outreach_pitches where id = p_id for update;
  if not found then raise exception 'not found'; end if;
  if p.status <> 'ready' then raise exception 'This pitch is % — reopen it.', p.status; end if;
  -- approving again would resend the first email to someone already in the sequence
  if p.channel = 'email' and p.step_done > 0 then raise exception 'This pitch is already mid-sequence'; end if;
  if p.content_hash is null or p_hash is distinct from p.content_hash then
    raise exception 'stale: this pitch changed since you opened it. Reopen it.';
  end if;
  select * into pr from public.bk_outreach_prospects where id = p.prospect_id;
  if public.bk_outreach_is_suppressed(pr.email, pr.org) then
    raise exception 'suppressed: % is on the do-not-contact list', pr.org;
  end if;
  update public.bk_outreach_pitches set status = 'approved', approved_hash = p_hash, approved_at = now() where id = p_id;
  insert into public.bk_outreach_events (pitch_id, kind) values (p_id, 'approved');
  return jsonb_build_object('status', 'approved');
end $$;

create or replace function public.bk_outreach_unapprove(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public.bk_is_staff() then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.bk_outreach_pitches set status = 'ready', approved_hash = null, approved_at = null
   where id = p_id and status = 'approved';
  if not found then raise exception 'Too late: it is already sending or sent.'; end if;
  insert into public.bk_outreach_events (pitch_id, kind) values (p_id, 'unapproved');
  return jsonb_build_object('status', 'ready');
end $$;

create or replace function public.bk_outreach_edit(p_id uuid, p_parts jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_status text; v_channel text; k text; n int;
begin
  if not public.bk_is_staff() then raise exception 'forbidden' using errcode = '42501'; end if;
  select status, channel into v_status, v_channel from public.bk_outreach_pitches where id = p_id for update;
  if not found then raise exception 'not found'; end if;
  if v_status not in ('ready','approved','held','rendering') then raise exception 'Too late to edit: this pitch is %', v_status; end if;
  if jsonb_typeof(p_parts) <> 'object' or length(p_parts::text) > 20000 then raise exception 'Edit is too long'; end if;
  if v_channel = 'dm' then
    if length(coalesce(p_parts->>'dm', '')) not between 1 and 1000 then raise exception 'The DM must be 1–1000 characters'; end if;
  else
    if length(coalesce(p_parts->>'subject', '')) not between 1 and 90 then raise exception 'Subject must be 1–90 characters'; end if;
    foreach k in array array['email','fu1','fu2'] loop
      if coalesce(jsonb_typeof(p_parts->k), '') <> 'object' then raise exception '% is missing', k; end if;
      if coalesce(jsonb_typeof(p_parts->k->'paragraphs'), '') <> 'array' then raise exception '% needs paragraphs', k; end if;
      n := jsonb_array_length(p_parts->k->'paragraphs');
      if n not between 1 and 8 then raise exception '% needs 1–8 paragraphs', k; end if;
      if exists (select 1 from jsonb_array_elements_text(p_parts->k->'paragraphs') t where length(trim(t)) not between 1 and 1200) then
        raise exception 'Each % paragraph must be 1–1200 characters', k;
      end if;
      if length(coalesce(p_parts->k->>'greeting', '')) = 0 or length(coalesce(p_parts->k->>'signoff', '')) = 0 then
        raise exception '% needs a greeting and a sign-off', k;
      end if;
    end loop;
  end if;
  update public.bk_outreach_pitches
     set parts = p_parts, status = 'rendering', approved_hash = null, approved_at = null, hold_reason = null
   where id = p_id;
  insert into public.bk_outreach_events (pitch_id, kind) values (p_id, 'edited');
  return jsonb_build_object('status', 'rendering');
end $$;

create or replace function public.bk_outreach_skip(p_id uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare p public.bk_outreach_pitches; pr public.bk_outreach_prospects;
begin
  if not public.bk_is_staff() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_reason is null or p_reason not in ('wrong_fit','bad_timing','know_them','other') then raise exception 'bad reason'; end if;
  select * into p from public.bk_outreach_pitches where id = p_id for update;
  if not found then raise exception 'not found'; end if;
  if p.status not in ('ready','held','approved','dm_ready','rendering') then raise exception 'Can''t skip a pitch that is %', p.status; end if;
  select * into pr from public.bk_outreach_prospects where id = p.prospect_id;
  update public.bk_outreach_pitches set status = 'skipped', approved_hash = null where id = p_id;
  update public.bk_outreach_prospects
     set status = 'skipped', skip_reason = p_reason,
         skip_until = case when p_reason = 'know_them' then null else current_date + 180 end
   where id = pr.id;
  if p_reason = 'know_them' then
    if pr.email is not null then
      insert into public.bk_outreach_suppress (kind, value, reason, source) values ('email', pr.email, 'personal', 'skip')
        on conflict (kind, value) do nothing;
    end if;
    if length(public.bk_outreach_norm_org(pr.org)) >= 2 then
      insert into public.bk_outreach_suppress (kind, value, reason, source)
        values ('org', public.bk_outreach_norm_org(pr.org), 'personal', 'skip') on conflict (kind, value) do nothing;
    end if;
  end if;
  insert into public.bk_outreach_events (pitch_id, kind, detail) values (p_id, 'skipped', jsonb_build_object('reason', p_reason));
  return jsonb_build_object('status', 'skipped');
end $$;

create or replace function public.bk_outreach_dm_sent(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_prospect uuid;
begin
  if not public.bk_is_staff() then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.bk_outreach_pitches set status = 'done', step_done = 1, sent_at = now()
   where id = p_id and channel = 'dm' and status = 'dm_ready'
   returning prospect_id into v_prospect;
  if v_prospect is null then raise exception 'Not ready: the page publishes after you approve, then you DM.'; end if;
  update public.bk_outreach_prospects set status = 'pitched' where id = v_prospect;
  insert into public.bk_outreach_events (pitch_id, kind) values (p_id, 'dm_sent');
  return jsonb_build_object('status', 'done');
end $$;

-- Nelson talked to them some other way: no more follow-ups (the email already sent stays sent)
create or replace function public.bk_outreach_stop(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public.bk_is_staff() then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.bk_outreach_pitches set status = 'cancelled', next_at = null
   where id = p_id and status = 'sent';
  if not found then raise exception 'Only a pitch with follow-ups still to send can be stopped'; end if;
  insert into public.bk_outreach_events (pitch_id, kind, detail) values (p_id, 'cancelled', jsonb_build_object('why', 'stopped by Nelson'));
  return jsonb_build_object('status', 'cancelled');
end $$;

-- ---------------------------------------------------------------- storage: private screenshots + samples
insert into storage.buckets (id, name, public) values ('outreach', 'outreach', false) on conflict (id) do nothing;
drop policy if exists "outreach staff read" on storage.objects;
create policy "outreach staff read" on storage.objects for select to authenticated
  using (bucket_id = 'outreach' and public.bk_is_staff());

-- ---------------------------------------------------------------- grants
revoke all on function public.bk_outreach_list(text), public.bk_outreach_item(uuid),
  public.bk_outreach_approve(uuid, text), public.bk_outreach_unapprove(uuid), public.bk_outreach_edit(uuid, jsonb),
  public.bk_outreach_skip(uuid, text), public.bk_outreach_dm_sent(uuid), public.bk_outreach_stop(uuid),
  public.bk_outreach_is_suppressed(text, text), public.bk_outreach_notify() from public, anon;
grant execute on function public.bk_outreach_list(text), public.bk_outreach_item(uuid),
  public.bk_outreach_approve(uuid, text), public.bk_outreach_unapprove(uuid), public.bk_outreach_edit(uuid, jsonb),
  public.bk_outreach_skip(uuid, text), public.bk_outreach_dm_sent(uuid), public.bk_outreach_stop(uuid) to authenticated;
-- Supabase default privileges grant EXECUTE to authenticated directly; strip it from the internal functions.
revoke all on function public.bk_outreach_is_suppressed(text, text), public.bk_outreach_notify() from authenticated;
grant execute on function public.bk_outreach_is_suppressed(text, text) to service_role;
