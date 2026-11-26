"""Timestamps stored as ISO-8601 UTC strings."""

from datetime import UTC, datetime


def now() -> str:
    return datetime.now(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def fmt(value: str | None) -> str | None:
    if not value:
        return None
    try:
        moment = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=UTC)
    return (
        moment.astimezone(UTC)
        .isoformat(timespec="milliseconds")
        .replace("+00:00", "Z")
        .replace(".000Z", "Z")
    )
