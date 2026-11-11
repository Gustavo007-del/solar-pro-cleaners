"""Provider contract for future private cleaning media."""
from dataclasses import dataclass
from typing import Protocol
from uuid import UUID, uuid4

from app.core.config import Settings


class PrivateObjectStore(Protocol):
    def put_private(self, *, key: str, content: bytes, content_type: str) -> None: ...

    def create_signed_read_url(self, *, key: str, expires_seconds: int) -> str: ...


@dataclass(frozen=True)
class PrivateImage:
    key: str
    content_type: str


def prepare_private_image(settings: Settings, booking_id: UUID, content: bytes) -> PrivateImage:
    """Check size and image signature before handing bytes to a future image decoder."""
    if not 0 < len(content) <= settings.private_media_max_bytes:
        raise ValueError("Image exceeds the configured size limit.")
    if content.startswith(b"\x89PNG\r\n\x1a\n"):
        extension, content_type = "png", "image/png"
    elif content.startswith(b"\xff\xd8\xff"):
        extension, content_type = "jpg", "image/jpeg"
    else:
        raise ValueError("Unsupported image format.")
    return PrivateImage(key=f"bookings/{booking_id}/{uuid4().hex}.{extension}", content_type=content_type)

