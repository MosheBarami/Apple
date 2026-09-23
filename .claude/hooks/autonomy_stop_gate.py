#!/usr/bin/env python3
"""Stop gate for owner-delegated autonomy (.claude/skills/apple-owner-autonomy).

Runs when the agent tries to end a turn. If the acceptance gate still reports conditions the AGENT can
move, the stop is blocked and the agent is handed the list. It allows the stop when:

  * .autonomy/STOP exists (the owner's off switch), or
  * the acceptance gate passes, or
  * every remaining condition is owner-only (a finding listed under "Blocks findings" of an OPEN item in
    docs/autonomy/OWNER_QUEUE.md), or
  * two consecutive blocks produced no change in the repository — a loop that makes no progress is a burn,
    not autonomy, so the gate stands down until something changes.

Never prints anything when it allows a stop (the owner asked for no stop-time notices).
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(os.environ.get("AUTONOMY_ROOT") or os.environ.get("CLAUDE_PROJECT_DIR") or Path(__file__).resolve().parents[2])
STATE = ROOT / ".autonomy" / "stop-gate.json"
MAX_IDLE_BLOCKS = 2
QUEUE_LINE = re.compile(r"^- \[open\] Q-\d+:.*?Blocks findings:\s*(.+)$", re.M)


def allow() -> None:
    sys.exit(0)


def owner_blocked_findings() -> set[str]:
    queue = ROOT / "docs" / "autonomy" / "OWNER_QUEUE.md"
    if not queue.exists():
        return set()
    ids: set[str] = set()
    for m in QUEUE_LINE.finditer(queue.read_text(encoding="utf-8")):
        ids.update(re.findall(r"F-\d+", m.group(1)))
    return ids


WAIT_MAX_SECONDS = 20 * 60


def waiting_on_background_work() -> bool:
    """A turn that ends while background work the agent started is still running is waiting, not stopping.

    The agent writes `.autonomy/WAITING` = {"until": <unix seconds>, "on": "<what>"} when every remaining
    item depends on work already in flight (a workflow, a subagent, a Studio run it is watching). The
    marker is honoured for at most WAIT_MAX_SECONDS from when it was written, however far `until` says,
    so a forgotten marker cannot switch the gate off. Background agents keep editing the tree, which is
    why the idle rule below never fires in that state and each blocked stop was a paid no-op.
    """
    marker = ROOT / ".autonomy" / "WAITING"
    try:
        data = json.loads(marker.read_text(encoding="utf-8"))
        written = marker.stat().st_mtime
    except Exception:
        return False
    now = time.time()
    until = float(data.get("until", 0))
    return bool(data.get("on")) and now < min(until, written + WAIT_MAX_SECONDS)


def progress_signature() -> str:
    """What 'something changed' means: HEAD plus the dirty tree's content hashes."""
    def run(*args: str) -> str:
        try:
            return subprocess.run(args, cwd=ROOT, capture_output=True, text=True, timeout=20).stdout
        except Exception:
            return ""
    head = run("git", "rev-parse", "HEAD").strip()
    status = run("git", "status", "--porcelain")
    h = hashlib.sha256(head.encode())
    for line in sorted(status.splitlines()):
        path = ROOT / line[3:].strip().strip('"')
        h.update(line.encode())
        try:
            if path.is_file():
                h.update(str(path.stat().st_mtime_ns).encode())
        except OSError:
            pass
    return h.hexdigest()


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
    if waiting_on_background_work():
        allow()

    unmet = unmet_conditions()
    if not unmet:
        allow()  # gate passes, or cannot be read (never trap the agent on a broken instrument)

    blocked = owner_blocked_findings()
    doable: list[str] = []
    for cond in unmet:
        if cond.startswith("open ") and "findings:" in cond:
            ids = [f for f in re.findall(r"F-\d+", cond) if f not in blocked]
            if ids:
                doable.append(cond.split(":")[0] + ": " + ", ".join(ids))
        else:
            doable.append(cond)
    if not doable:
        allow()

    sig = progress_signature()
    try:
        state = json.loads(STATE.read_text(encoding="utf-8"))
    except Exception:
        state = {}
    idle = state.get("idle", 0) + 1 if state.get("sig") == sig else 0
    STATE.parent.mkdir(parents=True, exist_ok=True)
    STATE.write_text(json.dumps({"sig": sig, "idle": idle, "at": int(time.time())}), encoding="utf-8")
    if idle >= MAX_IDLE_BLOCKS:
        allow()

    reason = (
        "Owner autonomy (apple-owner-autonomy): acceptance is not met and these are yours to move — "
        + "; ".join(doable[:12])
        + ". Do not ask the owner or hand him anything; pick the highest-value item, act, verify in production, "
        "record it, and continue. Human-only steps go to docs/autonomy/OWNER_QUEUE.md without stopping."
    )
    print(json.dumps({"decision": "block", "reason": reason}))
    sys.exit(0)


if __name__ == "__main__":
    main()
