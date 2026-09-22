#!/usr/bin/env python3
"""Acceptance gate for the autonomy harness (docs/autonomy/RESEARCH-REPORT.md, "Acceptance contract").

Exit 0 only when docs/autonomy/ACCEPTANCE.json is ACTUALLY satisfied. Prints every unmet condition.

What makes it more than a JSON read:
  * open critical/high findings are COUNTED from docs/autonomy/CUSTOMER_FINDINGS.md, never taken from
    the numbers typed into ACCEPTANCE.json — a hand-typed 0 is exactly the self-certification this
    gate exists to refuse;
  * every flag or mission marked true must name at least one evidence path that exists on disk;
  * the fresh-review streak must reach the required count (the supervisor maintains that counter).
  * the parser is asserted non-vacuous: a findings file with zero parseable lines is a failure to
    observe, not a clean bill of health.
"""

from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path

ROOT = Path(os.environ.get("AUTONOMY_ROOT", Path(__file__).resolve().parent.parent))
ACCEPTANCE = ROOT / "docs" / "autonomy" / "ACCEPTANCE.json"
FINDINGS = ROOT / "docs" / "autonomy" / "CUSTOMER_FINDINGS.md"

REQUIRED_FLAGS = (
    "deterministic_gates_green", "production_deployed", "production_bytes_verified",
    "signed_in_browser_qa", "mobile_qa", "real_studio_end_to_end", "studio_readback_verified",
    "follow_up_edit_verified", "failure_recovery_verified", "database_security_verified",
    "production_error_reviewed",
)
LINE = re.compile(r"^- \[(open|closed)\]\[(critical|high|medium|low)\] (F-\d+):", re.M)


def count_open(text: str):
    rows = LINE.findall(text)
    open_rows = [(sev, fid) for state, sev, fid in rows if state == "open"]
    return len(rows), [f for s, f in open_rows if s == "critical"], [f for s, f in open_rows if s == "high"]


def main() -> int:
    problems = []
    try:
        acc = json.loads(ACCEPTANCE.read_text(encoding="utf-8"))
    except (OSError, ValueError) as e:
        print(f"ACCEPTANCE UNREADABLE — {e}")
        return 1
    evidence = acc.get("evidence") or {}

    def has_evidence(key: str) -> bool:
        paths = evidence.get(key) or []
        if isinstance(paths, str):
            paths = [paths]
        return any((ROOT / p).exists() for p in paths)

    for key in REQUIRED_FLAGS:
        if acc.get(key) is not True:
            problems.append(f"{key} is not true")
        elif not has_evidence(key):
            problems.append(f"{key} is true but names no existing evidence path")
    missions = acc.get("missions") or {}
    if not missions:
        problems.append("no customer missions are defined")
    for name, ok in missions.items():
        if ok is not True:
            problems.append(f"mission {name} has not succeeded")
        elif not has_evidence(f"mission:{name}"):
            problems.append(f"mission {name} is true but names no existing evidence path (evidence['mission:{name}'])")

    need = int(acc.get("required_fresh_reviews_without_material_blocker", 3))
    have = int(acc.get("fresh_reviews_without_material_blocker", 0))
    if have < need:
        problems.append(f"fresh reviews without a material blocker: {have} of {need}")

    try:
        total, crit, high = count_open(FINDINGS.read_text(encoding="utf-8"))
    except OSError as e:
        total, crit, high = 0, [], []
        problems.append(f"CUSTOMER_FINDINGS.md unreadable — {e}")
    if total == 0:
        problems.append("CUSTOMER_FINDINGS.md has no parseable finding lines — the count below would be vacuous")
    if crit:
        problems.append(f"open critical findings: {', '.join(crit)}")
    if high:
        problems.append(f"open high findings: {', '.join(high)}")

    if problems:
        print(f"ACCEPTANCE NOT MET — {len(problems)} unmet condition(s):")
        for p in problems:
            print(f"  - {p}")
        return 1
    print("ACCEPTANCE MET — every flag, mission and review condition holds, with evidence on disk")
    return 0


if __name__ == "__main__":
    sys.exit(main())
