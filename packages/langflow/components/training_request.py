"""Apple: turn one failing visual gap into a request for GENERAL training material.

Input JSON: {"gap": "plots are flat 0.2-stud plates with no edges", "area": "map",
             "fix": "volume and trim" (optional), "examples": 2}
The prompt forbids naming any game: the rule from docs/gauntlet is "fix the model's general
weaknesses, never this one game". The verdict step enforces it again on the reply.
"""

import json

from lfx.custom.custom_component.component import Component
from lfx.io import MessageTextInput, Output
from lfx.schema.message import Message

MAX_EXAMPLES = 3

PROMPT = """A Roblox building agent keeps making this visual mistake in the area "{area}":
  {gap}
{fix_line}
Write training material that fixes the GENERAL weakness for every genre. Never name a specific
game, studio or franchise; use neutral words like "a hub", "a shop", "a garden plot".
Answer with JSON only, in exactly this shape:
{{"skill_id": "kebab-case-id",
  "title": "short skill name",
  "card": "a 120-250 word skill card: the rule, why it matters on screen, concrete numbers (studs, colours, counts), and a 4-8 step procedure",
  "examples": [{{"task": "a customer request, any genre, where the skill matters",
                 "answer": "a Luau script in a ```luau fence that applies the skill with real Roblox APIs (Instance.new, Part, Color3, Enum.Material)"}}]}}
Give exactly {n} examples, each a different genre."""


def parse_spec(text: str) -> dict:
    """JSON, a verdict from the visual-critique flow, or (typed in the Playground) the gap as plain text."""
    try:
        spec = json.loads(text)
    except ValueError:
        return {"gap": text.strip()}
    if not isinstance(spec, dict):
        return {"gap": str(spec)}
    if "biggest_gap" in spec and "gap" not in spec:  # the critique verdict, pasted as-is
        top = (spec.get("gaps") or [{}])[0]
        return {"gap": spec["biggest_gap"], "area": top.get("area", spec.get("test") or "map"), "fix": top.get("fix", "")}
    return spec


def build_request(spec: dict) -> dict:
    gap = str(spec.get("gap", "")).strip()
    if len(gap) < 12:
        raise ValueError("need a 'gap' of at least 12 characters")
    n = max(1, min(int(spec.get("examples", 2)), MAX_EXAMPLES))
    fix = str(spec.get("fix", "")).strip()
    prompt = PROMPT.format(
        area=spec.get("area", "map"),
        gap=gap,
        fix_line=f"The general skill it exposes: {fix}" if fix else "",
        n=n,
    )
    return {
        "messages": [{"role": "user", "content": prompt}],
        "max_tokens": 1024,
        "meta": {"gap": gap, "area": spec.get("area", "map"), "examples": n},
    }


class AppleTrainingRequest(Component):
    display_name = "Apple: gap -> training request"
    description = "Asks for a genre-agnostic skill card and Luau examples for one visual gap."
    icon = "graduation-cap"
    name = "AppleTrainingRequest"

    inputs = [MessageTextInput(name="spec", display_name="Gap JSON", required=True)]
    outputs = [Output(display_name="Request JSON", name="request", method="build")]

    def build(self) -> Message:
        req = build_request(parse_spec(self.spec))
        self.status = req["meta"]
        return Message(text=json.dumps(req))
