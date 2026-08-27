#!/usr/bin/env bash
# Publish in-repo packages as @builtbygio/<id> on npmjs.com.
#
# Security-key (WebAuthn) 2FA does not use --otp. Do this instead:
#
#   1. Browser: npmjs.com → Access Tokens → Generate new token
#      Type: Automation  (bypass 2FA after you create it with the key)
#      Permission: publish on @builtbygio
#   2. npm login --auth-type=web   # or paste the token when npm login asks
#   3. ./script/publish-owned-packages.sh
#
# TOTP users can still pass --otp 123456.
set -euo pipefail
cd "$(dirname "$0")/.."

OTP=()
if [[ "${1:-}" == "--otp" ]]; then
  OTP=(--otp "$2")
fi

failed=0
ok=0
skipped=0

for dir in packages/*/; do
  dir=${dir%/}
  name=$(node -p "require('./$dir/package.json').name")
  ver=$(node -p "require('./$dir/package.json').version")
  if npm view "$name@$ver" version >/dev/null 2>&1; then
    echo "skip $name@$ver (already on registry)"
    skipped=$((skipped + 1))
    continue
  fi
  echo "=== npm publish $name@$ver from $dir ==="
  if (cd "$dir" && npm publish --access public --ignore-scripts "${OTP[@]}"); then
    ok=$((ok + 1))
  else
    echo "FAIL $name@$ver"
    failed=$((failed + 1))
  fi
done

echo "published=$ok skipped=$skipped failed=$failed"
if [[ "$failed" -ne 0 ]]; then
  echo "Security key: create an Automation token on npmjs.com, then npm login, then re-run this script."
  echo "Do not pass --otp unless you use an authenticator app."
  exit 1
fi
