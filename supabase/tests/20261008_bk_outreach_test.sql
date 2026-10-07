-- Outreach RPC test. Runs in a transaction the caller ROLLS BACK. Raises on any failure.
-- Uses an existing admin when there is one (the live dry run), else creates one (PGlite).
do $$
declare
  v_admin uuid; v_out uuid := gen_random_uuid();
  v_pr uuid; v_p uuid; v_dmpr uuid; v_dm uuid; v_spr uuid; v_s uuid; r jsonb; n int; v_def text;
  v_parts jsonb := '{"subject":"S","email":{"greeting":"Hi","paragraphs":["p"],"signoff":"Thanks,","cta_label":"See it"},"fu1":{"greeting":"Hi","paragraphs":["p"],"signoff":"Thanks,"},"fu2":{"greeting":"Hi","paragraphs":["p"],"signoff":"Thanks,"}}';
begin
  select id into v_admin from public.profiles where role = 'admin' order by created_at limit 1;
  if v_admin is null then
    v_admin := gen_random_uuid();
    insert into auth.users (id) values (v_admin);
    insert into public.profiles (id, role) values (v_admin, 'admin');
  end if;

  insert into public.bk_outreach_prospects (slug, org, lane, email, email_source_url)
    values ('zz-test-co', 'Test Co', 'company', 'owner@testco-outreach.com', 'https://testco-outreach.com/team')
    returning id into v_pr;
  insert into public.bk_outreach_pitches (batch_date, prospect_id, offer_id, score, why, channel, parts,
      subject, email_html, fu1_html, fu2_html, content_hash)
    values (current_date, v_pr, 'content-day', '{"total":12}', 'why', 'email', v_parts,
      'S', '<p>a</p>', '<p>b</p>', '<p>c</p>', 'hash-1')
    returning id into v_p;

  -- 1. non-staff are refused
  perform set_config('request.jwt.claims', json_build_object('sub', v_out)::text, true);
  begin perform public.bk_outreach_list('review'); raise exception 'TEST 1: non-staff listed pitches';
  exception when others then if sqlerrm not like '%forbidden%' then raise; end if; end;
  begin perform public.bk_outreach_approve(v_p, 'hash-1'); raise exception 'TEST 1b: non-staff approved';
  exception when others then if sqlerrm not like '%forbidden%' then raise; end if; end;
  begin perform public.bk_outreach_stop(v_p); raise exception 'TEST 1c: non-staff stopped follow-ups';
  exception when others then if sqlerrm not like '%forbidden%' then raise; end if; end;

  perform set_config('request.jwt.claims', json_build_object('sub', v_admin)::text, true);

  -- 2. list + item
  if not exists (select 1 from jsonb_array_elements(public.bk_outreach_list('review')) e
                 where (e->>'id')::uuid = v_p and (e->>'score_total')::int = 12 and e->>'org' = 'Test Co') then
    raise exception 'TEST 2: ready pitch missing from the review list';
  end if;
  r := public.bk_outreach_item(v_p);
  if r->'pitch'->>'email_html' <> '<p>a</p>' or r->'prospect'->>'email' <> 'owner@testco-outreach.com'
     or jsonb_typeof(r->'events') <> 'array' or jsonb_typeof(r->'settings') <> 'object' then
    raise exception 'TEST 2b: item shape %', r;
  end if;
  begin perform public.bk_outreach_list('bogus'); raise exception 'TEST 2c: bad filter accepted';
  exception when others then if sqlerrm not like '%filter%' then raise; end if; end;

  -- 3. approve needs the exact hash, once
  begin perform public.bk_outreach_approve(v_p, 'hash-OLD'); raise exception 'TEST 3: stale hash approved';
  exception when others then if sqlerrm not like 'stale%' then raise; end if; end;
  perform public.bk_outreach_approve(v_p, 'hash-1');
  if (select status || '/' || approved_hash from public.bk_outreach_pitches where id = v_p) <> 'approved/hash-1' then
    raise exception 'TEST 3b: not approved';
  end if;
  begin perform public.bk_outreach_approve(v_p, 'hash-1'); raise exception 'TEST 3c: approved twice';
  exception when others then if sqlerrm not like '%approved%' then raise; end if; end;

  -- 4. unapprove returns it to review
  perform public.bk_outreach_unapprove(v_p);
  if (select status from public.bk_outreach_pitches where id = v_p) <> 'ready'
     or (select approved_hash from public.bk_outreach_pitches where id = v_p) is not null then
    raise exception 'TEST 4: unapprove did not reset';
  end if;

  -- 5. suppression: domain, free-mail exemption, org containment
  insert into public.bk_outreach_suppress (kind, value, reason) values ('domain', 'testco-outreach.com', 'client');
  begin perform public.bk_outreach_approve(v_p, 'hash-1'); raise exception 'TEST 5: suppressed domain approved';
  exception when others then if sqlerrm not like 'suppressed%' then raise; end if; end;
  delete from public.bk_outreach_suppress where value = 'testco-outreach.com';
  insert into public.bk_outreach_suppress (kind, value, reason) values ('domain', 'gmail.com', 'manual');
  if public.bk_outreach_is_suppressed('someone@gmail.com', 'Anything') then
    raise exception 'TEST 5b: a free-mail domain suppressed everyone';
  end if;
  insert into public.bk_outreach_suppress (kind, value, reason) values ('org', 'zz marching band', 'dead_lead');
  if not public.bk_outreach_is_suppressed(null, 'The ZZ Marching Band, LLC') then raise exception 'TEST 5c: org match'; end if;
  if public.bk_outreach_is_suppressed(null, 'ZZ Marchings Bandstand') then raise exception 'TEST 5d: org matched a different name'; end if;

  -- 6. edit voids approval; bad parts refused
  perform public.bk_outreach_approve(v_p, 'hash-1');
  perform public.bk_outreach_edit(v_p, jsonb_set(v_parts, '{subject}', '"New"'));
  if (select status from public.bk_outreach_pitches where id = v_p) <> 'rendering'
     or (select approved_hash from public.bk_outreach_pitches where id = v_p) is not null
     or (select parts->>'subject' from public.bk_outreach_pitches where id = v_p) <> 'New' then
    raise exception 'TEST 6: edit did not void approval';
  end if;
  begin perform public.bk_outreach_edit(v_p, jsonb_set(v_parts, '{email,paragraphs}', '[]'));
    raise exception 'TEST 6b: empty paragraphs accepted';
  exception when others then if sqlerrm not like '%paragraphs%' then raise; end if; end;
  begin perform public.bk_outreach_edit(v_p, v_parts - 'fu1'); raise exception 'TEST 6c: missing follow-up accepted';
  exception when others then if sqlerrm not like '%fu1%' then raise; end if; end;

  -- 7. skip: "I know them" suppresses for good; bad reason refused
  update public.bk_outreach_pitches set status = 'ready', content_hash = 'hash-2' where id = v_p;
  begin perform public.bk_outreach_skip(v_p, 'meh'); raise exception 'TEST 7: bad reason accepted';
  exception when others then if sqlerrm not like '%reason%' then raise; end if; end;
  perform public.bk_outreach_skip(v_p, 'know_them');
  if not public.bk_outreach_is_suppressed('owner@testco-outreach.com', 'Test Co') then raise exception 'TEST 7b: know_them did not suppress'; end if;
  if (select status from public.bk_outreach_prospects where id = v_pr) <> 'skipped' then raise exception 'TEST 7c: prospect not skipped'; end if;

  -- 8. DM: "I sent it" only once the page is live
  insert into public.bk_outreach_prospects (slug, org, lane, instagram) values ('zz-dm-shop', 'DM Shop', 'small_business', 'dmshop')
    returning id into v_dmpr;
  insert into public.bk_outreach_pitches (batch_date, prospect_id, offer_id, score, why, channel, parts, dm_text, content_hash)
    values (current_date, v_dmpr, 'content-day', '{"total":11}', 'why', 'dm', '{"dm":"Hi {{PROPOSAL_URL}}"}', 'Hi', 'h-dm')
    returning id into v_dm;
  begin perform public.bk_outreach_dm_sent(v_dm); raise exception 'TEST 8: dm_sent before the page was live';
  exception when others then if sqlerrm not like 'Not ready%' then raise; end if; end;
  update public.bk_outreach_pitches set status = 'dm_ready' where id = v_dm;
  perform public.bk_outreach_dm_sent(v_dm);
  if (select status from public.bk_outreach_pitches where id = v_dm) <> 'done' then raise exception 'TEST 8b: dm not done'; end if;

  -- 9. push only for events Nelson needs to see
  -- 9a (always): the trigger exists and fires for batch_ready but not for approved
  select pg_get_triggerdef(t.oid) into v_def from pg_trigger t
   where t.tgname = 'bk_outreach_push' and t.tgrelid = 'public.bk_outreach_events'::regclass and not t.tgisinternal;
  if v_def is null then raise exception 'TEST 9: push trigger missing'; end if;
  if v_def not like '%batch_ready%' or v_def like '%''approved''%' then raise exception 'TEST 9a: push trigger WHEN clause is wrong: %', v_def; end if;
  -- 9b (stub only): net.calls exists only in the PGlite stub, so the live dry run skips the call counting
  if to_regclass('net.calls') is not null then
    select count(*) into n from net.calls;
    insert into public.bk_outreach_events (pitch_id, kind) values (v_p, 'approved');
    if (select count(*) from net.calls) <> n then raise exception 'TEST 9: approved event pushed'; end if;
    insert into public.bk_outreach_events (kind, detail) values ('batch_ready', '{"count":3}');
    if (select count(*) from net.calls where url like '%/bk-push' and body->>'source' = 'outreach') < 1 then
      raise exception 'TEST 9b: batch_ready did not push';
    end if;
  end if;

  -- 10. RLS on every outreach table; private bucket + staff read policy
  select count(*) into n from pg_class c join pg_namespace s on s.oid = c.relnamespace
   where s.nspname = 'public' and c.relname like 'bk_outreach_%' and c.relkind = 'r' and c.relrowsecurity;
  if n <> 5 then raise exception 'TEST 10: RLS is on % of 5 outreach tables', n; end if;
  if not exists (select 1 from storage.buckets where id = 'outreach' and not public) then raise exception 'TEST 10b: bucket'; end if;
  if not exists (select 1 from pg_policies where tablename = 'objects' and policyname = 'outreach staff read') then
    raise exception 'TEST 10c: storage policy missing';
  end if;

  -- 11. internal functions are closed to signed-in users; staff RPCs stay open (gated inside)
  if has_function_privilege('authenticated', 'public.bk_outreach_is_suppressed(text,text)', 'execute') then
    raise exception 'TEST 11: authenticated can call bk_outreach_is_suppressed';
  end if;
  if not has_function_privilege('authenticated', 'public.bk_outreach_approve(uuid,text)', 'execute') then
    raise exception 'TEST 11b: authenticated cannot call bk_outreach_approve';
  end if;
  if not has_function_privilege('authenticated', 'public.bk_outreach_stop(uuid)', 'execute')
     or has_function_privilege('anon', 'public.bk_outreach_stop(uuid)', 'execute') then
    raise exception 'TEST 11c: bk_outreach_stop grants are wrong';
  end if;

  -- 12. a pitch already mid-sequence can never be approved again (that would resend the first email)
  insert into public.bk_outreach_prospects (slug, org, lane, email, email_source_url)
    values ('zz-seq-co', 'Seq Co', 'company', 'owner@seqco-outreach.com', 'https://seqco-outreach.com/team')
    returning id into v_spr;
  insert into public.bk_outreach_pitches (batch_date, prospect_id, offer_id, score, why, channel, parts,
      subject, email_html, fu1_html, fu2_html, content_hash, status, step_done, thread_ids, sent_at, next_at)
    values (current_date, v_spr, 'content-day', '{"total":12}', 'why', 'email', v_parts,
      'S', '<p>a</p>', '<p>b</p>', '<p>c</p>', 'hash-s', 'ready', 1, '{"<m1@x>"}', now(), now() + interval '4 days')
    returning id into v_s;
  begin perform public.bk_outreach_approve(v_s, 'hash-s'); raise exception 'TEST 12: mid-sequence pitch approved';
  exception when others then if sqlerrm not like '%already mid-sequence%' then raise; end if; end;
  if (select status from public.bk_outreach_pitches where id = v_s) <> 'ready' then raise exception 'TEST 12b: status changed'; end if;

  -- 13. Stop follow-ups: only from 'sent'; next_at cleared; logged as stopped by Nelson
  begin perform public.bk_outreach_stop(v_s); raise exception 'TEST 13: stopped a pitch that is not sent';
  exception when others then if sqlerrm not like 'Only a pitch with follow-ups still to send can be stopped%' then raise; end if; end;
  update public.bk_outreach_pitches set status = 'sent' where id = v_s;
  r := public.bk_outreach_stop(v_s);
  if r->>'status' <> 'cancelled' or (select status from public.bk_outreach_pitches where id = v_s) <> 'cancelled'
     or (select next_at from public.bk_outreach_pitches where id = v_s) is not null then
    raise exception 'TEST 13b: stop did not cancel the follow-ups';
  end if;
  if not exists (select 1 from public.bk_outreach_events where pitch_id = v_s and kind = 'cancelled' and detail->>'why' = 'stopped by Nelson') then
    raise exception 'TEST 13c: stop not logged';
  end if;
  begin perform public.bk_outreach_stop(v_s); raise exception 'TEST 13d: stopped twice';
  exception when others then if sqlerrm not like 'Only a pitch%' then raise; end if; end;
  update public.bk_outreach_pitches set status = 'sending' where id = v_s;
  begin perform public.bk_outreach_stop(v_s); raise exception 'TEST 13e: stopped mid-send';
  exception when others then if sqlerrm not like 'Only a pitch%' then raise; end if; end;
  raise notice 'OUTREACH SQL TESTS PASSED';
end $$;
