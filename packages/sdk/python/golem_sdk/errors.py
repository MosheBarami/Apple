"""What went wrong, in a shape a caller can branch on."""
from __future__ import annotations

import random
from typing import Any, Optional

from .numbers import finite_int, is_finite_number, retry_after_seconds

#: Statuses worth trying again. 429 is here even though this deployment uses it for both
#: "slow down" and "out of Sparks today": retrying the second is useless but bounded,
#: while refusing to retry the first turns a self-clearing condition into a hard failure.
RETRYABLE_STATUS = frozenset({408, 425, 429, 500, 502, 503, 504})

#: Methods that may be repeated without repeating their effect.
IDEMPOTENT = frozenset({"GET", "HEAD", "OPTIONS", "PUT", "DELETE"})


class ApiError(Exception):
    """A failed call to the Apple API.

    ``status`` is 0 for a transport failure — DNS, TLS, a dropped connection. That is
    deliberately distinct from every HTTP status: "the server said no" and "there was no
    server" need different words in front of a user.
    """

    def __init__(
        self,
        message: str,
        status: int,
        body: Any = None,
        retry_after: Optional[float] = None,
        attempts: int = 1,
    ) -> None:
        super().__init__(message)
        self.message = message
        self.status = finite_int(status, 0, 0, 599)
        self.body = body
        self.retry_after = retry_after
        self.attempts = finite_int(attempts, 1, 1, 100)

    @property
    def is_transport(self) -> bool:
        return self.status == 0


def should_retry(method: str, status: int, attempt: Any, max_attempts: Any, retry_non_idempotent: bool = False) -> bool:
    """May this attempt be repeated? A pure function, so a test can present the bad cases.

    A POST IS NOT RETRIED BY DEFAULT. A request that timed out may well have been
    executed, and the worker implements no idempotency key, so nothing on the server
    would collapse a duplicate. An unreadable attempt counter REFUSES rather than
    restarting at 1, because a caller that lost count must not be granted a fresh budget.
    """
    if not is_finite_number(attempt) or not is_finite_number(max_attempts):
        return False
    if finite_int(attempt, 1, 1, 1000) >= finite_int(max_attempts, 1, 1, 100):
        return False
    if str(method).upper() not in IDEMPOTENT and not retry_non_idempotent:
        return False
    if status == 0:
        return True
    return status in RETRYABLE_STATUS


def backoff_seconds(attempt: Any, retry_after: Any = None, jitter: Optional[Any] = None, base: float = 0.3, cap: float = 20.0) -> float:
    """How long to wait before the next attempt. The server's Retry-After wins."""
    seconds = retry_after_seconds(retry_after) if isinstance(retry_after, str) else retry_after
    if is_finite_number(seconds):
        return min(cap, max(0.0, float(seconds)))
    n = finite_int(attempt, 1, 1, 30)
    exponential = min(cap, base * (2 ** (n - 1)))
    spread = jitter() if callable(jitter) else random.random()
    factor = 0.5 + (min(1.0, max(0.0, spread)) if is_finite_number(spread) else 0.0) * 0.5
    return exponential * factor


def message_from_body(body: Any, status: int) -> str:
    if isinstance(body, dict) and isinstance(body.get("error"), str) and body["error"].strip():
        return body["error"]
    if isinstance(body, str) and body.strip() and len(body) <= 300:
        return body.strip()
    return "Request failed ({})".format(status)
