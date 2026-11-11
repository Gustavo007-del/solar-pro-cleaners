from uuid import UUID

from pydantic import Field

from app.schemas.catalogue import ConfigInput, LongText, PublicPageQuery, PublicRecord, Slug, Text120, Text300


class ServiceInput(ConfigInput):
    name: Text120
    slug: Slug
    short_description: Text300
    description: LongText
    benefits: list[Text300] = Field(default_factory=list, max_length=8)
    is_active: bool = True
    display_order: int = Field(default=0, ge=0, le=2147483647)


class ServiceQuery(PublicPageQuery):
    search: Text120 | None = None


class ServiceSummary(PublicRecord):
    id: UUID
    name: str
    slug: str
    short_description: str
    benefits: list[str]
    display_order: int


class ServiceDetails(ServiceSummary):
    description: str
