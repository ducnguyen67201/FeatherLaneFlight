"""Validated API configuration; importing this module does not read the environment."""

from ipaddress import ip_address
from pathlib import Path
from urllib.parse import urlsplit

from pydantic import Field, SecretStr, ValidationError, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict, SettingsError
from sqlalchemy.engine import make_url
from sqlalchemy.exc import ArgumentError


class ConfigurationError(ValueError):
    """A configuration problem with no input values attached."""


class DatabaseSettings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="FLF_API_", extra="forbid", hide_input_in_errors=True
    )

    database_url: SecretStr
    database_pool_size: int = Field(default=5, ge=1, le=20)

    @field_validator("database_url")
    @classmethod
    def validate_database_url(cls, value: SecretStr) -> SecretStr:
        try:
            url = make_url(value.get_secret_value())
        except (ArgumentError, ValueError):
            raise ValueError("Expected a PostgreSQL asyncpg URL") from None
        if (
            url.drivername != "postgresql+asyncpg"
            or not url.host
            or not url.database
            or not url.username
        ):
            raise ValueError("Expected a PostgreSQL asyncpg URL")
        return value


class ApiSettings(DatabaseSettings):
    canonical_origin: str
    artifact_root: Path
    host: str = "127.0.0.1"
    port: int = Field(default=8005, ge=1024, le=65535)
    max_json_bytes: int = Field(default=1_048_576, ge=1024, le=1_048_576)
    max_json_depth: int = Field(default=32, ge=1, le=64)

    @field_validator("canonical_origin")
    @classmethod
    def validate_origin(cls, value: str) -> str:
        parsed = urlsplit(value)
        try:
            loopback = ip_address(parsed.hostname or "").is_loopback
        except ValueError:
            loopback = parsed.hostname == "localhost"
        if (
            any(ord(char) <= 32 or ord(char) == 127 for char in value)
            or not parsed.hostname
            or parsed.username is not None
            or parsed.password is not None
            or parsed.path not in ("", "/")
            or parsed.query
            or parsed.fragment
            or (parsed.scheme != "https" and not (parsed.scheme == "http" and loopback))
        ):
            raise ValueError("Expected an HTTPS origin or loopback HTTP origin")
        # Accessing port also validates malformed/out-of-range port values.
        parsed.port
        return value.rstrip("/")

    @field_validator("artifact_root")
    @classmethod
    def validate_artifact_root(cls, value: Path) -> Path:
        if not value.is_absolute():
            raise ValueError("Expected an absolute private storage directory")
        return value


def load_settings() -> ApiSettings:
    return _load(ApiSettings)


def load_database_settings() -> DatabaseSettings:
    return _load(DatabaseSettings)


def _load[T: DatabaseSettings](model: type[T]) -> T:
    try:
        return model()
    except (ValidationError, SettingsError, ValueError):
        # Pydantic/settings exceptions can contain URLs, credentials or raw env JSON.
        raise ConfigurationError(
            "Invalid configuration; check the documented FLF_API_ variables."
        ) from None
