#!/usr/bin/env python3
"""Stop gate for owner-delegated autonomy (.claude/skills/apple-owner-autonomy).

Runs when the agent tries to end a turn. Until acceptance passes, the stop is blocked and the
agent is handed the unmet conditions. It allows the stop when:

  * .autonomy/STOP exists (the owner's off switch), or
  * the acceptance gate passes.

A broken or missing acceptance gate blocks with a diagnostic rather than silently allowing a stop.

Never prints anything when it allows a stop (the owner asked for no stop-time notices).
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(os.environ.get("AUTONOMY_ROOT") or os.environ.get("CLAUDE_PROJECT_DIR") or Path(__file__).resolve().parents[2])


def allow() -> None:
    sys.exit(0)


def unmet_conditions() -> list[str] | None:
    gate = ROOT / "scripts" / "autonomy-review-gate.py"
    if not gate.exists():
        return None
    try:
        r = subprocess.run([sys.executable, str(gate)], cwd=ROOT, capture_output=True, text=True, timeout=60)
    except Exception:
        return None
    if r.returncode == 0:
        return []
    return [line.strip()[2:] for line in r.stdout.splitlines() if line.strip().startswith("- ")]


def main() -> None:
    try:
        json.load(sys.stdin)
    except Exception:
        pass
    if (ROOT / ".autonomy" / "STOP").exists():
        allow()
    unmet = unmet_conditions()
    if unmet == []:
        allow()
    reason = (
        "Owner autonomy (apple-owner-autonomy): acceptance is not met. "
        + ("; ".join(unmet[:12]) if unmet else "The acceptance gate is missing or unreadable.")
        + " Continue with the highest-value actionable item, verify it, and record the result. "
        "Human-only steps go to docs/autonomy/OWNER_QUEUE.md. Do not ask the owner to do agent work."
    )
    print(json.dumps({"decision": "block", "reason": reason}))
    sys.exit(0)


if __name__ == "__main__":
    main()
