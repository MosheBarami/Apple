"""Apple: dedupe and licence-check candidate UI / 3D assets from the asset hunt.

Input JSON: {"paths": ["/abs/packages/asset-library/sources/ui.jsonl", ...]} or {"items": [...]},
            optional "limit" (records returned, default 200; the summary always covers all).
Each record is the hunt's shape: {url, title, site, kind, license, use, ...}.
Output JSON: {"summary": {...}, "conflicts": [...], "items": [...]}, every item gaining
  "verdict": "import-ok" | "review" | "reference-only", "attribution": bool, "reason": str.
Deterministic rules, no model: an asset only becomes import-ok under a licence we recognise as
open. "Free", "unknown" and "credit required" alone mean review, never import. A record whose own
"use" says import-ok while the rules say otherwise is listed in "conflicts".
"""

import json
import re
from pathlib import Path
from urllib.parse import urlsplit

from lfx.custom.custom_component.component import Component
from lfx.io import MessageTextInput, Output
from lfx.schema.message import Message

MAX_ITEMS = 20_000
RULES = [  # (pattern, verdict, attribution, reason) -- first match wins
    (r"non[\s-]*commercial|\bby[\s-]*nc\b|personal use only|practice only|not for (?:commercial|resale)|no commercial|"
     r"all rights reserved|not free-to-take|do not (?:re)?upload|portfolio|commission",
     "reference-only", False, "licence forbids commercial use or re-use"),
    (r"verify|not confirmed|not verified|likely|varies|mixed|per[\s-]*(?:model|collection|listing|item)",
     "review", True, "licence not confirmed for this item; a human must check the page"),
    (r"^\s*n/?a\b|collection page|\(listing\)", "reference-only", False, "a listing, not an asset"),
    (r"cc[\s-]*by[\s-]*sa|share[\s-]*alike", "review", True, "share-alike: check it does not bind the customer's game"),
    (r"\bcc0\b|public domain|\bcc[\s-]*zero\b|creative commons zero|\bunlicense\b", "import-ok", False, "public domain / CC0"),
    (r"creator store|roblox terms of use|ispublicdomain=true",
     "import-ok", False, "free Roblox Creator Store asset: Roblox Terms of Use allow it inside Roblox experiences"),
    (r"\bmit\b|apache|\bbsd\b|\bzlib\b|\bisc\b|\bofl\b|open font licen[cs]e|cc[\s-]*by\b|cc attribution|creative commons attribution",
     "import-ok", True, "open licence that requires attribution"),
]


def canonical_url(url: str) -> str:
    u = urlsplit(url.strip())
    host = u.netloc.lower().removeprefix("www.")
    path = u.path.rstrip("/")
    m = re.match(r"^/t/(?:[^/]+/)?(\d+)", path) if host == "devforum.roblox.com" else None
    if m:
        return f"devforum.roblox.com/t/{m[1]}"
    m = re.match(r"^/(?:[a-z]{2}/)?(?:library|catalog|store/asset|marketplace/asset)/(\d+)", path) if host.endswith("roblox.com") else None
    if m:
        return f"roblox.com/asset/{m[1]}"
    return f"{host}{path.lower()}"


def classify(licence: str):
    text = (licence or "").lower()
    for pattern, verdict, attribution, reason in RULES:
        if re.search(pattern, text):
            return verdict, attribution, reason
    if not text.strip() or "unknown" in text:
        return "review", False, "licence unknown"
    return "review", "credit" in text, "licence not recognised as open; a human must read it"


def curate(items: list, limit: int = 200) -> dict:
    if len(items) > MAX_ITEMS:
        raise ValueError(f"{len(items)} records; the cap is {MAX_ITEMS}")
    seen, out, conflicts = {}, [], []
    dupes = 0
    for it in items:
        if not isinstance(it, dict) or not it.get("url"):
            continue
        key = canonical_url(it["url"])
        if key in seen:
            dupes += 1
            seen[key]["also_found_via"].append(it.get("found_via") or it.get("kind"))
            continue
        verdict, attribution, reason = classify(it.get("license", ""))
        rec = {**it, "canonical": key, "verdict": verdict, "attribution": attribution, "reason": reason,
               "also_found_via": []}
        seen[key] = rec
        out.append(rec)
        if it.get("use") == "import-ok" and verdict != "import-ok":
            conflicts.append({"url": it["url"], "title": it.get("title"), "license": it.get("license"),
                              "source_use": it["use"], "verdict": verdict, "reason": reason})
    counts = {}
    for r in out:
        counts[r["verdict"]] = counts.get(r["verdict"], 0) + 1
    return {
        "summary": {"records": len(items), "unique": len(out), "duplicates": dupes, "verdicts": counts,
                    "conflicts": len(conflicts)},
        "conflicts": conflicts[:limit],
        "items": out[:limit],
    }


def parse_spec(text: str) -> dict:
    """JSON, or (typed in the Playground) paths, one per line: .jsonl files or folders holding them."""
    try:
        spec = json.loads(text)
        if isinstance(spec, dict):
            return spec
    except ValueError:
        pass
    paths = []
    for ln in (ln.strip() for ln in text.splitlines()):
        p = Path(ln).expanduser()
        if ln and p.is_dir():
            paths += sorted(str(x) for x in p.glob("*.jsonl"))
        elif ln:
            paths.append(ln)
    return {"paths": paths}


def load(spec: dict) -> list:
    items = list(spec.get("items") or [])
    for p in spec.get("paths") or []:
        for line in Path(p).expanduser().read_text(encoding="utf-8").splitlines():
            if line.strip():
                items.append(json.loads(line))
    if not items:
        raise ValueError("no records: pass 'paths' to .jsonl files or 'items'")
    return items


class AppleAssetCurator(Component):
    display_name = "Apple: asset curator"
    description = "Dedupe asset-hunt records and sort them into import-ok / review / reference-only."
    icon = "shield-check"
    name = "AppleAssetCurator"

    inputs = [MessageTextInput(name="spec", display_name="Records JSON", required=True)]
    outputs = [Output(display_name="Curated JSON", name="curated", method="build")]

    def build(self) -> Message:
        spec = parse_spec(self.spec)
        result = curate(load(spec), int(spec.get("limit", 200)))
        self.status = result["summary"]
        return Message(text=json.dumps(result, ensure_ascii=False))
