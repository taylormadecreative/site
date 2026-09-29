#!/usr/bin/env bash
# Inbox app rollout. Run from Claude Code as:  ! bash ~/Downloads/apply-inbox.sh
# Safe to re-run: the migration is idempotent and every step checks what's already there.
set -euo pipefail
REF=pgqdmnmessbbzyszjfvr
SITE=~/taylormade-site
MAILER_BASE=aba6e53   # commit that synced the repo mailer to the live deployed copy (2026-09-29)
cd "$SITE"
[ "$(git rev-parse --abbrev-ref HEAD)" = inbox-app ] || { echo "Switch ~/taylormade-site to the inbox-app branch first (it is on $(git rev-parse --abbrev-ref HEAD))."; exit 1; }
echo "== Inbox rollout on inbox-app @ $(git rev-parse --short HEAD)"

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT   # never leave keys or SQL behind, even on failure

RAW=$(security find-generic-password -l "Supabase CLI" -w)
TOK=$(printf '%s' "${RAW#go-keyring-base64:}" | base64 -d)
q() { # run the SQL in file $1 via the Management API (curl: urllib gets Cloudflare-blocked); prints the JSON result
  python3 -c 'import json,sys; print(json.dumps({"query": open(sys.argv[1]).read()}))' "$1" > "$TMP/body.json"
  curl -sS --fail-with-body -X POST "https://api.supabase.com/v1/projects/$REF/database/query" \
    -H "Authorization: Bearer $TOK" -H "Content-Type: application/json" --data-binary @"$TMP/body.json"
  echo
}

echo "== 1/5 dry run: migration + tests inside a transaction that is ROLLED BACK"
{ echo "begin;"; cat supabase/migrations/20260923_bk_inbox.sql; cat supabase/tests/20260923_bk_inbox_test.sql;
  echo "select 'INBOX DRY RUN OK' as result;"; echo "rollback;"; } > "$TMP/dry.sql"
if ! q "$TMP/dry.sql" > "$TMP/dry.out" 2>&1 || ! grep -q "INBOX DRY RUN OK" "$TMP/dry.out"; then
  cat "$TMP/dry.out"; echo "Dry run failed — nothing was changed."; exit 1
fi
echo "dry run OK"

echo "== 2/5 apply migration for real"
q supabase/migrations/20260923_bk_inbox.sql

echo "== 3/5 alert keys (VAPID)"
echo "select count(*) as n from public.bk_config where key = 'inbox_vapid_public';" > "$TMP/vq.sql"
VOUT=$(q "$TMP/vq.sql")   # capture first: piping into grep -q can SIGPIPE q under pipefail and fake a "no"
if [[ "$VOUT" =~ \"n\":[[:space:]]*1([^0-9]|$) ]]; then
  echo "Alert keys already set — keeping them."
else
  # no public key on record (first run, or a run that died halfway): make a fresh pair and set BOTH halves
  npx --yes web-push@3.6.7 generate-vapid-keys --json > "$TMP/vapid.json"
  PUB=$(python3 -c "import json,sys;print(json.load(open(sys.argv[1]))['publicKey'])" "$TMP/vapid.json")
  PRIV=$(python3 -c "import json,sys;print(json.load(open(sys.argv[1]))['privateKey'])" "$TMP/vapid.json")
  supabase secrets set --project-ref "$REF" VAPID_PUBLIC_KEY="$PUB" VAPID_PRIVATE_KEY="$PRIV" >/dev/null
  printf "insert into public.bk_config (key, value) values ('inbox_vapid_public', '%s') on conflict (key) do update set value = excluded.value;" "$PUB" > "$TMP/vapid.sql"
  q "$TMP/vapid.sql" >/dev/null
  echo "Alert keys set."
fi

echo "== 4/5 deploy functions"
# guard: the mailer we deploy is built on the live copy as of $MAILER_BASE; if live changed since, stop
mkdir -p "$TMP/live" && (cd "$TMP/live" && supabase functions download bk-mailer --project-ref "$REF" >/dev/null)
for f in index.ts gcal.ts; do
  if ! git show "$MAILER_BASE:supabase/functions/bk-mailer/$f" | diff -q - "$TMP/live/supabase/functions/bk-mailer/$f" >/dev/null; then
    echo "The LIVE bk-mailer ($f) changed since it was synced ($MAILER_BASE). Not deploying over it — tell Claude."; exit 1
  fi
done
for f in bk-push bk-mailer; do
  supabase functions deploy "$f" --project-ref "$REF" --no-verify-jwt
done

echo "== 5/5 checks"
cat > "$TMP/check.sql" <<'SQL'
select (select count(*) from pg_proc where proname like 'bk_inbox_%') as inbox_fns,
       (select count(*) from pg_trigger where tgname in ('bk_inbox_alert','bk_inbox_client_msg','bk_inbox_fill_project','bk_inbox_studio_msg')) as triggers,
       (select count(*) from public.bk_config where key in ('inbox_push_secret','inbox_vapid_public')) as config_rows;
SQL
q "$TMP/check.sql"
echo "Expected: inbox_fns=10, triggers=4, config_rows=2."
echo "== DONE. Tell Claude it finished — Claude pushes both inbox-app branches, then you open book.taylormadecreative.net/inbox/ on your iPhone."
