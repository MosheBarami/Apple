#!/usr/bin/env bash
# Deterministic gate for the autonomy harness: what an implementer must pass before deploying.
#
#   bash scripts/autonomy-gate.sh            # full gate
#   AUTONOMY_EVIDENCE_DIR=docs/autonomy/evidence/<stamp> bash scripts/autonomy-gate.sh
#
# It runs the repository's own gates rather than re-implementing them: whitespace, the three
# typechecks the gate suite does not run, and scripts/gate-suite.mjs (builds + every suite + the
# checkers, with its own tree-fingerprint invariance). Exit 0 only if every part exits 0.
set -uo pipefail
cd "$(dirname "$0")/.."

EVIDENCE="${AUTONOMY_EVIDENCE_DIR:-}"
[ -n "$EVIDENCE" ] && mkdir -p "$EVIDENCE"
results=()
fail=0

run() {
  local name="$1"; shift
  local start end rc log
  log="$(mktemp -t autonomy-gate)"
  start=$(date +%s)
  ( "$@" ) >"$log" 2>&1
  rc=$?
  end=$(date +%s)
  printf '%-22s exit=%-3s %4ss\n' "$name" "$rc" "$((end - start))"
  if [ "$rc" -ne 0 ]; then fail=1; tail -40 "$log" | sed 's/^/    /'; fi
  [ -n "$EVIDENCE" ] && cp "$log" "$EVIDENCE/gate-$name.log"
  results+=("{\"part\":\"$name\",\"exit\":$rc,\"seconds\":$((end - start))}")
  rm -f "$log"
}

run diff-check        git diff --check
run typecheck-web     bash -c 'cd apps/web && npx tsc --noEmit'
run typecheck-worker  bash -c 'cd apps/worker && npx tsc --noEmit'
run typecheck-shared  bash -c 'cd packages/shared && npx tsc --noEmit'
run gate-suite        node scripts/gate-suite.mjs

if [ -n "$EVIDENCE" ]; then
  (IFS=,; printf '{"schema":1,"head":"%s","green":%s,"parts":[%s]}\n' \
    "$(git rev-parse HEAD)" "$([ $fail -eq 0 ] && echo true || echo false)" "${results[*]}") > "$EVIDENCE/tests.json"
fi
if [ $fail -eq 0 ]; then echo "AUTONOMY GATE GREEN"; else echo "AUTONOMY GATE RED"; fi
exit $fail
