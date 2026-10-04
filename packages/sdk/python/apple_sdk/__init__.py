"""apple_sdk — the former name of studpilot_sdk, kept for one release. Removal: next major.

    from apple_sdk import AppleClient            # still works, and warns
    from studpilot_sdk import StudPilotClient    # what new code imports
"""
import warnings

from studpilot_sdk import *  # noqa: F401,F403
from studpilot_sdk import StudPilotClient
from studpilot_sdk import __all__ as _studpilot_all

warnings.warn(
    "apple_sdk is the former name of studpilot_sdk and will be removed in the next major release; "
    "import studpilot_sdk instead (AppleClient is now StudPilotClient)",
    DeprecationWarning,
    stacklevel=2,
)

#: The former name of StudPilotClient: the same class, not a copy.
AppleClient = StudPilotClient

__all__ = [*_studpilot_all, "AppleClient"]
