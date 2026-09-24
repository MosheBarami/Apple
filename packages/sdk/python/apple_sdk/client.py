"""The Python client for the Apple REST API.

STANDARD LIBRARY ONLY. A build tool that has to ``pip install`` before it can ask the
worker whether it is healthy is a build tool that does not run in half the places it is
wanted, and every dependency here would be a dependency of every consumer.

Every path in this file exists in ``apps/worker/src/index.ts``; nothing invents an
endpoint, and no response is reshaped. The policy decisions — what may be retried, how
long to wait, which id shapes are allowed — are the same ones the JavaScript client
makes, and ``tests/python.test.mjs`` is what keeps the two from drifting apart.
"""
from __future__ import annotations

import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Callable, Dict, Optional, Union

from .errors import ApiError, backoff_seconds, message_from_body, should_retry
from .numbers import finite_int

#: The public base URL of the production worker.
#:
#: ``apple``, not ``golem``. The legacy host serves ``/api/*`` from a separate, older deployment
#: (measured 2026-09-20: buildSha 44d9ded-dirty there, e30b7f9-dirty on the canonical origin, 31
#: commits apart) and the browser redirect that moves pages across deliberately exempts ``/api/*``,
#: so an SDK caller was never carried over. Kept identical to ``DEFAULT_BASE_URL`` in
#: ``packages/sdk/src/wire.mjs``; ``protocol-parity.test.mjs`` asserts the two agree.
DEFAULT_BASE_URL = "https://apple.moshe-barami111.workers.dev"

#: Mirrors ``ProductMode`` in packages/shared. A runtime list, because a TypeScript union
#: is not one and this value routinely arrives from a config file or a command line.
MODES = ("plan", "agent")

#: Mirrors ``PLAN_IDS`` in packages/shared.
PLAN_IDS = ("free", "builder", "studio", "enterprise")

