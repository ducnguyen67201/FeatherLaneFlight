"""File-based suggestion settings. No environment lookup or credential mutation."""

import os
import stat
import tomllib
from pathlib import Path
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field


class CriteriaGenerationConfig(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, hide_input_in_errors=True)

    enabled: bool = False
    provider: Literal["openai"] = "openai"
    model: Annotated[
        str, Field(min_length=1, max_length=128, pattern=r"^[A-Za-z0-9._-]+$")
    ] = "gpt-6.1-sol"
    reasoning_effort: Literal["low", "medium", "high", "xhigh", "max"] = "low"
    service_tier: Literal["default"] = "default"
    timeout_seconds: Annotated[int, Field(ge=1, le=30)] = 30
    max_output_tokens: Annotated[int, Field(ge=256, le=2048)] = 2048
    max_concurrent_requests: Annotated[int, Field(ge=1, le=4)] = 2
    api_key_file: Annotated[str, Field(min_length=1, max_length=4096)] = (
        "../.local/secrets/openai-api-key"
    )


def load_criteria_config(path: Path) -> CriteriaGenerationConfig | None:
    """Unavailable settings disable suggestions without breaking manual authoring."""
    try:
        if path.stat().st_size > 16_384:
            return None
        payload = tomllib.loads(path.read_text(encoding="utf-8"))
        if set(payload) != {"criteria_generation"}:
            return None
        return CriteriaGenerationConfig.model_validate(payload["criteria_generation"])
    except (OSError, ValueError):
        return None


def read_criteria_key(path: Path) -> str | None:
    """Accept only a bounded private regular file owned by this process's user."""
    try:
        descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    except OSError:
        return None
    try:
        info = os.fstat(descriptor)
        if (
            not stat.S_ISREG(info.st_mode)
            or info.st_uid != os.getuid()
            or info.st_mode & 0o077
            or info.st_nlink != 1
            or not 20 <= info.st_size <= 1024
        ):
            return None
        key = os.read(descriptor, 1025).decode("ascii").strip()
        if not 20 <= len(key) <= 512 or not all(
            char.isalnum() or char in "_-" for char in key
        ):
            return None
        return key
    except (OSError, UnicodeError):
        return None
    finally:
        os.close(descriptor)
