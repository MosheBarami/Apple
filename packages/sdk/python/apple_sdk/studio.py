"""The Studio half of the API, for a Python host: pair once, then long-poll for ops."""
from __future__ import annotations

import re
from typing import Any, Dict, List, Optional

from .client import HEADER_PLUGIN_PROTOCOL, HEADER_PLUGIN_VERSION, HEADER_STUDIO_TOKEN, AppleClient, is_project_id
from .errors import ApiError
from .numbers import finite_number

_SECRET_RE = re.compile(r"^[0-9a-f]{48}$")


class StudioSessionEnded(Exception):
    """The pairing is over. Reconnecting needs a NEW code, not another poll."""


def is_studio_token(token: Any) -> bool:
    """``<projectId>.<48 hex>`` — the shape the worker checks before it touches storage."""
    if not isinstance(token, str) or len(token) > 200:
        return False
    dot = token.find(".")
    if dot < 1:
        return False
    return is_project_id(token[:dot]) and bool(_SECRET_RE.match(token[dot + 1:]))


def poll_wait_seconds(response: Any, fallback: float = 2.0, minimum: float = 0.2, maximum: float = 10.0) -> float:
    """How long to wait before the next poll.

    THE GUARD IS THE WHOLE FUNCTION. ``response.get("waitMs") or 2000`` accepts a string,
    a dict and NaN; dividing any of those by 1000 either raises inside the poll loop or
    produces a value that makes every later comparison false.
    """
    raw = response.get("waitMs") if isinstance(response, dict) else None
    return finite_number(raw, fallback * 1000.0, minimum * 1000.0, maximum * 1000.0) / 1000.0


class StudioClient:
    def __init__(self, base_url: Optional[str] = None, token: Optional[str] = None,
                 version: Optional[str] = None, protocol: Optional[int] = None, **kwargs: Any) -> None:
        self.api = AppleClient(base_url=base_url, token=None, **kwargs)
        self.base_url = self.api.base_url
        self.token = token
        self.version = version
        self.protocol = protocol

    def headers(self, extra: Optional[Dict[str, str]] = None) -> Dict[str, str]:
        """Identity on headers, sent on every request including the pairing call."""
        out = dict(extra or {})
        if self.version is not None:
            out[HEADER_PLUGIN_VERSION] = str(self.version)
        if self.protocol is not None:
            out[HEADER_PLUGIN_PROTOCOL] = str(self.protocol)
        return out

    def claim(self, code: str) -> Dict[str, Any]:
        if not isinstance(code, str) or not code.strip():
            raise ValueError("a pairing code is required")
        body = self.api.request(
            "/api/studio/claim", "POST", {"code": code.strip()}, headers=self.headers(), token=None
        )
        if not isinstance(body, dict) or not isinstance(body.get("token"), str):
            raise ApiError("pairing succeeded but returned no token", 502, body)
        self.token = body["token"]
        return body

    def poll(self, results: Optional[List[Any]] = None, events: Optional[List[Any]] = None,
             state: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """One long poll. A 401 ends the session — it is never a hiccup to retry."""
        if not is_studio_token(self.token):
            raise ValueError("this client is not paired — call claim() first")
        payload: Dict[str, Any] = {"results": results or [], "events": events or []}
        if state:
            payload["state"] = state
        try:
            return self.api.request(
                "/api/studio/poll", "POST", payload,
                headers=self.headers({HEADER_STUDIO_TOKEN: self.token}), token=None,
            )
        except ApiError as e:
            if e.status == 401:
                self.token = None
                raise StudioSessionEnded("Session ended — reconnect with a new code")
            raise
