from datetime import UTC
from typing import Annotated, Literal
from uuid import UUID

from pydantic import AfterValidator, AwareDatetime, BaseModel, ConfigDict, Field, StringConstraints

Question = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=1000, pattern=r"^[^\x00]+$")]
UtcTimestamp = Annotated[AwareDatetime, AfterValidator(lambda value: value.astimezone(UTC))]


class ChatRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    request_id: UUID
    conversation_id: UUID | None = None
    message: Question


class RegenerateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    request_id: UUID
    revision: int = Field(ge=1)


class ConversationSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    title: str
    revision: int
    updated_at: UtcTimestamp


class Message(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    role: Literal["user", "assistant"]
    content: str
    position: int
    created_at: UtcTimestamp


class MessagePage(BaseModel):
    conversation: ConversationSummary
    items: list[Message]
    next_before: int | None


class ChatTurn(BaseModel):
    conversation: ConversationSummary
    messages: list[Message]
