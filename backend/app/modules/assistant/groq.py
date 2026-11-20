import asyncio

import httpx

from app.core.config import Settings
from app.core.exceptions import AppError

GROQ_CHAT_URL = "https://api.groq.com/openai/v1/chat/completions"


async def completion(settings: Settings, messages: list[dict[str, str]]) -> str:
    if not settings.groq_model or not settings.groq_api_key:
        raise AppError(503, "assistant_unavailable", "The assistant is temporarily unavailable.")

    payload = {
        "model": settings.groq_model,
        "messages": messages,
        "max_completion_tokens": 768,
        "service_tier": "on_demand",
    }
    if settings.groq_model in {"openai/gpt-oss-20b", "openai/gpt-oss-120b"}:
        payload["reasoning_effort"] = "low"

    try:
        async with asyncio.timeout(18), httpx.AsyncClient(timeout=httpx.Timeout(16, connect=4)) as client:
            result = await client.post(
                GROQ_CHAT_URL, json=payload,
                headers={"Authorization": f"Bearer {settings.groq_api_key.get_secret_value()}"},
            )
    except (TimeoutError, httpx.TimeoutException):
        raise AppError(504, "assistant_timeout", "The assistant took too long to reply. Please try again.") from None
    except httpx.HTTPError:
        raise AppError(503, "assistant_unavailable", "The assistant is temporarily unavailable.") from None

    if result.status_code in (402, 429):
        retry = result.headers.get("Retry-After", "")
        headers = {"Retry-After": retry} if retry.isascii() and retry.isdigit() and len(retry) <= 6 else None
        raise AppError(
            429, "assistant_quota", "The assistant has reached its free usage limit. Please try again later.",
            headers=headers,
        )
    if not result.is_success:
        raise AppError(503, "assistant_unavailable", "The assistant is temporarily unavailable.")

    try:
        content = result.json()["choices"][0]["message"]["content"]
        if isinstance(content, str):
            answer = content.replace("\x00", "").encode("utf-8", errors="replace").decode("utf-8").strip()
            if answer:
                return answer[:6000]
    except (ValueError, KeyError, IndexError, TypeError):
        pass
    raise AppError(502, "assistant_empty_reply", "The assistant could not finish a reply. Please try again.")
