from functools import lru_cache
from secrets import token_urlsafe
from threading import BoundedSemaphore

from argon2 import PasswordHasher, Type
from argon2.exceptions import InvalidHashError, VerificationError
from pydantic import SecretStr

from app.core.config import Settings
from app.core.exceptions import AppError

hasher = PasswordHasher(time_cost=3, memory_cost=65536, parallelism=1, type=Type.ID)
password_work = BoundedSemaphore(4)
COMMON_SECRETS = {"passwordpassword", "123456789012345", "qwertyuiopasdfgh", "adminadminadmin"}


def validate_password(secret: SecretStr, settings: Settings, *, email: str) -> None:
    value = secret.get_secret_value()
    folded = value.strip().casefold()
    if (
        not settings.admin_password_min_length <= len(value) <= 128
        or len(folded) < settings.admin_password_min_length
        or len(set(folded)) < 4
        or folded == email.casefold()
        or folded in COMMON_SECRETS
    ):
        raise AppError(422, "weak_admin_password", f"Use a strong password of at least {settings.admin_password_min_length} characters.")


def hash_password(secret: SecretStr) -> str:
    with password_work:
        return hasher.hash(secret.get_secret_value())


@lru_cache(maxsize=1)
def dummy_hash() -> str:
    return hash_password(SecretStr(token_urlsafe(32)))


def verify_password(secret: SecretStr, encoded: str) -> bool:
    try:
        with password_work:
            return hasher.verify(encoded, secret.get_secret_value())
    except (VerificationError, InvalidHashError):
        return False


def needs_rehash(encoded: str) -> bool:
    return hasher.check_needs_rehash(encoded)
