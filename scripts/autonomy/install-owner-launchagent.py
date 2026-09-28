#!/usr/bin/env python3
"""Render validated owner configuration + LaunchAgent. Never bootstrap or kickstart."""
import argparse
import json
import os
import plistlib
import shutil
import subprocess
import sys
from pathlib import Path


def executable(value):
    path = Path(value).absolute()
    if not path.is_file() or not os.access(path, os.X_OK):
        raise ValueError("executable must exist at an absolute path")
    # Keep the invocation path, e.g. a Python venv entrypoint, rather than its target.
    return str(path)


def render(args):
    root = Path(args.root).resolve(strict=True)
    git = subprocess.run(["git", "-C", str(root), "rev-parse", "--show-toplevel"], capture_output=True, text=True)
    if git.returncode or Path(git.stdout.strip()).resolve() != root:
        raise ValueError("root must be the Git worktree root")
    for relative in ("scripts/autonomy-supervisor.py", "scripts/autonomy-review-gate.py", "docs/autonomy/OWNER_PROMPT.md", ".claude/hooks/autonomy_guard.py"):
        if not (root / relative).is_file():
            raise ValueError("root lacks the owner harness")
    settings = json.loads((root / ".claude/settings.json").read_text())
    if "autonomy_guard.py" not in json.dumps(settings.get("hooks", {}).get("PreToolUse", [])):
        raise ValueError("repository STOP guard is not wired")
    python = executable(args.python or sys.executable)
    claude = executable(args.claude or shutil.which("claude") or "")
    help_result = subprocess.run([claude, "--help"], capture_output=True, text=True, timeout=20)
    if help_result.returncode or any(flag not in help_result.stdout for flag in ("--model", "--resume", "--session-id", "--permission-mode", "--output-format", "--verbose", "--append-system-prompt", "--system-prompt-snapshot")):
        raise ValueError("installed Claude CLI does not expose required flags")
    mission = Path(args.mission).resolve(strict=True)
    value = json.loads(mission.read_text())
    if not value.get("goal") and not value.get("objective"):
        raise ValueError("canonical mission lacks an objective")
    import re
    if not re.fullmatch(r"[A-Za-z0-9._:-]*opus[A-Za-z0-9._:-]*", args.model):
        raise ValueError("specify the requested Opus alias/id; availability is not probed")
    condition = args.goal_condition
    if args.goal_condition_file:
        condition = Path(args.goal_condition_file).read_text().strip()
    if not condition or len(condition.strip()) > 4000 or any(ord(c) < 32 for c in condition) or condition.strip().lower() in {"clear", "stop", "off", "reset", "none", "cancel"}:
        raise ValueError("native goal condition must be a nonempty single line of at most 4000 characters")
    output = Path(args.output_dir).resolve()
    output.mkdir(parents=True, exist_ok=True, mode=0o700)
    config_path = output / "owner-config.json"
    plist_path = output / "com.moshe.apple.strategic-owner.plist"
    if config_path.exists() or plist_path.exists():
        raise ValueError("refusing to overwrite existing rendered configuration")
    cfg = {"root": str(root), "python": python, "claude": claude,
           "mission_path": str(mission), "model": args.model,
           "continuation_mode": "native_goal", "goal_condition": condition.strip(),
           "max_sessions": None, "max_wall_clock_hours": None, "session_seconds": None,
           "heartbeat_seconds": 5, "shutdown_grace_seconds": 15,
           "max_failures": 3, "backoff_seconds": [5, 30, 120]}
    template = plistlib.loads(Path(__file__).with_name("owner-launchagent.plist").read_bytes())
    replacements = {"PYTHON": python, "SUPERVISOR": str(root / "scripts/autonomy-supervisor.py"),
                    "CONFIG": str(config_path), "ROOT": str(root), "OUTPUT": str(output)}

    def fill(item):
        if isinstance(item, str):
            for key, val in replacements.items():
                item = item.replace("{{" + key + "}}", val)
            return item
        if isinstance(item, list):
            return [fill(x) for x in item]
        if isinstance(item, dict):
            return {k: fill(v) for k, v in item.items()}
        return item

    plist = plistlib.dumps(fill(template))
    if args.install:
        destination = Path.home() / "Library/LaunchAgents" / plist_path.name
        if destination.exists():
            raise ValueError("refusing to overwrite an installed LaunchAgent")
    config_path.write_text(json.dumps(cfg, indent=2) + "\n")
    config_path.chmod(0o600)
    plist_path.write_bytes(plist)
    if args.install:
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(plist)
        print(f"Installed inactive plist: {destination}")
    print(f"Rendered inactive files: {config_path}, {plist_path}")
    print("No launchctl call made. Model access, authentication and GUI permissions remain unverified.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", required=True)
    parser.add_argument("--mission", required=True)
    parser.add_argument("--model", required=True)
    parser.add_argument("--output-dir", required=True)
    goal = parser.add_mutually_exclusive_group(required=True)
    goal.add_argument("--goal-condition", help="concise full-objective acceptance condition, at most 4000 characters")
    goal.add_argument("--goal-condition-file", help="UTF-8 file containing the full-objective condition on one line")
    parser.add_argument("--python")
    parser.add_argument("--claude")
    parser.add_argument("--install", action="store_true", help="copy plist into user LaunchAgents, without loading it")
    try:
        render(parser.parse_args())
    except (ValueError, OSError, subprocess.TimeoutExpired):
        print("configuration validation failed; no activation performed", file=sys.stderr)
        sys.exit(1)
