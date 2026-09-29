#!/usr/bin/env bash
# Inbox app rollout. Run from Claude Code as:  ! bash ~/Downloads/apply-inbox.sh
set -euo pipefail
REF=pgqdmnmessbbzyszjfvr
SITE=~/taylormade-site
cd "$SITE"
git checkout -q inbox-app
echo "== Inbox rollout on $(git rev-parse --abbrev-ref HEAD) @ $(git rev-parse --short HEAD)"

RAW=$(security find-generic-password -l "Supabase CLI" -w)
TOK=$(printf '%s' "${RAW#go-keyring-base64:}" | base64 -d)
q() { # run SQL from a file via the Management API; prints the JSON result
  python3 - "$TOK" "$1" <<'PY'
import json, sys, urllib.request
tok, path = sys.argv[1], sys.argv[2]
req = urllib.request.Request(f"https://api.supabase.com/v1/projects/pgqdmnmessbbzyszjfvr/database/query",
  data=json.dumps({"query": open(path).read()}).encode(),
  headers={"Authorization": "Bearer " + tok, "Content-Type": "application/json", "User-Agent": "supabase-cli"})
try:
  print(urllib.request.urlopen(req).read().decode()[:2000])
except urllib.error.HTTPError as e:
  print("SQL ERROR:", e.read().decode()[:2000]); sys.exit(1)
PY
}
TMP=$(mktemp -d)

echo "== 1/5 dry run: migration + tests inside a transaction that is ROLLED BACK"
{ echo "begin;"; cat supabase/migrations/20260923_bk_inbox.sql; cat supabase/tests/20260923_bk_inbox_test.sql;
  echo "select 'INBOX DRY RUN OK' as result;"; echo "rollback;"; } > "$TMP/dry.sql"
q "$TMP/dry.sql" | tee "$TMP/dry.out"
grep -q "INBOX DRY RUN OK" "$TMP/dry.out" || { echo "Dry run failed — nothing was changed."; exit 1; }

echo "== 2/5 apply migration for real"
q supabase/migrations/20260923_bk_inbox.sql

echo "== 3/5 VAPID keys (only generated once)"
if supabase secrets list --project-ref "$REF" | grep -q VAPID_PRIVATE_KEY; then
  echo "VAPID keys already set — keeping them."
else
  npx --yes web-push@3.6.7 generate-vapid-keys --json > "$TMP/vapid.json"
  PUB=$(python3 -c "import json;print(json.load(open('$TMP/vapid.json'))['publicKey'])")
  PRIV=$(python3 -c "import json;print(json.load(open('$TMP/vapid.json'))['privateKey'])")
  supabase secrets set --project-ref "$REF" VAPID_PUBLIC_KEY="$PUB" VAPID_PRIVATE_KEY="$PRIV" >/dev/null
  printf "insert into public.bk_config (key, value) values ('inbox_vapid_public', '%s') on conflict (key) do update set value = excluded.value;" "$PUB" > "$TMP/vapid.sql"
  q "$TMP/vapid.sql"
  echo "VAPID keys set."
fi
rm -f "$TMP/vapid.json"

echo "== 4/5 deploy functions"
for f in bk-push bk-mailer; do
  supabase functions deploy "$f" --project-ref "$REF" --no-verify-jwt
done

echo "== 5/5 checks"
cat > "$TMP/check.sql" <<'SQL'
select (select count(*) from pg_proc where proname like 'bk_inbox_%') as inbox_fns,
       (select count(*) from pg_trigger where tgname in ('bk_inbox_alert','bk_inbox_client_msg')) as triggers,
       (select count(*) from public.bk_config where key in ('inbox_push_secret','inbox_vapid_public')) as config_rows,
       (select count(*) from public.bk_projects where inbox_handled_at is null) as needs_reply_now;
SQL
q "$TMP/check.sql"
echo "Expected: inbox_fns=8 (7 RPCs + bk_inbox_notify), triggers=2, config_rows=2, needs_reply_now=0."
echo "== DONE. Tell Claude it finished — Claude pushes both inbox-app branches, then you open book.taylormadecreative.net/inbox/ on your iPhone."
