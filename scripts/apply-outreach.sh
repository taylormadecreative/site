#!/usr/bin/env bash
# Pitch Agent database + push rollout. Nelson runs it from Claude Code as:  ! bash ~/Downloads/apply-outreach.sh
# Safe to re-run: the migration is idempotent and every step checks what's already there.
set -euo pipefail
REF=pgqdmnmessbbzyszjfvr
SITE=${SITE:-$HOME/taylormade-site-outreach}
PUSH_BASE=${PUSH_BASE:-origin/main}   # the bk-push the LIVE function must match before we deploy over it
cd "$SITE"
[ "$(git rev-parse --abbrev-ref HEAD)" = outreach ] || { echo "Use the outreach worktree ($SITE on branch outreach)."; exit 1; }
[ -z "$(git status --porcelain -- supabase/functions supabase/migrations/20261008_bk_outreach.sql)" ] \
  || { echo "Uncommitted changes in supabase/functions or the outreach migration. Deploy only committed code — tell Claude."; exit 1; }
echo "== Pitch Agent rollout on outreach @ $(git rev-parse --short HEAD)"

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT   # never leave keys or SQL behind, even on failure
RAW=$(security find-generic-password -l "Supabase CLI" -w)
TOK=$(printf '%s' "${RAW#go-keyring-base64:}" | base64 -d)
q() { # run the SQL in file $1 via the Management API (curl: urllib gets Cloudflare-blocked)
  python3 -c 'import json,sys; print(json.dumps({"query": open(sys.argv[1]).read()}))' "$1" > "$TMP/body.json"
  local rc=0
  curl -sS --fail-with-body -X POST "https://api.supabase.com/v1/projects/$REF/database/query" \
    -H "Authorization: Bearer $TOK" -H "Content-Type: application/json" --data-binary @"$TMP/body.json" || rc=$?
  echo
  return $rc
}

echo "== 1/4 dry run: migration + tests inside a transaction that is ROLLED BACK"
{ echo "begin;"; cat supabase/migrations/20261008_bk_outreach.sql; cat supabase/tests/20261008_bk_outreach_test.sql;
  echo "select 'OUTREACH DRY RUN OK' as result;"; echo "rollback;"; } > "$TMP/dry.sql"
if ! q "$TMP/dry.sql" > "$TMP/dry.out" 2>&1 || ! grep -q "OUTREACH DRY RUN OK" "$TMP/dry.out"; then
  cat "$TMP/dry.out"; echo "Dry run failed — nothing was changed."; exit 1
fi
echo "dry run OK"

echo "== 2/4 check the live bk-push still matches $PUSH_BASE (before anything is changed)"
mkdir -p "$TMP/live" && (cd "$TMP/live" && supabase functions download bk-push --project-ref "$REF" >/dev/null)
for f in bk-push/index.ts _shared/inbox/push_message.ts; do
  live="$TMP/live/supabase/functions/$f"
  [ -f "$live" ] || { echo "Couldn't download the live $f to compare. Nothing changed — tell Claude."; exit 1; }
  if ! git show "$PUSH_BASE:supabase/functions/$f" | diff -q - "$live" >/dev/null; then
    echo "The LIVE $f changed since $PUSH_BASE. Nothing changed — tell Claude."; exit 1
  fi
done
echo "live bk-push matches"

echo "== 3/4 apply migration for real, then deploy bk-push"
q supabase/migrations/20261008_bk_outreach.sql
supabase functions deploy bk-push --project-ref "$REF" --no-verify-jwt

echo "== 4/4 checks"
cat > "$TMP/check.sql" <<'SQL'
select (select count(*) from pg_proc where proname like 'bk_outreach_%') as outreach_fns,
       (select count(*) from pg_tables where schemaname = 'public' and tablename like 'bk_outreach_%') as tables,
       (select count(*) from pg_trigger where tgname = 'bk_outreach_push') as push_trigger,
       (select count(*) from storage.buckets where id = 'outreach' and not public) as private_bucket,
       (select count(*) from public.bk_outreach_settings) as settings_rows;
SQL
if ! q "$TMP/check.sql" > "$TMP/check.out"; then cat "$TMP/check.out"; echo "Checks FAILED — tell Claude"; exit 1; fi
cat "$TMP/check.out"
python3 - "$TMP/check.out" <<'PY' || { echo "Checks FAILED — tell Claude."; exit 1; }
import json, sys
want = {"outreach_fns": 12, "tables": 5, "push_trigger": 1, "private_bucket": 1, "settings_rows": 1}
got = json.loads(open(sys.argv[1]).read().strip())[0]
bad = {k: (got.get(k), v) for k, v in want.items() if int(got.get(k, -1)) != v}
if bad:
    print("Mismatch (got, expected):", bad); sys.exit(1)
print("All checks match.")
PY
echo "== DONE. Tell Claude it finished."
