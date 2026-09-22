#!/usr/bin/env python3
"""Deterministic PreToolUse guard (docs/autonomy/RESEARCH-REPORT.md, "Deterministic PreToolUse guard").

A prompt cannot enforce a boundary against an agent with real OS credentials; this can. It denies,
regardless of what any instruction says:

  * every mutating tool while .autonomy/STOP exists (the owner's emergency stop);
  * reads or writes of credential stores (Keychains, ~/.ssh, browser cookie / login databases,
    ~/.mcp-auth) and printing the repository's secret files (.env*, .dev.vars);
  * the destructive git operations this repository forbids in AGENTS.md §7 — reset, clean,
    force-push, stash, checkout, switch, restore, add -A / add -u / add . — because several agents
    share ONE working tree and each of those has destroyed a peer's uncommitted work before;
  * deleting the home directory or filesystem root, dumping the keychain, reading cookie databases,
    `wrangler delete`, and uploads to the Roblox asset API (AGENTS.md: never upload to the owner's
    Roblox account — Images and Decals can never be deleted).

It emits NO decision for anything else, so the normal permission system decides.
Tests: tests/autonomy-guard.test.mjs drives every rule red and green.
"""

from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path

ROOT = Path(os.environ.get("CLAUDE_PROJECT_DIR") or Path(__file__).resolve().parent.parent.parent)
STOP = ROOT / ".autonomy" / "STOP"

MUTATING_TOOLS = {"Bash", "Edit", "Write", "NotebookEdit", "MultiEdit"}

PROTECTED_PATHS = (
    r"/Library/Keychains/",
    r"/\.ssh/",
    r"/Google/Chrome/.*/(Cookies|Login Data)",
    r"/Library/Application Support/.*/(Cookies|Login Data)",
    r"/\.mcp-auth/",
)

FORBIDDEN_BASH = (
    (r"\bgit\s+reset\b", "git reset discards shared uncommitted work"),
    (r"\bgit\s+clean\b", "git clean deletes untracked peer work"),
    (r"\bgit\s+push\b[^\n;&|]*(--force\b|--force-with-lease\b|\s-f\b)", "force-push rewrites the remote"),
    (r"\bgit\s+stash\b", "git stash moves peers' uncommitted work out of the shared tree"),
    (r"\bgit\s+checkout\b", "git checkout overwrites working-tree files / moves the shared HEAD"),
    (r"\bgit\s+switch\b", "git switch moves the shared HEAD under other agents"),
    (r"\bgit\s+restore\b", "git restore discards uncommitted work"),
    (r"\bgit\s+add\s+(-A\b|--all\b|-u\b|--update\b|\.(\s|$))", "indiscriminate staging sweeps peers' work into your commit"),
    (r"\brm\s+-[a-zA-Z]*r[a-zA-Z]*f?[a-zA-Z]*\s+(/|~|\$HOME)(\s|/?$)", "recursive delete of / or the home directory"),
    (r"\bsecurity\s+(dump-keychain|find-(generic|internet)-password)\b", "keychain secret extraction"),
    (r"\bsqlite3\b.*(Cookies|Login Data)", "browser credential database access"),
    (r"\bwrangler\s+delete\b", "deleting a Cloudflare Worker"),
    (r"apis\.roblox\.com/assets/v1/assets", "uploading to the owner's Roblox account (never reversible for Images/Decals)"),
    (r"\b(cat|head|tail|less|more|bat|strings|xxd|od)\b[^\n|;&]*(\.env\b|\.env\.|\.dev\.vars\b)", "printing a secret file"),
)


def deny(reason: str) -> None:
    print(json.dumps({
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": "deny",
            "permissionDecisionReason": reason,
        }
    }))
    sys.exit(0)


def main() -> None:
    try:
        event = json.load(sys.stdin)
    except ValueError:
        sys.exit(0)
    tool = str(event.get("tool_name", ""))
    tool_input = event.get("tool_input") or {}

    if STOP.exists() and tool in MUTATING_TOOLS:
        deny("Autonomy STOP switch is active (.autonomy/STOP). No mutating tool use is permitted.")

    for key in ("file_path", "path", "notebook_path"):
        value = tool_input.get(key)
        if isinstance(value, str) and any(re.search(p, value) for p in PROTECTED_PATHS):
            deny(f"Protected credential store may not be read or modified: {value}")

    if tool == "Bash":
        command = str(tool_input.get("command", ""))
        for pattern, why in FORBIDDEN_BASH:
            if re.search(pattern, command):
                deny(f"Hard safety policy ({why}) blocked a command matching: {pattern}")
    sys.exit(0)


if __name__ == "__main__":
    main()
