"""Apple: one capped Cloudflare Workers AI call (shared by every model step in the Apple flows).

Takes a request built by the step before it: {"messages": [...], "max_tokens": n, "meta": {...}}.
Returns {"text": <model reply>, "model": ..., "meta": <passed through>} so the parser after it can
undo anything the request step hid from the model (the blind A/B order of the critique flow).

Free by construction: only Workers AI models on the account's own quota, one call per run, a hard
token ceiling the flow cannot raise, at most four images, a bounded request body. The account id and
token come from Langflow global variables (Credential type), never from the flow JSON.
"""

import json

import httpx
from lfx.custom.custom_component.component import Component
from lfx.io import DropdownInput, IntInput, MessageTextInput, Output, SecretStrInput
from lfx.schema.message import Message

MODELS = [
    "@cf/meta/llama-4-scout-17b-16e-instruct",  # text + images
    "@cf/qwen/qwen3-30b-a3b-fp8",
    "@cf/openai/gpt-oss-20b",
]
HARD_MAX_TOKENS = 1024
MAX_IMAGES = 4
MAX_BODY_BYTES = 4_000_000


def check_request(req: dict, model: str, max_tokens: int) -> dict:
    """Validate and cap a request. Raises ValueError on anything the caps refuse."""
    if model not in MODELS:
        raise ValueError(f"model {model!r} is not one of the free Workers AI models {MODELS}")
    messages = req.get("messages")
    if not isinstance(messages, list) or not messages:
        raise ValueError("request has no messages")
    images = sum(
        1
        for m in messages
        if isinstance(m.get("content"), list)
        for part in m["content"]
        if part.get("type") == "image_url"
    )
    if images > MAX_IMAGES:
        raise ValueError(f"{images} images; the cap is {MAX_IMAGES}")
    if images and model != MODELS[0]:
        raise ValueError(f"{model} does not take images; use {MODELS[0]}")
    wanted = int(req.get("max_tokens") or max_tokens)
    body = {"messages": messages, "max_tokens": max(16, min(wanted, int(max_tokens), HARD_MAX_TOKENS))}
    if len(json.dumps(body)) > MAX_BODY_BYTES:
        raise ValueError("request body is over the 4 MB cap")
    return body


def reply_text(payload: dict) -> str:
    result = payload.get("result") or {}
    if isinstance(result.get("response"), str):
        return result["response"]
    choices = result.get("choices") or []
    if choices:
        return choices[0].get("message", {}).get("content") or ""
    return ""


class AppleWorkersAI(Component):
    display_name = "Apple: Workers AI (capped)"
    description = "One capped call to a free Cloudflare Workers AI model."
    icon = "Cloudflare"
    name = "AppleWorkersAI"

    inputs = [
        MessageTextInput(name="request", display_name="Request JSON", required=True),
        DropdownInput(name="model", display_name="Model", options=MODELS, value=MODELS[0]),
        IntInput(name="max_tokens", display_name="Max tokens (ceiling 1024)", value=800),
        SecretStrInput(
            name="account_id", display_name="Cloudflare account id", value="CLOUDFLARE_ACCOUNT_ID", load_from_db=True
        ),
        SecretStrInput(
            name="api_token", display_name="Cloudflare API token", value="CLOUDFLARE_API_TOKEN", load_from_db=True
        ),
    ]
    outputs = [Output(display_name="Reply JSON", name="reply", method="call_model")]

    def call_model(self) -> Message:
        req = json.loads(self.request)
        body = check_request(req, self.model, self.max_tokens)
        url = f"https://api.cloudflare.com/client/v4/accounts/{self.account_id}/ai/run/{self.model}"
        r = httpx.post(url, headers={"Authorization": f"Bearer {self.api_token}"}, json=body, timeout=120)
        if r.status_code != 200:
            # The body of an error names the problem; it never echoes the bearer token.
            raise ValueError(f"Workers AI answered {r.status_code}: {r.text[:300]}")
        text = reply_text(r.json())
        out = {"text": text, "model": self.model, "max_tokens": body["max_tokens"], "meta": req.get("meta", {})}
        self.status = text[:500]
        return Message(text=json.dumps(out))
