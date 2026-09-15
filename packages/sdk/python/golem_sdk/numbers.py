"""Numeric admission for values that arrived from somewhere else.

The Python twin of ``src/numbers.mjs``, and it exists for the same reason. Python's
``or`` is the local equivalent of JavaScript's ``??`` and is worse: ``data.get("waitMs")
or 2000`` replaces a *legitimate zero* as well as a missing value, and ``float("nan")``
is truthy, so it sails through and then loses every comparison it takes part in::

    wait = data.get("waitMs") or 2000     # NaN survives
    if wait > CEILING:                    # NaN > n is False -> the cap fails open
        wait = CEILING
    time.sleep(wait)                      # ValueError, from a line that never mentions wait

A value that is not a real finite number is REPLACED by the caller's fallback, never used.
"""
from __future__ import annotations

import math
from typing import Any, Optional

# bool is a subclass of int in Python, and True would otherwise pass as the number 1.
_NUMERIC = (int, float)


def is_finite_number(value: Any) -> bool:
    """True only for a real, finite int or float. Rejects NaN, inf, bools and strings."""
    if isinstance(value, bool) or not isinstance(value, _NUMERIC):
        return False
    return math.isfinite(value)


def finite_number(
    value: Any,
    fallback: float,
    minimum: float = -math.inf,
    maximum: float = math.inf,
) -> float:
    """A finite number inside ``[minimum, maximum]``, or ``fallback``.

    A real number out of range is CLAMPED rather than discarded: a server asking for a
    ten-minute delay means it, and answering with the default would poll far more often
    than it asked. Something that is not a number at all gets the fallback, because
    nothing about it is meaningful.
    """
    if not is_finite_number(value):
        return fallback
    return max(minimum, min(maximum, float(value)))


def finite_int(value: Any, fallback: int, minimum: float = -math.inf, maximum: float = math.inf) -> int:
    return int(finite_number(value, fallback, minimum, maximum))


def retry_after_seconds(raw: Optional[str]) -> Optional[float]:
    """Seconds from a ``Retry-After`` header, in either legal form, or None.

    A date already in the past yields 0 — "retry now" — never a negative delay that a
    later ``min()`` would happily choose.
    """
    if not isinstance(raw, str) or raw.strip() == "":
        return None
    try:
        return max(0.0, float(raw.strip()))
    except ValueError:
        pass
    from email.utils import parsedate_to_datetime
    import datetime

    try:
        when = parsedate_to_datetime(raw)
    except (TypeError, ValueError):
        return None
    if when is None:
        return None
    if when.tzinfo is None:
        when = when.replace(tzinfo=datetime.timezone.utc)
    return max(0.0, (when - datetime.datetime.now(datetime.timezone.utc)).total_seconds())
