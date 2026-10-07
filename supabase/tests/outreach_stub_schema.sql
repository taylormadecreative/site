-- Stand-ins for the Supabase pieces the outreach migration touches. Loaded AFTER inbox_stub_schema.sql
-- by run_outreach_sql_test.mjs. NOT applied anywhere real.
create role service_role;
create schema storage;
create table storage.buckets (id text primary key, name text not null, public boolean default false);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid);
alter table storage.objects enable row level security;