_UUID_RE = re.compile(r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")

HEADER_AUTH = "Authorization"
HEADER_ADMIN_KEY = "X-Admin-Key"
HEADER_STUDIO_TOKEN = "X-Golem-Token"
HEADER_PLUGIN_VERSION = "X-Golem-Plugin-Version"
HEADER_PLUGIN_PROTOCOL = "X-Golem-Plugin-Protocol"


def is_project_id(value: Any) -> bool:
    """The id shape the worker's own ``UUID_RE`` admits."""
    return isinstance(value, str) and bool(_UUID_RE.match(value))


def project_path(project_id: str, suffix: str = "") -> str:
    """``/api/projects/<id><suffix>``, with the id validated first.

    THE VALIDATION IS THE POINT. An unvalidated id is a path-traversal primitive:
    ``../../admin/stats`` turns a project read into an admin read once the URL is
    normalised. The worker answers a non-UUID id with 404, so a caller that reached here
    with one has a bug, and "no such project" is the wrong sentence for it.
    """
    if not is_project_id(project_id):
        raise ValueError("invalid project id: {!r} (expected a UUID)".format(project_id))
    return "/api/projects/{}{}".format(project_id, suffix)


def normalize_base_url(base_url: Optional[str]) -> str:
    raw = (base_url or DEFAULT_BASE_URL).strip()
    if not raw.lower().startswith(("http://", "https://")):
        raise ValueError("base URL must be http(s): {!r}".format(base_url))
    return raw.rstrip("/")


class AppleClient:
    """A client for one deployment, holding one credential.

    ``token`` may be a string or a callable returning one, which is what lets a long-lived
    process hand over a session that refreshes without rebuilding the client.
    """

    def __init__(
        self,
        base_url: Optional[str] = None,
        token: Union[str, Callable[[], Optional[str]], None] = None,
        admin_key: Optional[str] = None,
        max_attempts: int = 3,
        timeout: float = 30.0,
        sleep: Callable[[float], None] = time.sleep,
        opener: Optional[Callable[..., Any]] = None,
    ) -> None:
        self.base_url = normalize_base_url(base_url)
        self._token = token
        self.admin_key = admin_key
        self.max_attempts = finite_int(max_attempts, 3, 1, 10)
        self.timeout = timeout
        self._sleep = sleep
        self._open = opener or urllib.request.urlopen

    # ---------------------------------------------------------------- transport

    def _resolve_token(self, override: Any = "\0") -> Optional[str]:
        value = self._token if override == "\0" else override
        if callable(value):
            value = value()
        if value is None or value == "":
            return None
        if not isinstance(value, str):
            raise TypeError("access token must be a string or a callable returning one")
        return value

    def request(
        self,
        path: str,
        method: str = "GET",
        body: Any = None,
        query: Optional[Dict[str, Any]] = None,
        headers: Optional[Dict[str, str]] = None,
        token: Any = "\0",
        as_bytes: bool = False,
        retry_non_idempotent: bool = False,
    ) -> Any:
        status, payload, _ = self.request_full(
            path, method, body, query, headers, token, as_bytes, retry_non_idempotent
        )
        del status
        return payload

    def request_full(
        self,
        path: str,
        method: str = "GET",
        body: Any = None,
        query: Optional[Dict[str, Any]] = None,
        headers: Optional[Dict[str, str]] = None,
        token: Any = "\0",
        as_bytes: bool = False,
        retry_non_idempotent: bool = False,
    ):
        """Returns ``(status, payload, headers)``. Raises ``ApiError`` on failure."""
        url = self.base_url + path
        if query:
            pairs = {k: str(v) for k, v in query.items() if v is not None}
            if pairs:
                url += "?" + urllib.parse.urlencode(pairs)

        sent = dict(headers or {})
        resolved = self._resolve_token(token)
        if resolved and HEADER_AUTH not in sent:
            sent[HEADER_AUTH] = "Bearer " + resolved
        data = None
        if body is not None:
            data = json.dumps(body).encode("utf-8")
            sent.setdefault("Content-Type", "application/json")

        attempt = 1
        while True:
            status, raw, res_headers, transport = self._attempt(url, method, data, sent)
            retry_after = res_headers.get("Retry-After") if res_headers else None
            if should_retry(method, status, attempt, self.max_attempts, retry_non_idempotent):
                self._sleep(backoff_seconds(attempt, retry_after))
                attempt += 1
                continue
            if transport is not None:
                raise ApiError(
                    "Network error — the API could not be reached.", 0, attempts=attempt
                ) from transport
            payload = raw if as_bytes else _decode(raw)
            if status >= 400:
                raise ApiError(message_from_body(payload, status), status, payload, None, attempt)
            return status, payload, res_headers

    def _attempt(self, url, method, data, headers):
        req = urllib.request.Request(url, data=data, method=method.upper(), headers=headers)
        try:
            with self._open(req, timeout=self.timeout) as res:
                return res.status, res.read(), dict(res.headers), None
        except urllib.error.HTTPError as e:  # a response, just not a successful one
            return e.code, e.read(), dict(e.headers or {}), None
        except (urllib.error.URLError, OSError) as e:  # no response at all
            return 0, b"", {}, e

    # ------------------------------------------------------------------ service

    def health(self) -> Any:
        return self.request("/api/health", token=None)

    def providers(self) -> Any:
        return self.request("/api/providers")

    def me(self) -> Any:
        return self.request("/api/me")

    def usage(self) -> Any:
        return self.request("/api/me/usage")

    def search_docs(self, query: str) -> Any:
        return self.request("/api/docs/search", query={"q": query})

    # ------------------------------------------------------------------ billing

    def billing_config(self) -> Any:
        return self.request("/api/billing/config")

    def start_checkout(self, plan: str) -> Any:
        if plan not in PLAN_IDS:
            raise ValueError("plan must be one of {} — got {!r}".format(", ".join(PLAN_IDS), plan))
        return self.request("/api/billing/checkout", "POST", {"plan": plan})

    # ----------------------------------------------------------------- projects

    def messages(self, project_id: str, limit: int = 100) -> Any:
        return self.request(project_path(project_id, "/messages"), query={"limit": finite_int(limit, 100, 1, 1000)})

    def search_conversation(self, project_id: str, query: str) -> Any:
        return self.request(project_path(project_id, "/search"), query={"q": query})

    def memory(self, project_id: str) -> Any:
        return self.request(project_path(project_id, "/memory"))

    def save_memory(self, project_id: str, memory: Dict[str, Any]) -> Any:
        if not isinstance(memory, dict) or not isinstance(memory.get("facts"), list):
            raise ValueError("memory must be a dict with a 'facts' list — the WHOLE memory is sent")
        return self.request(project_path(project_id, "/memory"), "PUT", {"memory": memory})

    def checkpoints(self, project_id: str) -> Any:
        return self.request(project_path(project_id, "/checkpoints"))

    def create_checkpoint(self, project_id: str, label: str = "checkpoint") -> Any:
        return self.request(project_path(project_id, "/checkpoints"), "POST", {"label": str(label)})

    def restore_checkpoint(self, project_id: str, checkpoint_id: str) -> Any:
        if not checkpoint_id:
            raise ValueError("checkpointId required")
        return self.request(project_path(project_id, "/restore"), "POST", {"checkpointId": checkpoint_id})

    def purge(self, project_id: str) -> Any:
        return self.request(project_path(project_id, "/purge"), "POST")

    def create_pairing_code(self, project_id: str) -> Any:
        return self.request(project_path(project_id, "/pairing"), "POST")

    def attribution(self, project_id: str) -> Any:
        return self.request(project_path(project_id, "/attribution"))

    def roadmap(self, project_id: str, polish: bool = False) -> Any:
        return self.request(project_path(project_id, "/roadmap"), query={"polish": 1} if polish else None)

    def export_transcript(self, project_id: str, fmt: str = "json") -> Dict[str, Any]:
        """The whole conversation as a file. THE SERVER NAMES IT; see Content-Disposition."""
        if fmt not in ("json", "md"):
            raise ValueError("format must be json or md")
        _, payload, headers = self.request_full(
            project_path(project_id, "/export"), query={"format": fmt}, as_bytes=True
        )
        return {
            "filename": filename_from_disposition(headers.get("Content-Disposition"))
            or "project-export.{}".format(fmt),
            "content_type": headers.get("Content-Type", ""),
            "body": payload.decode("utf-8"),
        }

    # -------------------------------------------------------------------- admin

    def admin(self, path: str, method: str = "GET", body: Any = None) -> Any:
        if not self.admin_key:
            raise ValueError("this client has no admin_key — admin routes need one")
        return self.request(path, method, body, headers={HEADER_ADMIN_KEY: self.admin_key})


def filename_from_disposition(raw: Optional[str]) -> Optional[str]:
    if not isinstance(raw, str):
        return None
    quoted = re.search(r'filename="([^"]+)"', raw)
    if quoted:
        return quoted.group(1)
    bare = re.search(r"filename=([^;]+)", raw)
    return bare.group(1).strip() if bare else None


def _decode(raw: bytes) -> Any:
    """JSON when it is JSON, the text when it is not.

    An error body is not guaranteed to be JSON — a 502 from an edge is HTML — and letting
    ``json.loads`` raise would hand the caller a ``JSONDecodeError`` INSTEAD of the status
    they need to branch on.
    """
    if not raw:
        return None
    text = raw.decode("utf-8", errors="replace")
    try:
        return json.loads(text)
    except ValueError:
        return text
