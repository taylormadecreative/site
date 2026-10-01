#!/usr/bin/env bash
# Senior photos + Birthday Full paid-in-full rollout (2026-09-30).
# Run from Claude Code as:  ! bash ~/taylormade-site/scripts/apply-seniors.sh
#
# Order matters (money + booking safety):
#   1. drift guard      live booking functions must be the ones this was built on
#   2. dry run          everything below, inside a transaction that is ROLLED BACK
#   3. engine           migration: travel-aware slots, seniors installed SWITCHED OFF
#   4. calendar         bk-mailer redeploy (on-location events cover the drive) —
#                       only if the live mailer is still the copy this was built on
#   5. push             www (main) + book.taylormadecreative.net, wait until live
#   6. launch           seniors ON, Birthday Full deposit dropped
#   7. verify           through the same public API the widgets use
# Stops before the launch if anything earlier fails, so no page ever promises a
# price the checkout doesn't charge. Safe to re-run.
set -euo pipefail
REF=pgqdmnmessbbzyszjfvr
SITE=~/taylormade-site
BOOK=~/taylormade-book-seniors                             # worktree of ~/taylormade-book on branch seniors-listing
MIG=supabase/migrations/20260930_bk_senior_sessions.sql
LAUNCH=supabase/migrations/20260930b_bk_senior_launch.sql
PUB_KEY=sb_publishable_fyYqa9QkEeA5LD_0hYLTTA_F8Gxw1oz   # the public key already shipped in js/config.js
WANT_CREATE=b73f9e4c9ba4a04b66665b6e781f5fcb             # md5 of the LIVE bodies this was written against
WANT_SLOTS=2758bd0e765cf1ca713f05343eb22308
MAILER_BASE=dbcc3cc                                      # repo commit whose bk-mailer == live (checked 2026-09-30)
cd "$SITE"

echo "== 0/7 preflight"
[ "$(git rev-parse --abbrev-ref HEAD)" = main ] || { echo "~/taylormade-site must be on main."; exit 1; }
git diff --quiet HEAD -- . ':(exclude)supabase/.temp' || { echo "~/taylormade-site has uncommitted changes — tell Claude."; exit 1; }
[ -s assets/img/seniors/hero.jpg ] || { echo "No senior photos in the site yet (assets/img/seniors/hero.jpg) — not launching a page without them."; exit 1; }
grep -q "senior-photos" js/book.js || { echo "js/book.js has no senior redirect — tell Claude."; exit 1; }
if [ -d "$BOOK" ]; then
  git -C "$BOOK" diff --quiet HEAD || { echo "The book-site worktree has uncommitted changes — tell Claude."; exit 1; }
  ! grep -q SENIOR_PREVIEW "$BOOK/index.html" || { echo "The book site still has the SENIOR_PREVIEW placeholder — tell Claude."; exit 1; }
else
  echo "(book-site worktree missing — book.taylormadecreative.net will need its own push afterwards)"
fi
echo "ok: main @ $(git rev-parse --short HEAD)"

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
RAW=$(security find-generic-password -l "Supabase CLI" -w)
TOK=$(printf '%s' "${RAW#go-keyring-base64:}" | base64 -d)
q() { # run the SQL in file $1 via the Management API; prints the JSON result
  python3 -c 'import json,sys; print(json.dumps({"query": open(sys.argv[1]).read()}))' "$1" > "$TMP/body.json"
  curl -sS --fail-with-body -X POST "https://api.supabase.com/v1/projects/$REF/database/query" \
    -H "Authorization: Bearer $TOK" -H "Content-Type: application/json" --data-binary @"$TMP/body.json"
  echo
}
strip_tx() { grep -v -x -e 'begin;' -e 'commit;' "$1"; }   # so a file can run inside an outer transaction

echo "== 1/7 drift guard"
cat > "$TMP/drift.sql" <<'SQL'
select md5(pg_get_functiondef('public.bk_create_booking(text,timestamptz,text,text,text,text,text,text[])'::regprocedure)) as c,
       md5(pg_get_functiondef('public.bk_open_slots(text,date,date)'::regprocedure)) as s,
       to_regprocedure('public.bk_open_slots_where(text,date,date,boolean)') is not null as applied;
