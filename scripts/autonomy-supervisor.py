#!/usr/bin/env python3
"""Outer autonomy supervisor for Apple (docs/autonomy/RESEARCH-REPORT.md, "Outer supervisor").

Starts one FRESH agent process per session, rotates roles, enforces ceilings, honours the STOP switch,
and never trusts a child's own word for completion. Durable state is on disk, not in any transcript.

Differences from the report's reference script, each forced by a measurement on this machine:

  * The installed `claude` (2.1.280) has no --max-turns flag, so a session is bounded by wall clock
    (MAX_SESSION_SECONDS) and its process group is killed when it overruns.
  * result.json is cleared before each child starts. Without that, a child that crashes before
    writing its result is judged by the PREVIOUS child's result — a failure to observe rendered as
    an observation.
  * A Product-Owner lock (.autonomy/locks/product-owner.lock) makes the supervisor refuse to start
    while an interactive session is driving the same shared checkout (the report's "single Product
    Owner lock" risk row). A lock whose pid is dead is stale and is taken over.
  * Roles rotate. Customer-strangers and reviewers are given MISSION.md and the production URL only;
    DECISIONS.md, HANDOFF.md and the implementation rationale are withheld by construction.
  * The fresh-review counter in ACCEPTANCE.json is maintained HERE, from the reviewer's verdict, so the
    reviewer cannot certify its own streak and the builder cannot type it.

Test hook: AUTONOMY_AGENT_CMD (a JSON array; the literal "{PROMPT}" is replaced by the prompt) swaps
the agent executable, so tests/autonomy-supervisor.test.mjs can drive every branch without a model.
AUTONOMY_ROOT overrides the repository root for the same reason.
"""

from __future__ import annotations

import json
import os
import signal
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(os.environ.get("AUTONOMY_ROOT", Path(__file__).resolve().parent.parent))
RUNTIME = ROOT / ".autonomy"
DOCS = ROOT / "docs" / "autonomy"

STATE_PATH = RUNTIME / "state.json"
RESULT_PATH = RUNTIME / "result.json"
STOP_PATH = RUNTIME / "STOP"
PID_PATH = RUNTIME / "runner.pid"
SESSIONS = RUNTIME / "sessions"
LOCKS = RUNTIME / "locks"
SUPERVISOR_LOCK = LOCKS / "supervisor.lock"
OWNER_LOCK = LOCKS / "product-owner.lock"
LOG_PATH = RUNTIME / "supervisor.log"

OWNER_PROMPT = DOCS / "OWNER_PROMPT.md"
MISSION = DOCS / "MISSION.md"
ACCEPTANCE = DOCS / "ACCEPTANCE.json"

MAX_SESSION_SECONDS = int(os.environ.get("AUTONOMY_MAX_SESSION_SECONDS", str(2 * 60 * 60)))
BACKOFF_SECONDS = tuple(int(x) for x in os.environ.get("AUTONOMY_BACKOFF", "30,120,600").split(","))
PRODUCTION_URL = "https://apple.moshe-barami111.workers.dev"

ROLES = ("customer-stranger", "critic", "implementer", "reviewer")

DEFAULT_STATE = {
    "schema": 1,
    "status": "running",
    "phase": "customer-stranger",
    "iteration": 0,
    "started_at": None,
    "last_session_started_at": None,
    "last_session_finished_at": None,
    "consecutive_failures": 0,
    "max_consecutive_failures": 3,
    "max_sessions": 80,
    "max_wall_clock_hours": 72,
    "candidate_complete": False,
    "fresh_reviews_without_material_blocker": 0,
    "human_blocker": None,
}

shutdown_requested = False


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def log(msg: str) -> None:
    RUNTIME.mkdir(exist_ok=True)
    with LOG_PATH.open("a", encoding="utf-8") as f:
        f.write(f"{utc_now()} {msg}\n")


def request_shutdown(signum, frame) -> None:  # noqa: ARG001
    global shutdown_requested
    shutdown_requested = True


