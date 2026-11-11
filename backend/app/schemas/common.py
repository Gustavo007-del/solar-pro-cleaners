from typing import Generic, Literal, TypeVar

from pydantic import BaseModel, Field, computed_field

Item = TypeVar("Item")


class PaginationParams(BaseModel):
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=20, ge=1, le=100)

    @property
    def offset(self) -> int:
        return (self.page - 1) * self.page_size


class Page(BaseModel, Generic[Item]):
    items: list[Item]
    page: int = Field(ge=1)
    page_size: int = Field(ge=1, le=100)
    total: int = Field(ge=0)


class AdminPage(Page[Item], Generic[Item]):
    @computed_field
    @property
    def total_pages(self) -> int:
        return (self.total + self.page_size - 1) // self.page_size

    @computed_field
    @property
    def has_next(self) -> bool:
        return self.page < self.total_pages

    @computed_field
    @property
    def has_previous(self) -> bool:
        return self.total > 0 and self.page > 1


class ValidationIssue(BaseModel):
    source: Literal["body", "query", "path", "header", "cookie", "request"]
    code: Literal["required", "invalid"]


class ErrorDetail(BaseModel):
    code: str
    message: str
    request_id: str | None = None
    details: list[ValidationIssue] | None = None


class ErrorResponse(BaseModel):
    error: ErrorDetail
