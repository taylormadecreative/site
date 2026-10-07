#!/usr/bin/env bash
# Rehearses scripts/apply-outreach.sh with fake curl/supabase/security on PATH. Touches nothing real.
set -uo pipefail
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
FAKE=$(mktemp -d); LOG="$FAKE/log"; STRAY="$ROOT/supabase/functions/bk-push/zz_stray_rehearsal.ts"
trap 'rm -rf "$FAKE"; rm -f "$STRAY"' EXIT
cat > "$FAKE/security" <<'E'
#!/bin/sh
printf 'go-keyring-base64:%s' "$(printf 'sbp_fake' | base64)"
E
cat > "$FAKE/curl" <<'E'
#!/bin/sh
body=""; for a in "$@"; do case "$a" in @*) body=$(cat "${a#@}");; esac; done
echo "curl $body" >> "$LOG"
case "$body" in
  *"OUTREACH DRY RUN OK"*) [ -n "${DRY_FAIL:-}" ] && { echo '{"message":"TEST 3 failed"}'; exit 22; }; echo '[{"result":"OUTREACH DRY RUN OK"}]';;
  *outreach_fns*) [ -n "${CHECK_FAIL:-}" ] && { echo '{"message":"check failed"}'; exit 22; }; if [ -n "${CHECK_BAD:-}" ]; then echo '[{"outreach_fns":11,"tables":5,"push_trigger":1,"private_bucket":1,"settings_rows":1}]'; else echo '[{"outreach_fns":12,"tables":5,"push_trigger":1,"private_bucket":1,"settings_rows":1}]'; fi;;
  *) echo '[]';;
esac
E
cat > "$FAKE/supabase" <<'E'
#!/bin/sh
echo "supabase $*" >> "$LOG"
if [ "$1 $2" = "functions download" ]; then
  mkdir -p supabase/functions/bk-push supabase/functions/_shared/inbox
  git -C "$ROOT" show "origin/main:supabase/functions/bk-push/index.ts" > supabase/functions/bk-push/index.ts
  git -C "$ROOT" show "origin/main:supabase/functions/_shared/inbox/push_message.ts" > supabase/functions/_shared/inbox/push_message.ts
  [ -n "${LIVE_CHANGED:-}" ] && echo "// changed" >> supabase/functions/bk-push/index.ts
fi
exit 0
E
chmod +x "$FAKE"/*
export PATH="$FAKE:$PATH" LOG ROOT
ALL="$FAKE/all"; : > "$ALL"
run() { : > "$LOG"; env SITE="$ROOT" "$@" bash "$ROOT/scripts/apply-outreach.sh" > "$FAKE/out" 2>&1; local rc=$?; cat "$FAKE/out" "$LOG" >> "$ALL"; echo $rc; }
fails=0; check() { if eval "$2"; then echo "ok   $1"; else echo "FAIL $1"; cat "$FAKE/out"; fails=1; fi; }

rc=$(run DRY_FAIL=1)
check "dry-run failure stops before any change" '[ "$rc" != 0 ] && ! grep -q "functions deploy" "$LOG" && [ "$(grep -c "^curl" "$LOG")" = 1 ]'
rc=$(run)
check "clean run applies, deploys bk-push only, checks" '[ "$rc" = 0 ] && grep -q "deploy bk-push" "$LOG" && ! grep -q "deploy bk-mailer" "$LOG" && [ "$(grep -c "^curl" "$LOG")" = 3 ]'
rc=$(run LIVE_CHANGED=1)
check "a changed live bk-push blocks the deploy, before any migration is applied" '[ "$rc" != 0 ] && ! grep -q "functions deploy" "$LOG" && grep -q "changed since" "$FAKE/out" && [ "$(grep -c "^curl" "$LOG")" = 1 ]'
rc=$(run CHECK_BAD=1)
check "wrong final counts exit non-zero (11 functions is the old count; 12 with bk_outreach_stop)" '[ "$rc" != 0 ] && grep -q "Checks FAILED" "$FAKE/out" && grep -q "outreach_fns" "$FAKE/out"'
rc=$(run CHECK_FAIL=1)
check "a failing check request exits non-zero with Checks FAILED" '[ "$rc" != 0 ] && grep -q "Checks FAILED" "$FAKE/out"'
echo "// stray" > "$STRAY"
rc=$(run)
rm -f "$STRAY"
check "an untracked file under supabase/functions blocks the run before any curl" '[ "$rc" != 0 ] && [ "$(grep -c "^curl" "$LOG")" = 0 ] && grep -q "Uncommitted" "$FAKE/out"'
check "no token printed in any run" '! grep -q sbp_fake "$ALL"'
exit $fails
