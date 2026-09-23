"""Apple: validate the model's training material and emit it in the repository's own formats.

Output JSON:
  "skill_card": {"id", "title", "markdown"}                           a DRAFT for review
  "chunk":      {vecId, docSlug, title, url, kind, text, embed}        packages/corpus/data/chunks.jsonl line
  "examples":   [{"messages": [system, user, assistant], "meta": {...}}]  packages/training/data/*.jsonl lines
  "rejected":   [{"reason", "task"}]
Anything naming a specific game is rejected, as is an answer with no Luau code or one that uses an
Enum.Material item Roblox does not have (a hallucination measured on the first real run).
"""

import hashlib
import json
import re

from lfx.custom.custom_component.component import Component
from lfx.io import MessageTextInput, Output
from lfx.schema.message import Message

SYSTEM = "You are Apple, an expert Roblox engineer. You write correct, idiomatic Luau that runs on the Roblox engine."
GAME_NAMES = re.compile(
    r"grow[\s-]*a[\s-]*garden|pet\s*simulator|adopt\s*me|blox\s*fruits|big\s*games|brookhaven|bee\s*swarm|"
    r"jailbreak|murder\s*mystery|tower\s*of\s*hell|doors\b|arsenal\b|bloxburg",
    re.IGNORECASE,
)

# Enum.Material items, from the api-enum-material chunks in packages/corpus/data/chunks.jsonl.
MATERIALS = set(
    "Air Asphalt Basalt Brick Cardboard Carpet CeramicTiles ClayRoofTiles Cobblestone Concrete CorrodedMetal "
    "CrackedLava DiamondPlate Fabric Foil ForceField Glacier Glass Granite Grass Ground Ice LeafyGrass Leather "
    "Limestone Marble Metal Mud Neon Pavement Pebble Plaster Plastic Rock RoofShingles Rubber Salt Sand Sandstone "
    "Slate SmoothPlastic Snow Water Wood WoodPlanks".split()
)
LUAU = re.compile(r"\bInstance\.new\(|\bgame:GetService\(|^\s*local\s+\w+\s*=", re.M)


def first_json_object(text: str) -> dict:
    text = re.sub(r"```json", "", text or "")
    start = text.find("{")
    if start < 0:
        raise ValueError("the model reply has no JSON object")
    obj, _ = json.JSONDecoder(strict=False).raw_decode(text[start:])
    return obj


def slugify(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")[:60] or "skill"


def records(reply: dict) -> dict:
    meta = reply.get("meta") or {}
    ans = first_json_object(reply.get("text", ""))
    title = str(ans.get("title", "")).strip()
    card = str(ans.get("card", "")).strip()
    if not title or len(card) < 200:
        raise ValueError("the skill card is missing or under 200 characters")
    if GAME_NAMES.search(title + " " + card):
        raise ValueError("the skill card names a specific game; the training rule forbids it")
    sid = slugify(str(ans.get("skill_id") or title))
    url = f"skill://apple/{sid}"
    examples, rejected = [], []
    for ex in ans.get("examples") or []:
        task, answer = str(ex.get("task", "")).strip(), str(ex.get("answer", "")).strip()
        if "```" not in answer and LUAU.search(answer):  # bare code: fence it like the training set does
            answer = f"```luau\n{answer}\n```"
        if GAME_NAMES.search(task + " " + answer):
            rejected.append({"reason": "names a specific game", "task": task[:120]})
        elif bad := sorted(set(re.findall(r"Enum\.Material\.(\w+)", answer)) - MATERIALS):
            rejected.append({"reason": f"Enum.Material.{bad[0]} does not exist", "task": task[:120]})
        elif "```luau" not in answer and "```lua" not in answer:
            rejected.append({"reason": "no Luau code fence", "task": task[:120]})
        elif len(task) < 12:
            rejected.append({"reason": "task too short", "task": task})
        else:
            examples.append({
                "messages": [
                    {"role": "system", "content": SYSTEM},
                    {"role": "user", "content": task},
                    {"role": "assistant", "content": answer},
                ],
                "meta": {"source": "langflow:apple-training-data", "skill": sid, "gap": meta.get("gap"),
                         "model": reply.get("model"), "review": "draft"},
            })
    text = f"{title}\n\n{card}"
    return {
        "skill_card": {"id": sid, "title": title, "markdown": f"# {title}\n\n{card}\n"},
        "chunk": {
            "vecId": f"g-{hashlib.sha1(url.encode()).hexdigest()[:8]}-1",
            "docSlug": f"skill-{sid}",
            "title": f"{title} (skill card)",
            "url": url,
            "kind": "guide",
            "text": text,
            "embed": True,
        },
        "examples": examples,
        "rejected": rejected,
    }


class AppleTrainingRecords(Component):
    display_name = "Apple: training records"
    description = "Skill card draft + chunks.jsonl line + chat-format examples, game names rejected."
    icon = "file-json"
    name = "AppleTrainingRecords"

    inputs = [MessageTextInput(name="reply", display_name="Reply JSON", required=True)]
    outputs = [Output(display_name="Records JSON", name="records", method="build")]

    def build(self) -> Message:
        out = records(json.loads(self.reply))
        self.status = f"{out['skill_card']['id']}: {len(out['examples'])} examples, {len(out['rejected'])} rejected"
        return Message(text=json.dumps(out, ensure_ascii=False))
