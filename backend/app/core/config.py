import re
from datetime import date
from ipaddress import ip_network
from functools import lru_cache
from pathlib import Path
from typing import Literal
from urllib.parse import urlsplit
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import AliasChoices, Field, SecretStr, ValidationError, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict, SettingsError
from sqlalchemy.engine import URL, make_url
from sqlalchemy.exc import ArgumentError

BACKEND_ROOT = Path(__file__).resolve().parents[2]


def postgres_url(secret: SecretStr) -> URL:
    try:
        url = make_url(secret.get_secret_value())
    except (ArgumentError, ValueError):
        raise ValueError("Expected a PostgreSQL connection URL.") from None

    if url.drivername not in {"postgres", "postgresql", "postgresql+psycopg"}:
        raise ValueError("Expected a PostgreSQL connection URL for Psycopg 3.")
    if not url.host or not url.database:
        raise ValueError("A PostgreSQL host and database name are required.")
    return url.set(drivername="postgresql+psycopg")


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=BACKEND_ROOT / ".env",
        env_file_encoding="utf-8",
        env_ignore_empty=True,
        extra="ignore",
        hide_input_in_errors=True,
        populate_by_name=True,
    )

    app_name: str = Field(default="Solar Care API", min_length=1)
    app_environment: Literal["development", "staging", "production"] = "development"
    debug: bool = False
    api_version: str = Field(default="v1", pattern=r"^v[1-9]\d*$")
    api_prefix: str = Field(default="/api", pattern=r"^(/[a-zA-Z0-9_-]+)+$")
    docs_enabled: bool | None = None

    database_url: SecretStr | None = None
    migration_database_url: SecretStr | None = None
    db_connection_mode: Literal["direct", "session", "transaction"] = "direct"
    db_pool_size: int = Field(default=5, ge=1, le=100)
    db_max_overflow: int = Field(default=0, ge=0, le=100)
    db_pool_timeout_seconds: int = Field(default=5, ge=1, le=60)
    db_pool_recycle_seconds: int = Field(default=1800, ge=1)
    db_connect_timeout_seconds: int = Field(default=5, ge=2, le=30)

    trusted_hosts: list[str] = Field(default_factory=list)
    trusted_proxy_ips: list[str] = Field(default_factory=list)
    host: str = "0.0.0.0"
    port: int = Field(default=8000, ge=1, le=65535)
    web_workers: int = Field(default=1, ge=1, le=32)
    web_concurrency: int = Field(default=1, ge=1, le=4096)
    graceful_shutdown_seconds: int = Field(default=30, ge=1, le=300)
    request_max_bytes: int = Field(default=65536, ge=4096, le=1048576)

    rate_limit_secret: SecretStr | None = None
    rate_limit_window_seconds: int = Field(default=60, ge=10, le=3600)
    rate_limit_customer_register: int = Field(default=10, ge=1, le=10000)
    rate_limit_customer_login: int = Field(default=20, ge=1, le=10000)
    rate_limit_customer_refresh: int = Field(default=60, ge=1, le=10000)
    rate_limit_admin_refresh: int = Field(default=30, ge=1, le=10000)
    rate_limit_booking_create: int = Field(default=20, ge=1, le=10000)
    rate_limit_booking_cancel: int = Field(default=20, ge=1, le=10000)
    rate_limit_customer_update: int = Field(default=30, ge=1, le=10000)
    rate_limit_admin_create: int = Field(default=10, ge=1, le=10000)
    rate_limit_admin_password: int = Field(default=5, ge=1, le=10000)

    business_timezone: str = "Asia/Kolkata"
    public_privacy_effective_date: date | None = None
    private_media_bucket: str | None = Field(default=None, pattern=r"^[a-z0-9][a-z0-9-]{0,62}$")
    private_media_max_bytes: int = Field(default=5 * 1024 * 1024, ge=1024, le=25 * 1024 * 1024)

    allowed_cors_origins: list[str] = Field(default_factory=list)
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"] | None = None
    secret_key: SecretStr | None = Field(
        default=None, validation_alias=AliasChoices("JWT_SIGNING_SECRET", "SECRET_KEY")
    )
    jwt_algorithm: Literal["HS256", "HS384", "HS512"] = "HS256"
    jwt_issuer: str = Field(default="solar-care-api", min_length=1)
    jwt_audience: str = Field(default="solar-care-customers", min_length=1)
    access_token_expire_minutes: int = Field(default=15, ge=1, le=60)
    refresh_token_expire_days: int = Field(default=30, ge=1, le=180)

    admin_jwt_signing_secret: SecretStr | None = None
    admin_jwt_algorithm: Literal["HS256", "HS384", "HS512"] = "HS256"
    admin_jwt_issuer: str = Field(default="solar-care-admin-api", min_length=1)
    admin_jwt_audience: str = Field(default="solar-care-admin", min_length=1)
    admin_access_token_minutes: int = Field(default=10, ge=1, le=30)
    admin_refresh_token_days: int = Field(default=7, ge=1, le=30)
    admin_password_min_length: int = Field(default=15, ge=15, le=128)
    admin_login_window_seconds: int = Field(default=300, ge=10, le=3600)
    admin_login_attempts_per_pair: int = Field(default=5, ge=1, le=100)
    admin_login_attempts_per_source: int = Field(default=30, ge=1, le=1000)
    admin_login_attempts_per_account: int = Field(default=20, ge=1, le=1000)
    admin_browser_origins: list[str] = Field(default_factory=list)
    admin_cookie_secure: bool = True

    @field_validator("database_url", "migration_database_url")
    @classmethod
    def validate_database_url(cls, value: SecretStr | None) -> SecretStr | None:
        if value is not None:
            postgres_url(value)
        return value

    @field_validator("allowed_cors_origins", "admin_browser_origins")
    @classmethod
    def validate_origins(cls, origins: list[str]) -> list[str]:
        normalized = []
        for value in origins:
            origin = value.strip()
            try:
                parsed = urlsplit(origin)
                port = parsed.port
                valid = (
                    parsed.scheme in {"http", "https"}
                    and bool(parsed.hostname)
                    and parsed.username is None
                    and parsed.password is None
                    and parsed.path in {"", "/"}
                    and (port is None or port > 0)
                    and not any(character.isspace() for character in origin)
                    and not any(character in origin for character in "*?#\\")
                )
            except ValueError:
                valid = False
            if not valid:
                raise ValueError("CORS origins must be explicit HTTP(S) origins.")
            normalized.append(origin.rstrip("/"))
        return list(dict.fromkeys(normalized))

    @field_validator("trusted_hosts")
    @classmethod
    def validate_hosts(cls, values: list[str]) -> list[str]:
        hosts = [value.lower() for value in values]
        if any(not re.fullmatch(
            r"[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*", host
        ) or len(host) > 253 for host in hosts):
            raise ValueError("TRUSTED_HOSTS requires exact DNS names or IPv4 addresses without ports.")
        return list(dict.fromkeys(hosts))

    @field_validator("trusted_proxy_ips")
    @classmethod
    def validate_proxies(cls, values: list[str]) -> list[str]:
        for value in values:
            try:
                network = ip_network(value, strict=True)
            except ValueError:
                raise ValueError("TRUSTED_PROXY_IPS requires IP addresses or CIDRs.") from None
            if network.prefixlen == 0:
                raise ValueError("Universal proxy trust is forbidden.")
        return list(dict.fromkeys(values))

    @field_validator("business_timezone")
    @classmethod
    def validate_timezone(cls, value: str) -> str:
        try:
            ZoneInfo(value)
        except (ValueError, ZoneInfoNotFoundError):
            raise ValueError("BUSINESS_TIMEZONE must be an IANA time zone.") from None
        return value

    @model_validator(mode="after")
    def enforce_production_settings(self) -> "Settings":
        minimum_key_bytes = {"HS256": 32, "HS384": 48, "HS512": 64}[self.jwt_algorithm]
        if self.secret_key is not None and len(self.secret_key.get_secret_value().encode()) < minimum_key_bytes:
            raise ValueError("JWT_SIGNING_SECRET is too short for the configured algorithm.")
        if self.admin_jwt_signing_secret is not None:
            key = self.admin_jwt_signing_secret.get_secret_value()
            minimum = {"HS256": 32, "HS384": 48, "HS512": 64}[self.admin_jwt_algorithm]
            if len(key.encode()) < minimum or (self.secret_key and key == self.secret_key.get_secret_value()):
                raise ValueError("Use a separate, sufficiently long admin signing secret.")
            if self.admin_jwt_issuer == self.jwt_issuer or self.admin_jwt_audience == self.jwt_audience:
                raise ValueError("Admin issuer and audience must differ from customer settings.")
        if not set(self.admin_browser_origins).issubset(self.allowed_cors_origins):
            raise ValueError("Admin browser origins must also be allowed CORS origins.")
        if self.rate_limit_secret is not None:
            key = self.rate_limit_secret.get_secret_value()
            if len(key.encode()) < 32 or self.rate_limit_secret in (self.secret_key, self.admin_jwt_signing_secret):
                raise ValueError("Use an independent, sufficiently long rate-limit secret.")
        if self.app_environment != "development":
            if not self.admin_cookie_secure or any(not origin.startswith("https://") for origin in self.allowed_cors_origins):
                raise ValueError("Deployed browser origins and admin cookies require HTTPS.")
            if self.debug or self.docs_enabled or self.log_level == "DEBUG":
                raise ValueError("Debug and interactive API documentation must be disabled in deployed environments.")
            if self.database_url is None or not self.trusted_hosts:
                raise ValueError("Deployed environments require DATABASE_URL and TRUSTED_HOSTS.")
            if not all((self.secret_key, self.admin_jwt_signing_secret, self.rate_limit_secret)):
                raise ValueError("Deployed environments require customer, admin and rate-limit secrets.")
            for secret in (self.database_url, self.migration_database_url):
                if secret is None:
                    continue
                mode = postgres_url(secret).query.get("sslmode", "require")
                if mode not in ("require", "verify-ca", "verify-full"):
                    raise ValueError("Production PostgreSQL connections require TLS.")
        return self

    @property
    def versioned_prefix(self) -> str:
        return f"{self.api_prefix}/{self.api_version}"

    @property
    def expose_docs(self) -> bool:
        if self.docs_enabled is not None:
            return self.docs_enabled
        return self.app_environment == "development"

    def connection_url(self, *, migrations: bool = False) -> URL:
        if migrations and self.db_connection_mode == "transaction" and self.migration_database_url is None:
            raise RuntimeError("Set MIGRATION_DATABASE_URL to a direct or session-pooled connection.")
        secret = (self.migration_database_url if migrations else None) or self.database_url
        if secret is None:
            raise RuntimeError("PostgreSQL connection settings are required.")

        url = postgres_url(secret)
        if self.app_environment != "development" and "sslmode" not in url.query:
            url = url.update_query_dict({"sslmode": "require"})
        return url


# @lru_cache
# def get_settings() -> Settings:
#     try:
#         return Settings()
#     except (ValidationError, SettingsError):
#         # Settings errors may contain source values. Keep them out of startup logs.
#         raise RuntimeError("Invalid backend configuration. See backend/.env.example.") from None

import logging
from pydantic import ValidationError
from pydantic_settings import SettingsError

logger = logging.getLogger(__name__)


@lru_cache
def get_settings() -> Settings:
    try:
        return Settings()

    except ValidationError as exc:
        # Log validation details without exposing secret values.
        for error in exc.errors(include_url=False):
            field = ".".join(str(loc) for loc in error.get("loc", []))
            message = error.get("msg", "Unknown validation error")
            error_type = error.get("type", "unknown")

            logger.error(
                "Configuration validation failed: field=%s type=%s message=%s",
                field,
                error_type,
                message,
            )

        raise RuntimeError(
            "Invalid backend configuration. Check the deployment logs for the invalid setting name."
        ) from None

    except SettingsError as exc:
        # Settings parsing errors, such as invalid JSON arrays.
        logger.error(
            "Configuration settings parsing failed: %s",
            str(exc),
        )

        raise RuntimeError(
            "Invalid backend configuration. Check the deployment logs."
        ) from None