"""Conservative in-memory lease deadlines; never reuse one across a restart."""

import math
from dataclasses import dataclass


class LocalLeaseExpired(Exception):
    """The protocol must stop sending attempt work and retain recovery state."""


@dataclass(frozen=True)
class LeaseWindow:
    deadline: float

    @classmethod
    def from_response(
        cls,
        *,
        dispatched_at: float,
        received_at: float,
        remaining_ttl_ms: int,
        stopping_margin_seconds: int,
    ) -> "LeaseWindow":
        if (
            not math.isfinite(dispatched_at)
            or not math.isfinite(received_at)
            or received_at < dispatched_at
            or isinstance(remaining_ttl_ms, bool)
            or not 0 < remaining_ttl_ms <= 60_000
            or isinstance(stopping_margin_seconds, bool)
            or stopping_margin_seconds != 10
        ):
            raise LocalLeaseExpired()
        # Server remaining TTL is deliberately anchored at request dispatch,
        # not receipt. A delayed response must never buy extra local time.
        window = cls(dispatched_at + remaining_ttl_ms / 1000 - stopping_margin_seconds)
        window.require_live(received_at)
        return window

    def require_live(self, now: float) -> None:
        if not math.isfinite(now) or now >= self.deadline:
            raise LocalLeaseExpired()
