#!/usr/bin/env python3
"""Add the owner-autonomy contract to every prompt in this repository (.claude/skills/apple-owner-autonomy)."""

import json
import os
import sys
from pathlib import Path

ROOT = Path(os.environ.get("CLAUDE_PROJECT_DIR") or Path(__file__).resolve().parents[2])

try:
    json.load(sys.stdin)
except Exception:
    pass

if (ROOT / ".autonomy" / "STOP").exists():
    sys.exit(0)

print(json.dumps({
    "hookSpecificOutput": {
        "hookEventName": "UserPromptSubmit",
        "additionalContext": (
            "Owner autonomy is in force (.claude/skills/apple-owner-autonomy): the owner delegated the product. "
            "Decide instead of asking, do every step you are permitted to do yourself, keep working until "
            "docs/autonomy/ACCEPTANCE.json passes, and route only payments, account creation, passwords/2FA and "
            "CAPTCHAs to docs/autonomy/OWNER_QUEUE.md without stopping."
        ),
    }
}))
sys.exit(0)
