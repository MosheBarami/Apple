#!/usr/bin/env bash
# Upload a PEFT-format LoRA adapter to Workers AI.
#
# THE PATH THIS PROVES. Training happens locally in MLX; serving happens on Workers AI. Between
# them sit two format conversions and three API calls, and until this runs end to end the claim
# "a trained artifact is in the serving lineage" is an intention, not a fact.
#
#   1. POST .../ai/finetunes                              -> create, returns an id
#   2. POST .../ai/finetunes/{id}/finetune-assets          -> once per file, exactly two files
#
# NOTE THE MISSING TRAILING SLASH. Cloudflare's own documentation writes this path as
# `finetune-assets/`, and with the slash the API answers {"success":false,"errors":[{"message":
# "Route not found"}]}. Verified by probing both, 2026-09-14. Do not "restore" the slash.
#   3. inference with  "lora": "<id or name>"
#
# The two files must be named EXACTLY adapter_model.safetensors and adapter_config.json. Anything
# else is accepted by the upload and then ignored at serve time, which is the quiet failure this
# script exists to avoid.
#
# Usage:  ./upload_lora.sh <peft-dir> <base-model> <finetune-name>
set -euo pipefail

PEFT_DIR="${1:?usage: upload_lora.sh <peft-dir> <base-model> <finetune-name>}"
BASE_MODEL="${2:?}"
NAME="${3:?}"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
set -a; source "$ROOT/.env"; set +a
: "${CLOUDFLARE_API_TOKEN:?CLOUDFLARE_API_TOKEN not set}"
: "${CLOUDFLARE_ACCOUNT_ID:?CLOUDFLARE_ACCOUNT_ID not set}"
API="https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/ai/finetunes"

for f in adapter_model.safetensors adapter_config.json; do
  [ -f "$PEFT_DIR/$f" ] || { echo "missing $PEFT_DIR/$f — run mlx_to_peft.py first" >&2; exit 1; }
done

# Refuse before uploading rather than after. Cloudflare's limits are documented, so a violation is
# knowable here, and a rejected upload leaves a half-created finetune behind.
SIZE=$(wc -c < "$PEFT_DIR/adapter_model.safetensors")
if [ "$SIZE" -gt $((300 * 1024 * 1024)) ]; then
  echo "adapter is $((SIZE / 1000000))MB, over Cloudflare's 300MB limit" >&2; exit 1
fi

echo "==> creating finetune '$NAME' on $BASE_MODEL"
# Built by a script reading argv, not an inline one-liner: a JSON object literal inside a
# double-quoted shell string is brace-expanded and arrives as fragments.
BODY=$(MODEL="$BASE_MODEL" FT_NAME="$NAME" python3 - <<'PYEOF'
import json, os
print(json.dumps({
    "model": os.environ["MODEL"],
    "name": os.environ["FT_NAME"],
    "description": "Apple - Roblox/Luau adapter trained locally with MLX",
}))
PYEOF
)
CREATE=$(curl -sS -X POST "$API" \
  -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" -H 'Content-Type: application/json' \
  -d "$BODY")

ID=$(RESP="$CREATE" python3 - <<'PYEOF'
import json, os, sys
d = json.loads(os.environ["RESP"])
if not d.get("success"):
    print("CREATE FAILED:", [e.get("message") for e in d.get("errors", [])], file=sys.stderr)
    raise SystemExit(1)
print(d["result"]["id"])
PYEOF
)
echo "    id: $ID"

for f in adapter_config.json adapter_model.safetensors; do
  echo "==> uploading $f ($(wc -c < "$PEFT_DIR/$f") bytes)"
  RESP=$(curl -sS -X POST "$API/$ID/finetune-assets" \
    -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
    -F "file_name=$f" -F "file=@$PEFT_DIR/$f")
  RESP="$RESP" python3 - <<'PYEOF'
import json, os
d = json.loads(os.environ["RESP"])
print("    ok" if d.get("success") else "    FAILED: %s" % [e.get("message") for e in d.get("errors", [])])
raise SystemExit(0 if d.get("success") else 1)
PYEOF
done

echo "==> done. reference it in inference as:  \"lora\": \"$ID\"   (or \"$NAME\")"
echo "$ID"
