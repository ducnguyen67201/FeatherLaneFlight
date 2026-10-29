"""Validated API configuration; importing this module does not read the environment."""

from ipaddress import ip_address
from pathlib import Path
from urllib.parse import urlsplit

from pydantic import (
    AnyHttpUrl,
    Field,
    SecretStr,
    ValidationError,
    field_validator,
    model_validator,
)
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
    project_evidence_bytes_limit: int = Field(
        default=5_242_880_000, ge=1, le=53_687_091_200
    )
    artifact_staging_bytes_limit: int = Field(default=524_288_000, ge=1, le=524_288_000)
    artifact_staging_files_limit: int = Field(default=32, ge=1, le=100)
    project_queued_run_limit: int = Field(default=20, ge=1, le=100)
    runner_key_id: str = Field(
        default="identity-v1", min_length=1, max_length=32, pattern=r"^[A-Za-z0-9_-]+$"
    )
    session_hash_key: SecretStr
    google_client_id: str | None = Field(default=None, min_length=1, max_length=256)
    google_client_secret: SecretStr | None = None
    session_ttl_seconds: int = Field(default=43200, ge=300, le=604800)
    oidc_ttl_seconds: int = Field(default=600, ge=60, le=600)
    allow_loopback_auth: bool = False
    canonical_origin: str
    artifact_root: Path
    host: str = "127.0.0.1"
    port: int = Field(default=8005, ge=1024, le=65535)
    max_json_bytes: int = Field(default=1_048_576, ge=1024, le=1_048_576)
    max_json_depth: int = Field(default=32, ge=1, le=64)

    @model_validator(mode="after")
    def validate_auth(self) -> "ApiSettings":
        if len(self.session_hash_key.get_secret_value().encode()) < 32:
            raise ValueError("A session hash key of at least 32 bytes is required")
        if bool(self.google_client_id) != bool(self.google_client_secret):
            raise ValueError("Configure both Google client credentials or neither")
        if (
            self.google_client_secret
            and not self.google_client_secret.get_secret_value()
        ):
            raise ValueError("The Google client secret must not be empty")
        if self.canonical_origin.startswith("http:") and not self.allow_loopback_auth:
            raise ValueError(
                "HTTP authentication requires explicit loopback development"
            )
        return self

    @property
    def google_callback_url(self) -> str:
        return self.canonical_origin + "/auth/google/callback"

    @property
    def login_return_url(self) -> str:
        return self.canonical_origin + "/"

    @property
    def secure_cookies(self) -> bool:
        return not self.canonical_origin.startswith("http:")

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
        # The browser lowercases hosts, compresses IPv6 and omits default ports.
        # Normalize with the existing URL parser before exact origin comparisons.
        origin = AnyHttpUrl(value)
        if (
            origin.path not in ("", "/")
            or origin.query is not None
            or origin.fragment is not None
        ):
            raise ValueError("Expected an origin without a path, query or fragment")
        return str(origin).removesuffix("/")

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