def load_json(path: Path, default: dict) -> dict:
    if not path.exists():
        return dict(default)
    try:
        with path.open("r", encoding="utf-8") as f:
            value = json.load(f)
        return value if isinstance(value, dict) else dict(default)
    except (OSError, ValueError):
        return dict(default)


def save_json(path: Path, value: dict) -> None:
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(value, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    tmp.replace(path)


def pid_alive(pid: int) -> bool:
    try:
        os.kill(pid, 0)
        return True
    except ProcessLookupError:
        return False
    except PermissionError:
        return True


def lock_holder(path: Path):
    try:
        pid = int(path.read_text(encoding="utf-8").split()[0])
    except (OSError, ValueError, IndexError):
        return None
    return pid if pid_alive(pid) else None


RUN_CONTROL = """
RUN CONTROL

This is a fresh execution session. Role for this session: {role}.

Before changing anything:
- read docs/autonomy/MISSION.md
- read docs/autonomy/CURRENT_STATE.md
- read docs/autonomy/NEXT_ACTION.md
- read docs/autonomy/ACCEPTANCE.json
- inspect the actual repository and live state needed for this iteration

Do not assume the previous agent was correct.

At the end of this session, atomically update:
- docs/autonomy/CURRENT_STATE.md
- docs/autonomy/NEXT_ACTION.md
- docs/autonomy/HANDOFF.md
- .autonomy/result.json

result.json schema:
{{
  "status": "continue" | "candidate_complete" | "human_blocked",
  "summary": "brief factual summary",
  "next_action": "single highest-value next action",
  "next_phase": "customer-stranger" | "critic" | "implementer" | "reviewer" | null,
  "evidence": ["paths/to/evidence"],
  "human_blocker": null
}}

Do not use candidate_complete unless docs/autonomy/ACCEPTANCE.json is actually satisfied; the
supervisor re-checks it with scripts/autonomy-review-gate.py and ignores the claim otherwise.
"""

STRANGER_PROMPT = """ROLE: FRESH ROBLOX CUSTOMER

You have never seen the implementation of Apple. You are not reviewing code and you do not know why
anything was built.

{mission}

Production URL: {url}

Use the production product exactly as a customer would, in the owner's signed-in Chrome and a safe
paired Roblox Studio place. Do NOT read: repository implementation rationale, docs/autonomy/DECISIONS.md,
docs/autonomy/HANDOFF.md, historical handoffs, prior reviewer reports.

While using Apple ask continuously: What is confusing without an explanation? What exists but gives no
value? What should be automatic? What important capability is missing? What exposes an internal detail?
What interrupts "tell the AI what I want -> see it built"? Did the AI actually change Studio when it
claimed to? Can I recover naturally? Would I pay for this?

Do not propose fixes until the mission is finished. Record, under docs/autonomy/evidence/<UTC stamp>/
customer-findings.md, and append one line per finding to docs/autonomy/CUSTOMER_FINDINGS.md in its
exact line format: goal, steps attempted, screenshots / Studio evidence, confusion, failures,
unexpectedly good behaviour, missing capabilities, unnecessary things. Return evidence, not excuses.

Then write .autonomy/result.json: {{"status": "continue", "summary": "...", "next_action": "...",
"next_phase": "critic", "evidence": [...], "human_blocker": null}}.
"""

REVIEWER_PROMPT = """ROLE: INDEPENDENT CUSTOMER REVIEWER

You did not build this product. You receive ONLY the mission, the production URL, the customer
acceptance missions and access to use the product. You do not receive implementation history,
architecture rationale, the builder's decisions or any list of things the builder claims are good —
do not read docs/autonomy/DECISIONS.md, HANDOFF.md, CURRENT_STATE.md or git history.

{mission}

Production URL: {url}

Use the product. Try to falsify the claim that it is ready. A material finding is anything that
prevents or seriously degrades a Roblox creation mission, makes the AI's claims differ from what
happened in Studio, creates substantial confusion, leaves a major required capability absent, creates a
security/reliability problem, or would cause a reasonable target customer not to trust the product.

Write your report to docs/autonomy/evidence/<UTC stamp>/reviewer.md with reproducible evidence for
every finding, append material findings to docs/autonomy/CUSTOMER_FINDINGS.md in its exact line format,
then write .autonomy/result.json with "review_verdict": "PASS" or "MATERIAL_FINDINGS", "status":
"continue", "next_phase": "critic" (or "implementer" if you found nothing), and your evidence paths.
Do not grade effort. Grade the product.
"""


def build_prompt(role: str, recovery: bool) -> str:
    mission = MISSION.read_text(encoding="utf-8") if MISSION.exists() else ""
    if role == "customer-stranger":
        prompt = STRANGER_PROMPT.format(mission=mission, url=PRODUCTION_URL)
    elif role == "reviewer":
        prompt = REVIEWER_PROMPT.format(mission=mission, url=PRODUCTION_URL)
    else:
        prompt = OWNER_PROMPT.read_text(encoding="utf-8") + "\n\n" + RUN_CONTROL.format(role=role)
    if recovery:
        prompt += (
            "\nRECOVERY MODE:\nThe preceding session did not exit cleanly. Before repeating any "
            "non-idempotent external operation, inspect Git, deployment state, database state, and the "
            "relevant provider state. Never assume the failed process did nothing.\n"
        )
    return prompt


def agent_command(prompt: str) -> list:
    override = os.environ.get("AUTONOMY_AGENT_CMD")
    if override:
        return [prompt if part == "{PROMPT}" else part for part in json.loads(override)]
    cmd = ["claude", "-p", prompt, "--output-format", "json", "--permission-mode", "dontAsk", "--chrome"]
    mcp = ROOT / "scripts" / "autonomy-mcp.json"
    if mcp.exists():
        cmd += ["--mcp-config", str(mcp)]
    return cmd


def run_session(iteration: int, role: str, recovery: bool) -> int:
    prompt = build_prompt(role, recovery)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    out = SESSIONS / f"{stamp}-iteration-{iteration}-{role}.json"
    with out.open("w", encoding="utf-8") as stdout:
        proc = subprocess.Popen(
            agent_command(prompt), cwd=ROOT, stdout=stdout, stderr=subprocess.STDOUT, text=True,
            start_new_session=True,
        )
        try:
            return proc.wait(timeout=MAX_SESSION_SECONDS)
        except subprocess.TimeoutExpired:
            os.killpg(proc.pid, signal.SIGTERM)
            try:
                proc.wait(timeout=30)
            except subprocess.TimeoutExpired:
                os.killpg(proc.pid, signal.SIGKILL)
                proc.wait()
            return 124


def acceptance_gate() -> bool:
    proc = subprocess.run(
        [sys.executable, str(ROOT / "scripts" / "autonomy-review-gate.py")], cwd=ROOT, check=False,
        env={**os.environ, "AUTONOMY_ROOT": str(ROOT)},
    )
    return proc.returncode == 0


def record_review(verdict) -> None:
    acc = load_json(ACCEPTANCE, {})
    if not acc:
        return
    if verdict == "PASS":
        acc["fresh_reviews_without_material_blocker"] = int(acc.get("fresh_reviews_without_material_blocker", 0)) + 1
    elif verdict == "MATERIAL_FINDINGS":
        acc["fresh_reviews_without_material_blocker"] = 0
    else:
        return
    save_json(ACCEPTANCE, acc)


def next_role(current: str, result: dict) -> str:
    wanted = result.get("next_phase")
    if wanted in ROLES:
        return wanted
    return ROLES[(ROLES.index(current) + 1) % len(ROLES)] if current in ROLES else ROLES[0]


def ceilings_hit(state: dict):
    if int(state.get("iteration", 0)) >= int(state.get("max_sessions", 80)):
        return f"max_sessions {state.get('max_sessions')} reached"
    started = state.get("started_at")
    if started:
        age_h = (datetime.now(timezone.utc) - datetime.fromisoformat(started)).total_seconds() / 3600
        if age_h >= float(state.get("max_wall_clock_hours", 72)):
            return f"max_wall_clock_hours {state.get('max_wall_clock_hours')} reached"
    return None


def main() -> int:
    RUNTIME.mkdir(exist_ok=True)
    SESSIONS.mkdir(exist_ok=True)
    LOCKS.mkdir(exist_ok=True)

    owner = lock_holder(OWNER_LOCK)
    if owner is not None:
        log(f"refusing to start: interactive Product Owner pid {owner} holds {OWNER_LOCK}")
        print(f"refusing to start: an interactive Product Owner (pid {owner}) is driving this checkout", file=sys.stderr)
        return 4
    other = lock_holder(SUPERVISOR_LOCK)
    if other is not None and other != os.getpid():
        print(f"refusing to start: supervisor pid {other} is already running", file=sys.stderr)
        return 4
    SUPERVISOR_LOCK.write_text(f"{os.getpid()}\n", encoding="utf-8")
    PID_PATH.write_text(f"{os.getpid()}\n", encoding="utf-8")

    state = load_json(STATE_PATH, DEFAULT_STATE)
    for k, v in DEFAULT_STATE.items():
        state.setdefault(k, v)
    if not state.get("started_at"):
        state["started_at"] = utc_now()
    state["status"] = "running"
    save_json(STATE_PATH, state)
    recovery = False

    try:
        while not shutdown_requested:
            if STOP_PATH.exists():
                state["status"] = "stopped"
                state["stopped_at"] = utc_now()
                save_json(STATE_PATH, state)
                log("STOP present: stopped")
                return 0
            hit = ceilings_hit(state)
            if hit:
                state["status"] = "ceiling_reached"
                state["human_blocker"] = hit
                save_json(STATE_PATH, state)
                log(f"ceiling: {hit}")
                return 5

            role = state.get("phase") if state.get("phase") in ROLES else ROLES[0]
            iteration = int(state.get("iteration", 0)) + 1
            state["iteration"] = iteration
            state["last_session_started_at"] = utc_now()
            save_json(STATE_PATH, state)
            if RESULT_PATH.exists():
                RESULT_PATH.unlink()
            log(f"iteration {iteration} role {role} recovery {recovery}")

            rc = run_session(iteration, role, recovery)
            state["last_session_finished_at"] = utc_now()

            if rc != 0:
                failures = int(state.get("consecutive_failures", 0)) + 1
                state["consecutive_failures"] = failures
                save_json(STATE_PATH, state)
                log(f"iteration {iteration} exited {rc}; consecutive failures {failures}")
                if failures >= int(state.get("max_consecutive_failures", 3)):
                    state["status"] = "supervisor_blocked"
                    state["human_blocker"] = f"{failures} consecutive sessions failed to make a clean exit."
                    save_json(STATE_PATH, state)
                    return 2
                recovery = True
                time.sleep(BACKOFF_SECONDS[min(failures - 1, len(BACKOFF_SECONDS) - 1)])
                continue

            recovery = False
            state["consecutive_failures"] = 0
            result = load_json(RESULT_PATH, {
                "status": "continue", "summary": "No result file produced.",
                "next_action": "Recover state and continue.", "human_blocker": None,
            })
            (SESSIONS / f"iteration-{iteration}-result.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
            if role == "reviewer":
                record_review(result.get("review_verdict"))
            state["phase"] = next_role(role, result)

            if result.get("status") == "human_blocked":
                state["status"] = "human_blocked"
                state["human_blocker"] = result.get("human_blocker")
                save_json(STATE_PATH, state)
                return 3
            if result.get("status") == "candidate_complete":
                if acceptance_gate():
                    state["status"] = "candidate_complete"
                    state["candidate_complete"] = True
                    save_json(STATE_PATH, state)
                    return 0
                log(f"iteration {iteration} claimed candidate_complete; acceptance gate refused")
                state["phase"] = "critic"
            save_json(STATE_PATH, state)
        return 0
    finally:
        try:
            if lock_holder(SUPERVISOR_LOCK) in (None, os.getpid()):
                SUPERVISOR_LOCK.unlink()
        except OSError:
            pass


if __name__ == "__main__":
    signal.signal(signal.SIGTERM, request_shutdown)
    signal.signal(signal.SIGINT, request_shutdown)
    sys.exit(main())
