"""Apple: turn the critic's blind A/B answer into a gauntlet verdict about ours vs the reference.

Output JSON: {"winner": "ours"|"reference", "confidence", "biggest_gap", "gaps": [{"area", "gap",
"fix"}], "reference_gaps": [...], "record": "<scripts/gauntlet-verdict.mjs command>", "blind": true}
`gaps` is always what OUR shot lacks, whichever image won, because a win still names a gap.
"""

import json
import re
import shlex

from lfx.custom.custom_component.component import Component
from lfx.io import MessageTextInput, Output
from lfx.schema.message import Message

AREAS = {"map", "models", "ui"}


def first_json_object(text: str) -> dict:
    text = re.sub(r"```(?:json)?", "", text or "")
    start = text.find("{")
    if start < 0:
        raise ValueError("the model reply has no JSON object")
    obj, _ = json.JSONDecoder(strict=False).raw_decode(text[start:])
    return obj


def clean_gaps(items) -> list:
    out = []
    for g in items if isinstance(items, list) else []:
        if not isinstance(g, dict) or not str(g.get("gap", "")).strip():
            continue
        area = str(g.get("area", "")).strip().lower()
        out.append({
            "area": area if area in AREAS else "ui",
            "gap": str(g["gap"]).strip(),
            "fix": str(g.get("fix", "")).strip(),
        })
    return out


def repo_relative(p: str) -> str:
    """The ledger's bar should be fetchable from any checkout, so drop the machine-specific prefix."""
    i = p.find("/docs/gauntlet/")
    return p[i + 1:] if i >= 0 else p


def verdict(reply: dict) -> dict:
    meta = reply.get("meta") or {}
    ours_is = meta.get("ours_is")
    if ours_is not in ("A", "B"):
        raise ValueError("the reply lost the blind order (meta.ours_is)")
    theirs_is = "B" if ours_is == "A" else "A"
    answer = first_json_object(reply.get("text", ""))
    better = str(answer.get("better", "")).strip().upper()[:1]
    if better not in ("A", "B"):
        raise ValueError(f"the critic did not pick A or B: {answer.get('better')!r}")
    winner = "ours" if better == ours_is else "reference"
    gaps = clean_gaps(answer.get(f"gaps_{ours_is.lower()}"))
    biggest = str(answer.get(f"biggest_gap_{ours_is.lower()}") or (gaps[0]["gap"] if gaps else "")).strip()
    if len(biggest) < 12:
        raise ValueError("the critic named no real gap for our shot; a harsh critic always does")
    try:
        confidence = max(0.0, min(1.0, float(answer.get("confidence", 0))))
    except (TypeError, ValueError):
        confidence = 0.0
    record = " ".join([
        "node scripts/gauntlet-verdict.mjs --record",
        "--piece", shlex.quote(meta.get("piece", "unknown")),
        "--bar", shlex.quote(repo_relative(meta.get("reference", ""))),
        "--winner", winner,
        "--gap", shlex.quote(biggest),
        "--blind",
    ])
    return {
        "winner": winner,
        "confidence": confidence,
        "test": meta.get("test"),
        "biggest_gap": biggest,
        "gaps": gaps,
        "reference_gaps": clean_gaps(answer.get(f"gaps_{theirs_is.lower()}")),
        "model": reply.get("model"),
        "blind": True,
        "record": record,
    }


class AppleCritiqueVerdict(Component):
    display_name = "Apple: critique verdict"
    description = "Maps the blind A/B answer back to ours/reference and structured gaps."
    icon = "scale"
    name = "AppleCritiqueVerdict"

    inputs = [MessageTextInput(name="reply", display_name="Reply JSON", required=True)]
    outputs = [Output(display_name="Verdict JSON", name="verdict", method="build")]

    def build(self) -> Message:
        v = verdict(json.loads(self.reply))
        self.status = f"{v['winner']}: {v['biggest_gap']}"
        return Message(text=json.dumps(v, ensure_ascii=False))
