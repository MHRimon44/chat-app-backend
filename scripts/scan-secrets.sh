#!/usr/bin/env bash
set -euo pipefail

matches="$({
  rg --hidden --glob '!node_modules/**' --glob '!.yarn/**' --glob '!*.zip' \
    '(BEGIN (RSA|OPENSSH|EC) PRIVATE KEY|AKIA[0-9A-Z]{16}|mongodb(\+srv)?://[^[:space:]]+:[^[:space:]]+@)' . || true
} | rg -v '(<[^>]+>|replace_with_|user:password|root:rootpass|chatuser:(PASSWORD|\\<PASSWORD\\>))' || true)"

if [[ -n "$matches" ]]; then
  echo "$matches"
  echo 'Potential secret material detected.' >&2
  exit 1
fi

echo 'No high-confidence secret patterns detected.'