SQL
DRIFT=$(q "$TMP/drift.sql")
if [[ "$DRIFT" == *'"applied":true'* ]]; then
  echo "engine already applied once — re-running (idempotent)"
elif [[ "$DRIFT" != *"\"c\":\"$WANT_CREATE\""* || "$DRIFT" != *"\"s\":\"$WANT_SLOTS\""* ]]; then
  echo "$DRIFT"; echo "The LIVE booking functions changed since this was written. Nothing was changed — tell Claude."; exit 1
else
  echo "live functions match"
fi

echo "== 2/7 dry run (rolled back)"
{
  echo "begin;"
  echo "create temp table _before on commit drop as
          select s, jsonb_array_length(public.bk_open_slots(s, current_date, current_date + 14)->'slots') as n
            from unnest(array['digitals','headshots','birthday-mini','birthday-full','studio-hourly','studio-half-day','studio-full-day']) s
           where exists (select 1 from public.bk_services where slug = s and active);"
  strip_tx "$MIG"
  strip_tx "$LAUNCH"
  cat <<'SQL'
do $$
declare r record; m int; v_slot timestamptz; v_bk jsonb; v_bad int;
begin
  -- 1. studio availability is exactly what it was
  for r in select * from _before loop
    m := jsonb_array_length(public.bk_open_slots(r.s, current_date, current_date + 14)->'slots');
    if m <> r.n then raise exception 'studio availability changed for %: % -> %', r.s, r.n, m; end if;
  end loop;
  -- 2. prices
  if (select count(*) from public.bk_services where slug in ('senior-mini','senior-full')
        and active and location_ok and kind = 'session' and deposit_cents is null) <> 2 then
    raise exception 'senior services missing or wrong'; end if;
  if (select deposit_cents from public.bk_services where slug = 'birthday-full') is not null then
    raise exception 'birthday-full still takes a deposit'; end if;
  if (select deposit_cents from public.bk_services where slug = 'birthday-mini') is distinct from 7500 then
    raise exception 'birthday-mini deposit changed'; end if;
  -- 3. the travel rule, on the real calendar: hold an on-location Full session and
  --    make sure no headshot can start within the hour before or after it
  select (s.value #>> '{}')::timestamptz into v_slot
    from jsonb_array_elements(public.bk_open_slots_where('senior-full', current_date + 2, current_date + 14, true)->'slots') s limit 1;
  if v_slot is null then raise exception 'no on-location senior slots in the next 2 weeks'; end if;
  v_bk := public.bk_create_booking('senior-full', v_slot, 'Dry Run', 'dryrun@example.com', null, 'Dry run location, Dallas');
  if (select travel_min from public.bk_bookings where id = (v_bk->>'booking_id')::uuid) <> 60 then
    raise exception 'on-location booking did not record travel'; end if;
  if (select amount_cents from public.bk_invoices where id = (v_bk->>'invoice_id')::uuid) <> 35000 then
    raise exception 'senior full not charged $350'; end if;
  select count(*) into v_bad
    from jsonb_array_elements(public.bk_open_slots('headshots', (v_slot at time zone 'America/Chicago')::date, (v_slot at time zone 'America/Chicago')::date)->'slots') s
   where tstzrange((s.value #>> '{}')::timestamptz, (s.value #>> '{}')::timestamptz + interval '30 minutes')
         && tstzrange(v_slot - interval '60 minutes', v_slot + interval '120 minutes');
  if v_bad > 0 then raise exception 'travel not enforced: % headshot slots inside the drive window', v_bad; end if;
end $$;
select 'SENIORS DRY RUN OK' as result;
rollback;
SQL
} > "$TMP/dry.sql"
if ! q "$TMP/dry.sql" > "$TMP/dry.out" 2>&1 || ! grep -q "SENIORS DRY RUN OK" "$TMP/dry.out"; then
  cat "$TMP/dry.out"; echo "Dry run failed — nothing was changed."; exit 1
fi
echo "dry run OK (studio times identical, prices right, travel enforced)"

echo "== 3/7 engine (seniors installed switched OFF)"
q "$MIG" > "$TMP/apply.out" || { cat "$TMP/apply.out"; echo "Engine migration failed — nothing launched."; exit 1; }
echo "applied"

echo "== 4/7 calendar: on-location events cover the drive"
mkdir -p "$TMP/live" && (cd "$TMP/live" && supabase functions download bk-mailer --project-ref "$REF" >/dev/null 2>&1)
SAME=1
for f in bk-mailer/index.ts bk-mailer/gcal.ts _shared/inbox/reply_html.ts; do
  git show "$MAILER_BASE:supabase/functions/$f" | diff -q - "$TMP/live/supabase/functions/$f" >/dev/null 2>&1 || SAME=0
done
if [ "$SAME" = 1 ]; then
  supabase functions deploy bk-mailer --project-ref "$REF" --no-verify-jwt
else
  echo "SKIPPED: the live bk-mailer changed since $MAILER_BASE, not deploying over it. Bookings still block travel;"
  echo "         only the Google Calendar event won't show the drive. Tell Claude."
fi

echo "== 5/7 push the site, wait until it's live"
git push origin main
[ -d "$BOOK" ] && git -C "$BOOK" push origin HEAD:main
live() { curl -fsS "$1?cb=$(date +%s)$RANDOM" 2>/dev/null | grep -q "$2"; }
for i in $(seq 1 60); do
  if live https://www.taylormadecreative.net/js/book.js "senior-photos" \
     && live https://www.taylormadecreative.net/senior-photos/ "Senior year" \
     && live https://www.taylormadecreative.net/birthday/ "In full at booking"; then WWW=1; break; fi
  sleep 6
done
[ "${WWW:-}" = 1 ] || { echo "www isn't serving the new pages after 6 minutes. Seniors stay OFF and Birthday pricing is unchanged — tell Claude."; exit 1; }
echo "www is live"

echo "== 6/7 launch: seniors ON, Birthday Full paid in full"
q "$LAUNCH" > "$TMP/launch.out" || { cat "$TMP/launch.out"; echo "Launch failed — tell Claude."; exit 1; }
echo "launched"

echo "== 7/7 verify through the public API"
rpc() { curl -sS -o "$TMP/rpc.out" -w "%{http_code}" -X POST "https://$REF.supabase.co/rest/v1/rpc/$1" \
          -H "apikey: $PUB_KEY" -H "Authorization: Bearer $PUB_KEY" -H "Content-Type: application/json" -d "$2"; }
n() { python3 -c "import json,sys;print(len(json.load(open(sys.argv[1]))['slots']))" "$TMP/rpc.out"; }
FROM=$(TZ=America/Chicago date +%F); TO=$(TZ=America/Chicago date -v+14d +%F)
for i in 1 2 3 4 5; do   # PostgREST reloads its schema cache a moment after the migration
  CODE=$(rpc bk_open_slots_where "{\"p_service\":\"senior-full\",\"p_from\":\"$FROM\",\"p_to\":\"$TO\",\"p_on_location\":true}")
  [ "$CODE" = 200 ] && break; sleep 3
done
[ "$CODE" = 200 ] || { cat "$TMP/rpc.out"; echo; echo "bk_open_slots_where not reachable ($CODE) — tell Claude."; exit 1; }
echo "senior-full on location: $(n) open slots in the next 2 weeks"
CODE=$(rpc bk_open_slots_where "{\"p_service\":\"senior-mini\",\"p_from\":\"$FROM\",\"p_to\":\"$TO\",\"p_on_location\":false}"); echo "senior-mini studio:      $(n) open slots ($CODE)"
CODE=$(rpc bk_open_slots "{\"p_service\":\"headshots\",\"p_from\":\"$FROM\",\"p_to\":\"$TO\"}"); echo "headshots (old RPC):     $(n) open slots ($CODE)"
rpc bk_public_services "{}" >/dev/null
python3 - "$TMP/rpc.out" <<'PY'
import json, sys
rows = {r["slug"]: r for r in json.load(open(sys.argv[1]))}
for slug in ("senior-mini", "senior-full", "birthday-mini", "birthday-full"):
    r = rows.get(slug)
    print(f"{slug:14} " + (f"${r['price_cents']//100} · {r['duration_min']} min · " + (f"${r['deposit_cents']//100} deposit" if r["deposit_cents"] else "paid in full") if r else "MISSING"))
PY
echo "== DONE. https://www.taylormadecreative.net/senior-photos/ is live and bookable."
