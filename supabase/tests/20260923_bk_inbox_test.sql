-- Inbox RPC test. Runs in a transaction the caller ROLLS BACK. Raises on any failure.
do $$
declare
  v_admin uuid; v_old uuid; v_new uuid; r jsonb; r2 jsonb; n int;
begin
  select id into v_admin from public.profiles where role = 'admin' order by created_at limit 1;
  if v_admin is null then raise exception 'TEST: no admin profile'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

  -- 1. backfill: an existing project is not in "needs"
  select p.id into v_old from public.bk_projects p
   where p.created_at < now() - interval '1 minute'
     and exists (select 1 from public.bk_email_queue q where q.project_id = p.id and q.kind = 'nelson_alert')
   limit 1;
  if v_old is null then raise exception 'TEST 1: no older project with an alert to check the backfill against'; end if;
  if exists (
       select 1 from jsonb_array_elements(public.bk_inbox_list('needs', null)) e where (e->>'id')::uuid = v_old) then
    raise exception 'TEST 1: backfilled project shows as needing a reply';
  end if;

  -- 2. a new inquiry lands in "needs"
  -- args: name, email, service, phone, company, event_date, location, budget, details, source
  r := public.bk_submit_inquiry('Inbox Test <b>x</b>', 'inbox-test@example.com', 'photography',
         null, null, current_date + 20, null, null, 'test details', 'test');
  v_new := (r->>'id')::uuid;
  if (select inbox_handled_at from public.bk_projects where id = v_new) is not null then
    raise exception 'TEST 2: new inquiry is already handled';
  end if;
  if not exists (select 1 from jsonb_array_elements(public.bk_inbox_list('needs', null)) e
                 where (e->>'id')::uuid = v_new and e->>'last_kind' = 'alert') then
    raise exception 'TEST 2: new inquiry missing from needs list';
  end if;

  -- 3. item shape
  r := public.bk_inbox_item(v_new);
  if r->'project'->>'client_email' <> 'inbox-test@example.com' then raise exception 'TEST 3: item project wrong'; end if;
  if jsonb_typeof(r->'messages') <> 'array' or jsonb_typeof(r->'bookings') <> 'array' then raise exception 'TEST 3: item arrays'; end if;

  -- 4. validation
  begin perform public.bk_inbox_send(v_new, '   ', 'key-aaaaaaaa'); raise exception 'TEST 4a: empty accepted';
  exception when others then if sqlerrm not like '%empty%' then raise; end if; end;
  begin perform public.bk_inbox_send(v_new, repeat('x', 4001), 'key-bbbbbbbb'); raise exception 'TEST 4b: long accepted';
  exception when others then if sqlerrm not like '%too long%' then raise; end if; end;

  -- 5. send once, then again with the same key
  r := public.bk_inbox_send(v_new, 'Hi — thanks for reaching out!', 'key-cccccccc');
  r2 := public.bk_inbox_send(v_new, 'Hi — thanks for reaching out!', 'key-cccccccc');
  if (r->>'duplicate')::boolean or not (r2->>'duplicate')::boolean or r->>'id' <> r2->>'id' then
    raise exception 'TEST 5: idempotency broken: % / %', r, r2;
  end if;
  select count(*) into n from public.bk_messages where project_id = v_new and sender = 'studio';
  if n <> 1 then raise exception 'TEST 5: expected 1 studio message, got %', n; end if;
  select count(*) into n from public.bk_email_queue where project_id = v_new and kind = 'studio_reply';
  if n <> 1 then raise exception 'TEST 5: expected 1 studio_reply email, got %', n; end if;
  select count(*) into n from public.bk_email_queue where project_id = v_new and kind = 'new_message';
  if n <> 0 then raise exception 'TEST 5: short new_message email was also queued'; end if;
  if (select inbox_handled_at from public.bk_projects where id = v_new) is null then
    raise exception 'TEST 5: send did not mark handled';
  end if;

  -- 6. a client message re-opens it
  insert into public.bk_messages (project_id, sender, body) values (v_new, 'client', 'One more question');
  if (select inbox_handled_at from public.bk_projects where id = v_new) is not null then
    raise exception 'TEST 6: client message did not re-open';
  end if;

  -- 7. mark handled / unhandled
  perform public.bk_inbox_mark(v_new, true);
  if (select inbox_handled_at from public.bk_projects where id = v_new) is null then raise exception 'TEST 7a'; end if;
  perform public.bk_inbox_mark(v_new, false);
  if (select inbox_handled_at from public.bk_projects where id = v_new) is not null then raise exception 'TEST 7b'; end if;

  -- 8. subscriptions upsert on endpoint
  perform public.bk_inbox_subscribe('https://push.example/abc', 'p1', 'a1', 'test-ua');
  perform public.bk_inbox_subscribe('https://push.example/abc', 'p2', 'a2', 'test-ua');
  select count(*) into n from public.bk_push_subscriptions where endpoint = 'https://push.example/abc';
  if n <> 1 then raise exception 'TEST 8: subscribe not upserted (%)', n; end if;
  perform public.bk_inbox_unsubscribe('https://push.example/abc');
  if exists (select 1 from public.bk_push_subscriptions where endpoint = 'https://push.example/abc') then
    raise exception 'TEST 8: unsubscribe failed';
  end if;

  -- 9. non-staff is refused
  perform set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
  begin perform public.bk_inbox_list('all', null); raise exception 'TEST 9: non-staff read the list';
  exception when others then if sqlerrm not like '%forbidden%' then raise; end if; end;

  -- 10. a booking-only alert (payment safety net inserts booking_id, no project_id) lands on its project
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  declare v_svc uuid; v_bk uuid; v_q uuid;
  begin
    insert into public.bk_services (slug, name, kind, price_cents) values ('inbox-test-svc', 'Inbox Test', 'session', 10000)
      on conflict (slug) do update set name = excluded.name returning id into v_svc;
    insert into public.bk_bookings (project_id, service_id, starts_at, duration_min, status)
      values (v_new, v_svc, now() + interval '3 days', 30, 'pending_payment') returning id into v_bk;
    perform public.bk_inbox_mark(v_new, true);
    insert into public.bk_email_queue (booking_id, kind, payload)
      values (v_bk, 'nelson_alert', '{"type":"payment_orphan"}') returning id into v_q;
    if (select project_id from public.bk_email_queue where id = v_q) is distinct from v_new then
      raise exception 'TEST 10: booking-only alert did not get its project';
    end if;
    if not exists (select 1 from jsonb_array_elements(public.bk_inbox_list('needs', null)) e
                   where (e->>'id')::uuid = v_new) then  -- was marked handled just above; the alert re-opened it
      raise exception 'TEST 10: booking-only alert missing from needs list';
    end if;
  end;

  -- 11. a reply sent from admin (plain studio message) also counts as handled
  perform public.bk_inbox_mark(v_new, false);
  insert into public.bk_messages (project_id, sender, body) values (v_new, 'studio', 'Replied from admin');
  if (select inbox_handled_at from public.bk_projects where id = v_new) is null then
    raise exception 'TEST 11: admin reply did not mark handled';
  end if;

  -- 12. sending from the inbox marks the client's messages read (admin unread badge)
  insert into public.bk_messages (project_id, sender, body) values (v_new, 'client', 'Unread question');
  perform public.bk_inbox_send(v_new, 'Answer', 'key-dddddddd');
  if exists (select 1 from public.bk_messages where project_id = v_new and sender = 'client' and read_at is null) then
    raise exception 'TEST 12: client messages still unread after an inbox reply';
  end if;

  raise notice 'INBOX SQL TESTS PASSED';
end $$;
