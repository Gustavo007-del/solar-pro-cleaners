from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Query, Response
from starlette.concurrency import run_in_threadpool

from app.api.dependencies import AppSettings, DatabaseSession
from app.api.rate_limits import RATE_LIMITED
from app.modules.assistant import groq, service
from app.modules.assistant.schemas import ChatRequest, ChatTurn, ConversationSummary, MessagePage, RegenerateRequest
from app.modules.customers.dependencies import AuthenticatedCustomer
from app.schemas.common import Page, PaginationParams

router = APIRouter(prefix="/ai", tags=["AI Assistant"], responses=RATE_LIMITED)


async def generate(
    db: DatabaseSession, settings: AppSettings, customer: AuthenticatedCustomer,
    conversation_id: UUID | None, data: ChatRequest | RegenerateRequest,
) -> ChatTurn:
    generation = await run_in_threadpool(service.prepare, db, settings, customer.customer_id, conversation_id, data)
    if isinstance(generation, ChatTurn):
        return generation
    # Preparation releases the database connection before the outbound call.
    answer = await groq.completion(settings, generation.messages)
    return await run_in_threadpool(service.save_turn, db, customer, conversation_id, data, generation, answer)


@router.post("/chat")
async def chat(
    data: ChatRequest, db: DatabaseSession, settings: AppSettings, customer: AuthenticatedCustomer, response: Response,
) -> ChatTurn:
    response.headers["Cache-Control"] = "no-store"
    return await generate(db, settings, customer, data.conversation_id, data)


@router.post("/conversations/{conversation_id}/regenerate")
async def regenerate(
    conversation_id: UUID, data: RegenerateRequest, db: DatabaseSession, settings: AppSettings,
    customer: AuthenticatedCustomer, response: Response,
) -> ChatTurn:
    response.headers["Cache-Control"] = "no-store"
    return await generate(db, settings, customer, conversation_id, data)


@router.get("/conversations")
def conversations(
    db: DatabaseSession, customer: AuthenticatedCustomer, query: Annotated[PaginationParams, Query()], response: Response,
) -> Page[ConversationSummary]:
    response.headers["Cache-Control"] = "no-store"
    return service.list_conversations(db, customer.customer_id, query)


@router.get("/conversations/{conversation_id}/messages")
def messages(
    conversation_id: UUID, db: DatabaseSession, customer: AuthenticatedCustomer, response: Response,
    before: Annotated[int | None, Query(ge=1, le=service.MAX_MESSAGES + 1)] = None,
    limit: Annotated[int, Query(ge=1, le=30)] = 20,
) -> MessagePage:
    response.headers["Cache-Control"] = "no-store"
    return service.read_messages(db, customer.customer_id, conversation_id, before, limit)


@router.delete("/conversations/{conversation_id}", status_code=204)
def clear(conversation_id: UUID, db: DatabaseSession, customer: AuthenticatedCustomer) -> Response:
    service.delete_conversation(db, customer.customer_id, conversation_id)
    return Response(status_code=204, headers={"Cache-Control": "no-store"})
