#!/usr/bin/env bash
# Rehearses scripts/apply-inbox.sh with fake curl/supabase/security/npx on PATH. Touches nothing real.
set -uo pipefail
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
FAKE=$(mktemp -d); LOG="$FAKE/log"; trap 'rm -rf "$FAKE"' EXIT
cat > "$FAKE/security" <<'E'
#!/bin/sh
printf 'go-keyring-base64:%s' "$(printf 'sbp_fake' | base64)"
E
cat > "$FAKE/npx" <<'E'
#!/bin/sh
echo '{"publicKey":"PUBKEY","privateKey":"PRIVKEY"}'
E
cat > "$FAKE/curl" <<'E'
#!/bin/sh
body=""; for a in "$@"; do case "$a" in @*) body=$(cat "${a#@}");; esac; done
echo "curl $body" >> "$LOG"
case "$body" in
  *"INBOX DRY RUN OK"*) [ -n "${DRY_FAIL:-}" ] && { echo '{"message":"TEST 5 failed"}'; exit 22; }; echo '[{"result":"INBOX DRY RUN OK"}]';;
  *"count(*) as n from public.bk_config"*) [ -n "${HAS_VAPID:-}" ] && echo '[{"n":1}]' || echo '[{"n":0}]';;
  *) echo '[]';;
esac
E
cat > "$FAKE/supabase" <<'E'
#!/bin/sh
echo "supabase $*" >> "$LOG"
if [ "$1 $2" = "functions download" ]; then
  mkdir -p supabase/functions/bk-mailer
  git -C "$ROOT" show "aba6e53:supabase/functions/bk-mailer/index.ts" > supabase/functions/bk-mailer/index.ts
  git -C "$ROOT" show "aba6e53:supabase/functions/bk-mailer/gcal.ts" > supabase/functions/bk-mailer/gcal.ts
  [ -n "${LIVE_CHANGED:-}" ] && echo "// changed" >> supabase/functions/bk-mailer/gcal.ts
fi
exit 0
E
chmod +x "$FAKE"/*
export PATH="$FAKE:$PATH" LOG ROOT
run() { : > "$LOG"; env "$@" bash "$ROOT/scripts/apply-inbox.sh" > "$FAKE/out" 2>&1; echo $?; }
fails=0; check() { if eval "$2"; then echo "ok   $1"; else echo "FAIL $1"; cat "$FAKE/out"; fails=1; fi; }

rc=$(run DRY_FAIL=1)
check "dry-run failure stops before any change" '[ "$rc" != 0 ] && ! grep -q "secrets set\|functions deploy" "$LOG" && [ "$(grep -c "^curl" "$LOG")" = 1 ]'
rc=$(run)
check "fresh run sets keys (secret + config row) and deploys both" '[ "$rc" = 0 ] && grep -q "secrets set.*VAPID_PRIVATE_KEY=PRIVKEY" "$LOG" && grep -q "inbox_vapid_public.*PUBKEY" "$LOG" && grep -q "deploy bk-push" "$LOG" && grep -q "deploy bk-mailer" "$LOG"'
check "never deploys the removed draft function" '! grep -q "bk-draft-reply" "$LOG"'
rc=$(run HAS_VAPID=1)
check "re-run with keys on record keeps them" '[ "$rc" = 0 ] && ! grep -q "secrets set" "$LOG"'
rc=$(run LIVE_CHANGED=1 HAS_VAPID=1)
check "changed live mailer blocks the deploy" '[ "$rc" != 0 ] && ! grep -q "functions deploy" "$LOG" && grep -q "changed since" "$FAKE/out"'
check "no private key printed" '! grep -q PRIVKEY "$FAKE/out"'
exit $fails
