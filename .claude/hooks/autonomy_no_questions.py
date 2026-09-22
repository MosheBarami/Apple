#!/usr/bin/env python3
"""Deny AskUserQuestion in this repository (.claude/skills/apple-owner-autonomy).

The owner delegated the product; a question hands work back to the one person who hired the agent so he
would not have to do it. The agent decides, records the decision in docs/autonomy/DECISIONS.md, and
continues. Human-only steps go to docs/autonomy/OWNER_QUEUE.md. `.autonomy/STOP` lifts the block.
"""

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
        "hookEventName": "PreToolUse",
        "permissionDecision": "deny",
        "permissionDecisionReason": (
            "Owner autonomy: do not ask the owner. Take the most reasonable option for young, non-technical "
            "Roblox creators, write one line in docs/autonomy/DECISIONS.md (what, why, how to reverse), and "
            "continue. If the step is genuinely human-only (payment, account creation, password/2FA, CAPTCHA), "
            "add it to docs/autonomy/OWNER_QUEUE.md and keep working on everything else."
        ),
    }
}))
sys.exit(0)
