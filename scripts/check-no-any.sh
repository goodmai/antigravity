#!/usr/bin/env bash
# Fails if an explicit TypeScript `any` reappears in the strictly-typed
# pure domain modules. Pairs with `tsc --strict --checkJs` (which bans
# *implicit* any) to also ban *explicit* any — TS-grade safety on .js,
# with no risky source-to-.ts migration / build step.
set -euo pipefail

files=(
  smartcontracts/buckets/greenfield-core.js
  smartcontracts/buckets/lit-pricing.js
  smartcontracts/buckets/crypto-envelope.js
  smartcontracts/buckets/course-template.js
  smartcontracts/buckets/course-publish.js
  smartcontracts/buckets/greenfield-wallet-backend.js
)

# `any` as a TS type token: @type {…any…}, ": any", "<any>", "any[]".
pattern='@type \{[^}]*\bany\b|:[[:space:]]*any\b|<any>|\bany\[\]'

if grep -REn "$pattern" "${files[@]}"; then
  echo "✗ explicit 'any' found in a strictly-typed module (see above)" >&2
  exit 1
fi
echo "✓ no explicit 'any' in strictly-typed modules"
