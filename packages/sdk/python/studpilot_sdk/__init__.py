"""studpilot_sdk — the Python client for the StudPilot REST API.

    from studpilot_sdk import StudPilotClient
    client = StudPilotClient(token="<supabase access token>")
    print(client.health())
"""
from .client import (
    DEFAULT_BASE_URL,
    MODES,
    PLAN_IDS,
    StudPilotClient,
    filename_from_disposition,
    is_project_id,
    normalize_base_url,
    project_path,
)
from .errors import ApiError, backoff_seconds, message_from_body, should_retry
from .numbers import finite_int, finite_number, is_finite_number, retry_after_seconds
from .studio import StudioClient, StudioSessionEnded, is_studio_token, poll_wait_seconds

__version__ = "0.1.0"

__all__ = [
    "ApiError", "StudPilotClient", "DEFAULT_BASE_URL", "MODES", "PLAN_IDS", "StudioClient",
    "StudioSessionEnded", "backoff_seconds", "filename_from_disposition", "finite_int",
    "finite_number", "is_finite_number", "is_project_id", "is_studio_token",
    "message_from_body", "normalize_base_url", "poll_wait_seconds", "project_path",
    "retry_after_seconds", "should_retry", "__version__",
]
