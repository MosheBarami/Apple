#!/usr/bin/env bash
# Prove a LoRA adapter is APPLIED at serve time, rather than accepted and ignored.
#
# `upload_lora.sh` warns that a wrongly-named file "is accepted by the upload and then ignored at
# serve time". The same trap sits one level further on: an inference call that returns
# `success: true` with a `lora` field is exactly what you get when the adapter was silently
# dropped and the base model answered. So a green call proves nothing by itself, and this script
# refuses to report one.
#
# Three observations, because any two of them can be satisfied by a model that ignores the
# adapter:
#
#   1. base output != lora output          — something changed
#   2. base output == base output          — and it was not nondeterminism that changed it
#   3. a bogus lora id is REFUSED          — and the id is genuinely resolved, so a real id loads
#
# Drop any one and the conclusion stops following. Run 2 before believing 1; a differing output
# from a nondeterministic endpoint is a coin landing twice.
#
# Usage:  ./serving-probe.sh <base-model> <lora-id-or-name> [prompt]
set -euo pipefail

MODEL="${1:?usage: serving-probe.sh <base-model> <lora-id-or-name> [prompt]}"
LORA="${2:?}"
PROMPT="${3:-Write a Luau function that returns true when a cooldown has elapsed.}"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
set -a; source "$ROOT/.env"; set +a
: "${CLOUDFLARE_API_TOKEN:?CLOUDFLARE_API_TOKEN not set}"
: "${CLOUDFLARE_ACCOUNT_ID:?CLOUDFLARE_ACCOUNT_ID not set}"

API="https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/ai/run/$MODEL"

# temperature 0 and a fixed seed are what make observation 2 meaningful.
call() {
  local extra="${1:-}"
  local body
  body="$(PROMPT="$PROMPT" LORA_ARG="$extra" python3 -c 'import json,os; b={"prompt":os.environ["PROMPT"],"max_tokens":80,"temperature":0,"seed":7}; l=os.environ.get("LORA_ARG"); b.update({"lora":l} if l else {}); print(json.dumps(b))')"
  curl -s "$API" \
    -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
    -H 'Content-Type: application/json' \
    -d "$body"
}

field() { python3 -c "
import sys, json, hashlib
d = json.load(sys.stdin)
r = (d.get('result') or {}).get('response', '')
print(json.dumps({'success': d.get('success'), 'sha': hashlib.sha256(r.encode()).hexdigest()[:16], 'text': r[:160], 'errors': d.get('errors')}))
"; }

echo "==> model $MODEL   lora $LORA"

BASE_1="$(call '' | field)"
BASE_2="$(call '' | field)"
WITH="$(call "$LORA" | field)"
BOGUS="$(call '00000000-0000-0000-0000-000000000000' | field)"

python3 - "$BASE_1" "$BASE_2" "$WITH" "$BOGUS" <<'PY'
import json, sys
base1, base2, with_lora, bogus = (json.loads(a) for a in sys.argv[1:5])

print(f"  base       success={base1['success']} sha={base1['sha']}")
print(f"  base again success={base2['success']} sha={base2['sha']}")
print(f"  with lora  success={with_lora['success']} sha={with_lora['sha']}")
print(f"  bogus lora success={bogus['success']} errors={bogus['errors']}")
print()

deterministic = base1['sha'] == base2['sha']
differs = with_lora['sha'] != base1['sha']
resolves = bogus['success'] is False

# Each failure is reported as what it is. "The adapter is ignored" and "this endpoint is
# nondeterministic so the comparison cannot be made" are different findings, and collapsing them
# would report a verdict about the adapter that nobody reached by observing the adapter.
if not base1['success'] or not with_lora['success']:
    print("INCONCLUSIVE: a call failed, so nothing was compared.")
    print(f"  base errors: {base1['errors']}\n  lora errors: {with_lora['errors']}")
    sys.exit(2)
if not deterministic:
    print("INCONCLUSIVE: the base is not deterministic at temperature 0, so a differing")
    print("output cannot be attributed to the adapter. Nothing is claimed about serving.")
    sys.exit(2)
if not resolves:
    print("INCONCLUSIVE: a non-existent lora id was ACCEPTED, so the field is not resolved and")
    print("a differing output cannot be attributed to this adapter.")
    sys.exit(2)
if not differs:
    print("NOT SERVED: the adapter produced byte-identical output to the base. It was accepted")
    print("by the upload and ignored at serve time — the exact quiet failure this probe exists for.")
    sys.exit(1)

print("SERVED: the adapter is applied at inference.")
print("  - it changed the output, and the base is deterministic, so the change is the adapter")
print("  - an unknown lora id is refused, so the id was genuinely loaded")
PY
