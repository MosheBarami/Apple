"""Apple: build a BLIND visual-critique request for the gauntlet (docs/gauntlet/).

Input JSON: {"ours": "/abs/studio-shot.png", "reference": "/abs/ref.png", "test": "map|models|ui",
             "piece": "simulator-ui", "seed": 7}
The two images are shown to the model as "Image A" and "Image B" in an order drawn from the seed,
so the critic never knows which one we built. The order travels in `meta`, which the model never
sees, and the verdict step maps the answer back to ours/reference.
"""

import base64
import io
import json
import random
from pathlib import Path

from lfx.custom.custom_component.component import Component
from lfx.io import MessageTextInput, Output
from lfx.schema.message import Message

TESTS = {
    "map": "the world layout: terrain, paths, water, zones, sky and lighting",
    "models": "the 3D props: shapes, silhouettes, colours, detail and set dressing",
    "ui": "the on-screen UI: layout, outlines, colours, fonts, buttons, windows",
}
MAX_SIDE = 768

PROMPT = """You are a harsh art director judging two screenshots of cartoon Roblox games.
Judge only {focus}.
Answer with JSON only, no prose, in exactly this shape:
{{"better": "A" or "B",
  "confidence": number 0..1,
  "gaps_a": [{{"area": "map" | "models" | "ui", "gap": "what A lacks next to B", "fix": "a general, genre-agnostic building skill that closes it"}}],
  "gaps_b": [same shape, what B lacks next to A],
  "biggest_gap_a": "the single biggest thing A lacks",
  "biggest_gap_b": "the single biggest thing B lacks"}}
Give 2 to 5 gaps per image. Never answer "nothing": even the better image has a gap.
Image A is first, Image B is second."""


def image_data_url(path: str) -> str:
    from PIL import Image

    p = Path(path).expanduser()
    if not p.is_file():
        raise ValueError(f"no image at {p}")
    im = Image.open(p).convert("RGB")
    im.thumbnail((MAX_SIDE, MAX_SIDE))
    buf = io.BytesIO()
    im.save(buf, "JPEG", quality=80)
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()


def parse_spec(text: str) -> dict:
    """JSON, or (typed in the Playground) lines: our shot path, reference path, optional test word."""
    try:
        return json.loads(text)
    except ValueError:
        lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
        spec = {"ours": lines[0] if lines else "", "reference": lines[1] if len(lines) > 1 else ""}
        if len(lines) > 2:
            spec["test"] = lines[2].lower()
        return spec


def build_request(spec: dict, load=image_data_url) -> dict:
    test = spec.get("test", "ui")
    if test not in TESTS:
        raise ValueError(f"test must be one of {sorted(TESTS)}")
    if not spec.get("ours") or not spec.get("reference"):
        raise ValueError("need both 'ours' and 'reference' image paths")
    seed = spec.get("seed")
    ours_first = random.Random(seed).random() < 0.5
    first, second = (spec["ours"], spec["reference"]) if ours_first else (spec["reference"], spec["ours"])
    content = [
        {"type": "text", "text": PROMPT.format(focus=TESTS[test])},
        {"type": "image_url", "image_url": {"url": load(first)}},
        {"type": "image_url", "image_url": {"url": load(second)}},
    ]
    return {
        "messages": [{"role": "user", "content": content}],
        "max_tokens": 900,
        "meta": {
            "ours_is": "A" if ours_first else "B",
            "test": test,
            "piece": spec.get("piece") or f"simulator-{test}",
            "reference": spec["reference"],
            "ours": spec["ours"],
        },
    }


class AppleCritiqueRequest(Component):
    display_name = "Apple: blind critique request"
    description = "Two images (ours, reference) in a random A/B order the critic cannot see."
    icon = "image"
    name = "AppleCritiqueRequest"

    inputs = [MessageTextInput(name="spec", display_name="Spec JSON", required=True)]
    outputs = [Output(display_name="Request JSON", name="request", method="build")]

    def build(self) -> Message:
        req = build_request(parse_spec(self.spec))
        self.status = {k: v for k, v in req["meta"].items() if k != "ours_is"}
        return Message(text=json.dumps(req))
