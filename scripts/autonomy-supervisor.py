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
  * --reviews-only runs reviewer sessions and nothing else, beside a live interactive Product Owner
    (owner, 2026-09-23: the interactive session stays until the product is ready). Reviewers only use
    the product and append findings, so the lock does not apply; the streak is still kept HERE. It
    exits 0 once the required streak is reached, 6 at MATERIAL_FINDINGS, and 7 for a review without
    fresh evidence or a valid verdict.
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
import argparse
import ctypes
import fcntl
import uuid
import os
import re
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
MAX_REVIEW_SESSIONS = int(os.environ.get("AUTONOMY_MAX_REVIEW_SESSIONS", "3"))
MAX_REVIEW_SECONDS = int(os.environ.get("AUTONOMY_MAX_REVIEW_SECONDS", str(4 * 60 * 60)))
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
    # Persist intent/receipts before acknowledging a lifecycle transition. Unique
    # temporary files also avoid clobbering an independent atomic writer's file.
    tmp = path.with_name(path.name + "." + uuid.uuid4().hex + ".tmp")
    try:
        with os.fdopen(os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), "w", encoding="utf-8") as f:
            f.write(json.dumps(value, indent=2, sort_keys=True) + "\n")
            f.flush()
            os.fsync(f.fileno())
        tmp.replace(path)
        directory = os.open(path.parent, os.O_RDONLY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
    finally:
        if tmp.exists():
            tmp.unlink()


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
every finding and a screenshot of the live product in the same directory. Name the production URL,
what you tried and what you actually observed. Append material findings to
docs/autonomy/CUSTOMER_FINDINGS.md in its exact line format. Then write .autonomy/result.json with
"review_verdict": "PASS" or "MATERIAL_FINDINGS", "status": "continue", "next_phase": "critic"
(or "implementer" if you found nothing), and both evidence paths. A PASS with no new report and
image, or while a critical/high finding remains open, cannot advance the review streak.
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
            stdin=subprocess.DEVNULL,
            pass_fds=(() if LEGACY_EXECUTION_FD is None else (LEGACY_EXECUTION_FD,)),
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
    elif verdict in ("MATERIAL_FINDINGS", "INVALID_REVIEW"):
        acc["fresh_reviews_without_material_blocker"] = 0
    else:
        return
    save_json(ACCEPTANCE, acc)


def valid_pass_evidence(result: dict, started_at: str) -> tuple[bool, str]:
    """A bare verdict cannot certify a customer review or reuse an old screenshot."""
    if result.get("status") != "continue":
        return False, "reviewer did not finish the customer review"
    try:
        findings = (DOCS / "CUSTOMER_FINDINGS.md").read_text(encoding="utf-8")
    except OSError:
        return False, "findings ledger unreadable"
    if re.search(r"^- \[open\]\[(?:critical|high)\] F-\d+:", findings, re.M):
        return False, "critical or high customer finding still open"

    paths = result.get("evidence")
    if not isinstance(paths, list) or not paths or not all(isinstance(p, str) for p in paths):
        return False, "reviewer supplied no evidence paths"
    root = (DOCS / "evidence").resolve()
    started = datetime.fromisoformat(started_at).timestamp()
    report = False
    screenshot = False
    for name in paths:
        try:
            file = (ROOT / name).resolve(strict=True)
            if not file.is_relative_to(root) or not file.is_file() or file.stat().st_mtime < started - 1:
                return False, "evidence is outside the review directory, absent, or stale"
            if file.name == "reviewer.md":
                body = file.read_text(encoding="utf-8")
                report = PRODUCTION_URL in body and len(body.strip()) >= 100
            elif file.suffix.lower() in (".png", ".jpg", ".jpeg", ".webp"):
                with file.open("rb") as image:
                    header = image.read(12)
                screenshot = screenshot or (header.startswith(b"\x89PNG\r\n\x1a\n")
                    or header.startswith(b"\xff\xd8\xff") or (header[:4] == b"RIFF" and header[8:12] == b"WEBP"))
        except (OSError, UnicodeError, ValueError):
            return False, "review evidence cannot be read"
    if not report or not screenshot:
        return False, "fresh report naming production and a readable screenshot are required"
    return True, ""


def next_role(current: str, result: dict) -> str:
    wanted = result.get("next_phase")
    if wanted in ROLES:
        return wanted
    return ROLES[(ROLES.index(current) + 1) % len(ROLES)] if current in ROLES else ROLES[0]


def ceilings_hit(state: dict):
    if state.get("max_sessions") is not None and int(state.get("iteration", 0)) >= int(state["max_sessions"]):
        return f"max_sessions {state.get('max_sessions')} reached"
    started = state.get("started_at")
    if started and state.get("max_wall_clock_hours") is not None:
        age_h = (datetime.now(timezone.utc) - datetime.fromisoformat(started)).total_seconds() / 3600
        if age_h >= float(state.get("max_wall_clock_hours", 72)):
            return f"max_wall_clock_hours {state.get('max_wall_clock_hours')} reached"
    return None


def legacy_main() -> int:
    reviews_only = "--reviews-only" in sys.argv[1:]
    review_window_started = time.monotonic()
    review_sessions = 0
    RUNTIME.mkdir(exist_ok=True)
    SESSIONS.mkdir(exist_ok=True)
    LOCKS.mkdir(exist_ok=True)

    owner = None if reviews_only else lock_holder(OWNER_LOCK)
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
            # Review-only work is beside the long-lived owner, often days later. The owner's
            # historical 72-hour/80-session ceiling must not prevent a new independent review;
            # this invocation has its own smaller wall-clock and session ceilings instead.
            if reviews_only:
                if review_sessions >= MAX_REVIEW_SESSIONS:
                    hit = f"max_review_sessions {MAX_REVIEW_SESSIONS} reached"
                elif time.monotonic() - review_window_started >= MAX_REVIEW_SECONDS:
                    hit = f"max_review_seconds {MAX_REVIEW_SECONDS} reached"
                else:
                    hit = None
            else:
                hit = ceilings_hit(state)
            if hit:
                state["status"] = "ceiling_reached"
                state["human_blocker"] = hit
                save_json(STATE_PATH, state)
                log(f"ceiling: {hit}")
                return 5

            role = "reviewer" if reviews_only else (state.get("phase") if state.get("phase") in ROLES else ROLES[0])
            if reviews_only:
                review_sessions += 1
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
            verdict = result.get("review_verdict")
            if role == "reviewer":
                if verdict == "PASS":
                    valid, why = valid_pass_evidence(result, state["last_session_started_at"])
                    if not valid:
                        log(f"iteration {iteration}: PASS rejected: {why}")
                        verdict = "INVALID_REVIEW"
                        result["review_verdict"] = verdict
                        result["review_evidence_error"] = why
                record_review(verdict)
            (SESSIONS / f"iteration-{iteration}-result.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
            if reviews_only:
                save_json(STATE_PATH, state)
                if verdict == "INVALID_REVIEW":
                    log(f"iteration {iteration}: reviewer did not supply valid live evidence; reviews-only run ends")
                    return 7
                if verdict == "MATERIAL_FINDINGS":
                    log(f"iteration {iteration}: reviewer found material findings; reviews-only run ends")
                    return 6
                if verdict != "PASS":
                    log(f"iteration {iteration}: reviewer returned no valid verdict; reviews-only run ends")
                    return 7
                acc = load_json(ACCEPTANCE, {})
                if int(acc.get("fresh_reviews_without_material_blocker", 0)) >= int(acc.get("required_fresh_reviews_without_material_blocker", 3)):
                    log("reviews-only: required fresh-review streak reached")
                    return 0
                continue
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


# Enduring strategic owner. Runtime and result receipts are deliberately separate
# from the fresh evaluators' state/result.json. No conversation bodies enter runtime.
OWNER_TERMINAL = {"stopped", "paused", "complete", "completed", "candidate_complete",
                  "human_blocked", "blocked", "supervisor_blocked", "ceiling_reached",
                  "reconciliation_blocked"}


def strict_json(path: Path) -> dict:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError("expected a JSON object")
    return value


def exclusive(path: Path):
    """Keep the inode: deleting a flock file permits two owners of different inodes."""
    path.parent.mkdir(parents=True, exist_ok=True)
    handle = path.open("a+")
    try:
        fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        handle.close()
        return None
    return handle


def process_identity(pid: int):
    """Kernel birth identity survives exec and rejects PID reuse (no argv read)."""
    if not isinstance(pid, int) or pid <= 0:
        return None
    if sys.platform == "darwin":
        # Layout from local SDK sys/proc_info.h, PROC_PIDTBSDINFO (flavor 3).
        class BSDInfo(ctypes.Structure):
            _fields_ = [("fields", ctypes.c_uint32 * 12),
                        ("comm", ctypes.c_char * 16), ("name", ctypes.c_char * 32),
                        ("more", ctypes.c_uint32 * 6),
                        ("start_sec", ctypes.c_uint64), ("start_usec", ctypes.c_uint64)]
        info = BSDInfo()
        lib = ctypes.CDLL("/usr/lib/libproc.dylib")
        lib.proc_pidinfo.argtypes = [ctypes.c_int, ctypes.c_int, ctypes.c_uint64,
                                    ctypes.c_void_p, ctypes.c_int]
        size = lib.proc_pidinfo(pid, 3, 0, ctypes.byref(info), ctypes.sizeof(info))
        if size != ctypes.sizeof(info) or info.fields[1] == 5:  # SZOMB
            return None
        return {"pid": pid, "start": f"{info.start_sec}.{info.start_usec:06d}"}
    if sys.platform.startswith("linux"):
        try:
            fields = Path(f"/proc/{pid}/stat").read_text().rsplit(") ", 1)[1].split()
            if fields[0] == "Z":
                return None
            boot = Path("/proc/sys/kernel/random/boot_id").read_text().strip()
            return {"pid": pid, "start": boot + ":" + fields[19]}
        except (OSError, IndexError):
            return None
    raise ValueError("kernel process birth identity unavailable on this OS")


def identity_matches(identity) -> bool:
    return isinstance(identity, dict) and process_identity(identity.get("pid", -1)) == identity


def owner_config(path: Path) -> dict:
    cfg = strict_json(path)
    root = Path(cfg["root"])
    if not root.is_absolute() or root.resolve() != ROOT.resolve():
        raise ValueError("configured root must equal the supervisor repository root")
    if not (root / "docs/autonomy/OWNER_PROMPT.md").is_file():
        raise ValueError("missing owner prompt")
    for key in ("python", "claude", "mission_path"):
        p = Path(cfg[key])
        if not p.is_absolute() or not p.is_file():
            raise ValueError(f"{key} must be an existing absolute file")
        if key != "mission_path" and not os.access(p, os.X_OK):
            raise ValueError(f"{key} must be executable")
    # Require an explicit Opus alias/id; this does not claim account availability.
    if not isinstance(cfg.get("model"), str) or not re.fullmatch(r"[A-Za-z0-9._:-]*opus[A-Za-z0-9._:-]*", cfg["model"]):
        raise ValueError("configure an explicit Opus model alias or id")
    cfg.setdefault("continuation_mode", "native_goal")
    if cfg["continuation_mode"] not in {"native_goal", "resumed_turn"}:
        raise ValueError("continuation_mode must be native_goal or explicit resumed_turn")
    if cfg["continuation_mode"] == "native_goal":
        condition = cfg.get("goal_condition")
        if (not isinstance(condition, str) or not 1 <= len(condition.strip()) <= 4000
                or any(ord(c) < 32 for c in condition)
                or condition.strip().lower() in {"clear", "stop", "off", "reset", "none", "cancel"}):
            raise ValueError("native goal requires a nonempty single-line condition of at most 4000 characters")
        cfg["goal_condition"] = condition.strip()
    for key, default in (("max_sessions", None), ("max_wall_clock_hours", None),
                         ("session_seconds", None), ("heartbeat_seconds", 5),
                         ("shutdown_grace_seconds", 15), ("max_failures", 3)):
        cfg.setdefault(key, default)
        value = cfg[key]
        if value is not None and (isinstance(value, bool) or not isinstance(value, (int, float)) or value <= 0):
            raise ValueError(f"{key} must be positive or null")
        if key in ("heartbeat_seconds", "shutdown_grace_seconds", "max_failures") and value is None:
            raise ValueError(f"{key} cannot be null")
    cfg.setdefault("backoff_seconds", [5, 30, 120])
    if not cfg["backoff_seconds"] or any(isinstance(x, bool) or not isinstance(x, (int, float)) or x < 0 or x > 600 for x in cfg["backoff_seconds"]):
        raise ValueError("backoff must contain delays between 0 and 600 seconds")
    return cfg


def owner_command(cfg: dict, session_id: str, resume: bool, prompt: str) -> list:
    native = cfg["continuation_mode"] == "native_goal"
    directive = "/goal " + cfg["goal_condition"] if native else prompt
    cmd = [cfg["claude"], "-p", directive, "--model", cfg["model"],
           "--output-format", "stream-json" if native else "json",
           "--permission-mode", "dontAsk", "--chrome",
           "--resume" if resume else "--session-id", session_id]
    if native:
        # Native Claude owns all turns inside this invocation. Re-arm the explicit
        # condition after an exit/recovery, retaining the same transcript UUID.
        # Snapshot off is documented by installed help: updated canonical context
        # and receipt paths must not inherit a stale resumed system-prompt snapshot.
        cmd += ["--verbose", "--append-system-prompt", prompt,
                "--system-prompt-snapshot", "off"]
    mcp = ROOT / "scripts/autonomy-mcp.json"
    if mcp.exists():
        cmd += ["--mcp-config", str(mcp)]
    return cmd


def mission_control(cfg: dict):
    mission_path = Path(cfg["mission_path"])
    mission = strict_json(mission_path)
    if not isinstance(mission.get("goal") or mission.get("objective"), str):
        raise ValueError("canonical mission has no goal/objective")
    status = mission.get("status")
    if status not in {"active", "running"}:
        return mission, "paused" if status == "paused" else "blocked" if status == "blocked" else "complete" if status in {"complete", "completed"} else "human_blocked"
    if STOP_PATH.exists() or (mission_path.parent / "STOP").exists():
        return mission, "stopped"
    return mission, None


def owner_prompt(cfg: dict, mission: dict, receipt: Path, recovery: bool) -> str:
    # Canonical current user state supersedes historical vision/handoffs. The file is
    # read anew on every turn, including --resume. Only selected fields are copied.
    current = {k: mission[k] for k in ("goal", "objective", "next_action", "current_truth", "scope_notes", "human_blockers") if k in mission}
    return (OWNER_PROMPT.read_text(encoding="utf-8") + "\n\nSTRATEGIC OWNER CONTROL\n"
            "You remain the strategic owner; do not rotate into or certify a fresh evaluator.\n"
            "Fresh evaluations run separately with --reviews-only. Never type a review streak.\n"
            f"Canonical user mission: {cfg['mission_path']}. Its current instructions supersede stale docs.\n"
            + json.dumps(current, ensure_ascii=False) + "\n"
            "Reinspect reality before acting. Preserve all STOP switches and safety hooks.\n"
            "Reread the canonical mission at the start of each native goal turn and respect current owner instructions.\n"
            "At native goal exit (or an explicit resumed-turn boundary), write an atomic JSON receipt ONLY at " + str(receipt) + ".\n"
            'Schema: {"status":"continue|candidate_complete|human_blocked", "next_action":"...", "evidence":[], "full_objective_audit":"docs/evidence/<full-owner-audit>.md", "human_blocker":null}.\n'
            "candidate_complete requires an existing full_objective_audit covering the entire approved owner objective, not just product or native goal completion.\n"
            "Do not write the evaluator's .autonomy/result.json or change canonical mission status.\n"
            + ("RECOVERY MODE: reconcile real external effects before repeating operations.\n" if recovery else ""))


def owner_agent(spec_path: Path) -> int:
    """Publish our own birth identity before exec; the relay cannot lose it."""
    spec = strict_json(spec_path)
    for fd in spec["lease_fds"]:
        os.fstat(fd)
        os.set_inheritable(fd, True)
    path = Path(spec["identity_path"])
    info = strict_json(path)
    if info.get("token") != spec["token"]:
        return 8
    info["agent"] = process_identity(os.getpid())
    save_json(path, info)
    runtime = strict_json(RUNTIME / "owner-runtime.json")
    child = runtime.get("child") or {}
    if (child.get("token") != spec["token"]
            or runtime.get("terminal_status") in OWNER_TERMINAL
            or runtime.get("status") in OWNER_TERMINAL):
        return 0
    _, halt = mission_control(spec["config"])
    if halt:
        return 0
    os.execv(spec["command"][0], spec["command"])
    return 127


def owner_child(spec_path: Path) -> int:
    """Small local relay: lease survives supervisor death and launch-record races.

    The relay writes its identity before starting Claude and a durable exit receipt
    after it finishes. It never requires a paid call itself. Claude and its helpers
    inherit the execution lease as a second safeguard if the relay crashes.
    """
    spec = strict_json(spec_path)
    lease_fds = tuple(int(fd) for fd in spec["lease_fds"])
    for fd in lease_fds:
        os.fstat(fd)  # must be the inherited open lease, never reopen it here
    identity_path = Path(spec["identity_path"])
    info = {"token": spec["token"], "relay": process_identity(os.getpid()), "agent": None}
    save_json(identity_path, info)
    cfg = spec["config"]
    _, halt = mission_control(cfg)
    if halt:
        save_json(Path(spec["exit_path"]), {"token": spec["token"], "rc": 0, "halt": halt})
        return 0
    proc = None
    terminating = False

    def forward(signum, frame):
        nonlocal terminating
        terminating = True
        if proc is not None and proc.poll() is None:
            proc.send_signal(signum)

    signal.signal(signal.SIGTERM, forward)
    signal.signal(signal.SIGINT, forward)
    with Path(spec["output_path"]).open("w", encoding="utf-8") as output:
        try:
            _, halt = mission_control(cfg)
            if terminating or halt:
                save_json(Path(spec["exit_path"]), {"token": spec["token"], "rc": 0, "halt": halt or "stopped"})
                return 0
            proc = subprocess.Popen([cfg["python"], str(Path(__file__).resolve()), "--owner-agent", str(spec_path)], cwd=ROOT, stdout=output,
                                    stderr=subprocess.STDOUT, stdin=subprocess.DEVNULL, pass_fds=lease_fds)
            if terminating and proc.poll() is None:
                proc.terminate()
            rc = proc.wait()
        except OSError:
            rc = 127
    save_json(Path(spec["exit_path"]), {"token": spec["token"], "rc": rc})
    return 0


def full_objective_audit(result: dict):
    reference = result.get("full_objective_audit")
    if not isinstance(reference, str) or not reference.strip():
        return None
    try:
        path = (ROOT / reference).resolve(strict=True)
        evidence_roots = ((ROOT / "docs/evidence").resolve(), (DOCS / "evidence").resolve())
        if not any(path.is_relative_to(folder) for folder in evidence_roots):
            return None
        if not path.is_file() or not path.read_text(encoding="utf-8").strip():
            return None
    except (OSError, ValueError, UnicodeError):
        return None
    return str(path.relative_to(ROOT.resolve()))


def provider_fatal(output_path: Path):
    """Read only bounded final-result metadata; never copy provider text to state."""
    if not output_path.exists():
        return None
    with output_path.open("rb") as f:
        f.seek(max(0, output_path.stat().st_size - 131072))
        tail = f.read().decode("utf-8", errors="replace")
    for line in reversed(tail.splitlines()):
        try:
            event = json.loads(line)
        except ValueError:
            continue
        if not isinstance(event, dict) or event.get("type") != "result":
            continue
        if event.get("is_error") is not True:
            return None
        message = event.get("result", "")
        if not isinstance(message, str):
            return None
        patterns = (
            (r"organization has disabled Claude subscription access", "provider_subscription_disabled"),
            (r"authentication fail|not authenticated|invalid api key|unauthorized", "provider_authentication_blocked"),
            (r"model (?:is )?(?:unavailable|not available)|model.*does not exist|does not have access to.*model", "provider_model_unavailable"),
            (r"insufficient credits|out of credits|credit balance.*(?:low|exhausted|insufficient)", "provider_credit_blocked"),
        )
        for pattern, code in patterns:
            if re.search(pattern, message, re.I):
                return code
        return None
    return None


def owner_main(config_path: Path, resume_paused: bool = False) -> int:
    cfg = owner_config(config_path)
    RUNTIME.mkdir(exist_ok=True)
    runtime_path = RUNTIME / "owner-runtime.json"
    lifecycle = exclusive(LOCKS / "owner-lifecycle.lock")
    if lifecycle is None:
        return 4
    mission_lifecycle = exclusive(Path(cfg["mission_path"]).parent / "claude-owner-supervisor.lock")
    if mission_lifecycle is None:
        lifecycle.close()
        return 4
    state = None
    lease = None
    mission_lease = None
    local_relay = None
    try:
        # Corruption is never converted into a blank state/new owner.
        state = strict_json(runtime_path) if runtime_path.exists() else {
            "schema": 1, "status": "ready", "iteration": 0, "failures": 0,
            "started_at": utc_now(), "session_id": str(uuid.uuid4()),
            "session_established": False, "child": None, "recovery": False,
        }
        terminal_halt = state.get("terminal_status") or (state["status"] if state["status"] in OWNER_TERMINAL else None)
        state["terminal_status"] = terminal_halt
        if resume_paused:
            # Operator intent is explicit. Never clear STOP, completion, blocking,
            # deadlines or unresolved child records as a side effect of resume.
            _, halt = mission_control(cfg)
            if terminal_halt != "paused" or halt is not None:
                raise ValueError("--resume-owner requires paused runtime and active canonical mission without STOP")
            terminal_halt = None
            state["terminal_status"] = None
            state["resumed_at"] = utc_now()
        state["supervisor"] = process_identity(os.getpid())
        state["model"] = cfg["model"]
        state["continuation_mode"] = cfg["continuation_mode"]
        state["mission_path"] = cfg["mission_path"]
        state["max_sessions"] = cfg["max_sessions"]
        state["max_wall_clock_hours"] = cfg["max_wall_clock_hours"]

        def pulse(status=None):
            if status:
                state["observation_status"] = status
                if status in OWNER_TERMINAL:
                    prior = state.get("terminal_status")
                    if prior is None or (prior in {"paused", "stopped"} and status not in {"paused", "stopped"}):
                        state["terminal_status"] = status
                    state["status"] = status
                else:
                    state["status"] = state.get("terminal_status") or status
            state["heartbeat_at"] = utc_now()
            save_json(runtime_path, state)

        stop_child_requested = False

        def control():
            nonlocal mission, stop_child_requested
            stop_child_requested = False
            try:
                mission, halt = mission_control(cfg)
            except (OSError, ValueError):
                return "human_blocked"
            if halt:
                stop_child_requested = True
                return halt
            if terminal_halt:
                return terminal_halt
            if shutdown_requested:
                return "detached"
            return None

        def wait_delay(seconds):
            deadline = time.monotonic() + seconds
            while time.monotonic() < deadline:
                if control():
                    return
                pulse("backoff")
                time.sleep(min(cfg["heartbeat_seconds"], max(0, deadline - time.monotonic())))

        mission = {}
        pulse("reconciling" if state.get("child") else "ready")
        while True:
            if local_relay is not None:
                local_relay.poll()
            halt = control()
            child = state.get("child")
            if child:
                identity_path = Path(child["identity_path"])
                info = strict_json(identity_path) if identity_path.exists() else {}
                if info and info.get("token") != child["token"]:
                    pulse("reconciliation_blocked")
                    return 8
                alive = [i for i in (info.get("relay"), info.get("agent")) if identity_matches(i)]
                # The relay may be between Popen and identity publication: a busy
                # inherited lease proves there can be no replacement yet.
                probe = exclusive(LOCKS / "execution.lock")
                if probe is not None:
                    probe.close()
                if alive or probe is None:
                    pulse("reconciling" if not alive else "observing_child")
                    if halt:
                        # Normal supervisor shutdown detaches, preserving children.
                        # STOP/mission terminal cooperatively ends only a VERIFIED
                        # child group. No default SIGKILL or restart of survivors.
                        if stop_child_requested and alive:
                            target = info.get("relay")
                            if identity_matches(target) and os.getpgid(target["pid"]) == target["pid"]:
                                try:
                                    os.killpg(target["pid"], signal.SIGTERM)
                                except ProcessLookupError:
                                    pass
                            elif identity_matches(info.get("agent")):
                                # If relay is gone, signal only the recorded agent.
                                try:
                                    os.kill(info["agent"]["pid"], signal.SIGTERM)
                                except ProcessLookupError:
                                    pass
                        if stop_child_requested:
                            deadline = time.monotonic() + cfg["shutdown_grace_seconds"]
                            while time.monotonic() < deadline:
                                pulse(halt)
                                # Publication can complete independently after the
                                # relay dies; retain STOP until the lease is free.
                                info = strict_json(identity_path) if identity_path.exists() else {}
                                for target in (info.get("relay"), info.get("agent")):
                                    if identity_matches(target):
                                        try:
                                            os.kill(target["pid"], signal.SIGTERM)
                                        except ProcessLookupError:
                                            pass
                                held = exclusive(LOCKS / "execution.lock")
                                if held is not None:
                                    held.close()
                                if held is not None and not any(identity_matches(i) for i in (info.get("relay"), info.get("agent"))):
                                    break
                                time.sleep(min(cfg["heartbeat_seconds"], max(0, deadline - time.monotonic())))
                        pulse(halt)
                        return 0
                    timeout = cfg["session_seconds"]
                    if timeout is not None and time.time() - child["started_epoch"] >= timeout:
                        # Preserve survivor; operator must decide recovery explicitly.
                        state["human_blocker"] = "session deadline exceeded; surviving child preserved"
                        pulse("human_blocked")
                        return 3
                    time.sleep(cfg["heartbeat_seconds"])
                    continue
                # Both recorded identities have exited and the execution lease is free.
                exit_path = Path(child["exit_path"])
                receipt = strict_json(exit_path) if exit_path.exists() else {}
                rc = receipt.get("rc", 125) if receipt.get("token") == child["token"] else 125
                state["child"] = None
                if info.get("agent"):
                    # An interrupted first turn may already have a native transcript.
                    # Try its recorded UUID; explicit missing-session errors reconstruct.
                    state["session_established"] = True
                state["last_session_finished_at"] = utc_now()
                if halt:
                    pulse(halt)
                    return 0
                if receipt.get("halt"):
                    pulse(receipt["halt"])
                    return 0
                fatal = provider_fatal(Path(child["output_path"]))
                if fatal:
                    state["human_blocker"] = fatal
                    state["provider_fatal"] = True
                    pulse("human_blocked")
                    return 3
                result_path = Path(child["result_path"])
                result = strict_json(result_path) if result_path.exists() else {}
                native = child.get("continuation_mode", "resumed_turn") == "native_goal"
                if native and rc == 0:
                    # No native stream-schema inference: a zero exit or met/impossible/
                    # paused/cleared message cannot certify the full owner objective.
                    state["native_exit_observed_at"] = utc_now()
                    audit = full_objective_audit(result)
                    explicit_candidate = result.get("status") == "candidate_complete" and audit is not None
                    state["acceptance_gate_passed"] = acceptance_gate() if explicit_candidate else False
                    if explicit_candidate and state["acceptance_gate_passed"]:
                        state["full_objective_audit"] = audit
                        state["session_established"] = True
                        pulse("candidate_complete")
                        return 0
                    if result.get("status") == "human_blocked":
                        pulse("human_blocked")
                        return 3
                    rc = 126  # missing/insufficient completion proof: bounded recovery
                if rc == 0 and result.get("status") in {"continue", "human_blocked", "candidate_complete"}:
                    state["session_established"] = True
                    state["failures"] = 0
                    state["recovery"] = False
                    if result["status"] == "human_blocked":
                        pulse("human_blocked")
                        return 3
                    audit = full_objective_audit(result)
                    if result["status"] == "candidate_complete" and audit is not None and acceptance_gate():
                        state["full_objective_audit"] = audit
                        pulse("candidate_complete")
                        return 0
                else:
                    state["failures"] += 1
                    state["recovery"] = True
                    # Reconstruct only after explicit local missing-session evidence;
                    # never interpret auth/model/provider errors as missing context.
                    output = Path(child["output_path"])
                    missing = False
                    if child["resume"] and output.exists() and output.stat().st_size <= 16384:
                        body = output.read_text(encoding="utf-8", errors="replace")
                        missing = bool(re.search(r"No conversation found with session ID", body, re.I))
                    if missing:
                        state["session_id"] = str(uuid.uuid4())
                        state["session_established"] = False
                        state["reconstructed_at"] = utc_now()
                    if state["failures"] >= cfg["max_failures"]:
                        pulse("supervisor_blocked")
                        return 2
                    delay = cfg["backoff_seconds"][min(state["failures"] - 1, len(cfg["backoff_seconds"]) - 1)]
                    state["retry_at_epoch"] = time.time() + delay
                    pulse("backoff")

            if halt:
                pulse(halt)
                return 0
            if state.get("retry_at_epoch", 0) > time.time():
                wait_delay(state["retry_at_epoch"] - time.time())
                continue
            if cfg["max_sessions"] is not None and state["iteration"] >= cfg["max_sessions"]:
                pulse("ceiling_reached")
                return 5
            if cfg["max_wall_clock_hours"] is not None and (datetime.now(timezone.utc) - datetime.fromisoformat(state["started_at"])).total_seconds() >= cfg["max_wall_clock_hours"] * 3600:
                pulse("ceiling_reached")
                return 5
            if lock_holder(OWNER_LOCK) is not None:
                state["human_blocker"] = "interactive product owner holds checkout"
                pulse("human_blocked")
                return 4
            lease = exclusive(LOCKS / "execution.lock")
            if lease is None:
                state["human_blocker"] = "unidentified execution lease holder; no replacement launched"
                pulse("reconciliation_blocked")
                return 8
            mission_lease = exclusive(Path(cfg["mission_path"]).parent / "claude-owner-execution.lock")
            if mission_lease is None:
                state["human_blocker"] = "canonical mission execution lease held in another checkout"
                pulse("reconciliation_blocked")
                return 8
            # Check again inside both execution leases before launching anything.
            if control():
                lease.close()
                lease = None
                mission_lease.close()
                mission_lease = None
                continue
            token = str(uuid.uuid4())
            folder = RUNTIME / "owner-sessions" / token
            folder.mkdir(parents=True, mode=0o700)
            child = {"token": token, "started_epoch": time.time(),
                     "resume": state["session_established"],
                     "continuation_mode": cfg["continuation_mode"],
                     "model": cfg["model"],
                     **{f"{kind}_path": str(folder / f"{kind}.json") for kind in ("identity", "exit", "result", "output")}}
            prompt = owner_prompt(cfg, mission, Path(child["result_path"]), state["recovery"])
            command = owner_command(cfg, state["session_id"], child["resume"], prompt)
            state["iteration"] += 1
            state["child"] = child
            pulse("launching")  # durable intent precedes Popen
            spec = {"token": token, "config": cfg, "lease_fds": [lease.fileno(), mission_lease.fileno()],
                    "command": command, **child}
            spec_path = folder / "spec.json"
            save_json(spec_path, spec)
            proc = subprocess.Popen([cfg["python"], str(Path(__file__).resolve()), "--owner-child", str(spec_path)],
                                    cwd=ROOT, pass_fds=(lease.fileno(), mission_lease.fileno()), start_new_session=True,
                                    stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            local_relay = proc
            # Poll/reap our relay without relying on a waitable child after restart.
            state["child"]["launch_identity"] = process_identity(proc.pid)
            pulse("observing_child")
            lease.close()
            lease = None
            mission_lease.close()
            mission_lease = None
            # Popen's internal active list reaps exited relay processes; identities
            # treat zombies as exited, while inherited lease guards descendants.
    finally:
        if lease is not None:
            lease.close()
        if mission_lease is not None:
            mission_lease.close()
        mission_lifecycle.close()
        lifecycle.close()


LEGACY_EXECUTION_FD = None


def main() -> int:
    global LEGACY_EXECUTION_FD
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--owner", action="store_true", help="persistent strategic owner, separate from evaluators")
    parser.add_argument("--config", type=Path)
    parser.add_argument("--resume-owner", action="store_true", help="explicitly resume paused owner runtime after canonical mission becomes active")
    parser.add_argument("--reviews-only", action="store_true")
    parser.add_argument("--owner-child", type=Path, help=argparse.SUPPRESS)
    parser.add_argument("--owner-agent", type=Path, help=argparse.SUPPRESS)
    args = parser.parse_args()
    if args.owner_child:
        return owner_child(args.owner_child)
    if args.owner_agent:
        return owner_agent(args.owner_agent)
    if args.owner:
        if args.reviews_only or not args.config:
            parser.error("--owner requires --config and cannot rotate into --reviews-only")
        return owner_main(args.config.resolve(), resume_paused=args.resume_owner)
    if args.config or args.resume_owner:
        parser.error("--config/--resume-owner require --owner")
    # Legacy lifecycle also gets a real atomic exclusion lock. The shared execution
    # lease excludes strategic owner vs legacy builder; evaluators are separate.
    runtime_lease = exclusive(LOCKS / "legacy-lifecycle.lock")
    if runtime_lease is None:
        return 4
    execution = None if args.reviews_only else exclusive(LOCKS / "execution.lock")
    if not args.reviews_only and execution is None:
        runtime_lease.close()
        return 4
    try:
        LEGACY_EXECUTION_FD = execution.fileno() if execution is not None else None
        return legacy_main()
    finally:
        LEGACY_EXECUTION_FD = None
        if execution is not None:
            execution.close()
        runtime_lease.close()


if __name__ == "__main__":
    signal.signal(signal.SIGTERM, request_shutdown)
    signal.signal(signal.SIGINT, request_shutdown)
    try:
        sys.exit(main())
    except (ValueError, KeyError, OSError):
        print("owner configuration/runtime unavailable or invalid; no replacement authorized", file=sys.stderr)
        sys.exit(8)
