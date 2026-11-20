"""Exercise the assistant API against a disposable PostgreSQL database.

Only the outbound Groq HTTP request is intercepted. No paid or live inference is used here.
"""
import base64
import os
from secrets import token_bytes, token_urlsafe
from time import time
from unittest.mock import patch
from urllib.parse import urlsplit, urlunsplit
from uuid import uuid4

import httpx
import psycopg
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from psycopg import sql


def run() -> None:
    url = os.environ.get("TEST_POSTGRES_URL", "")
    parsed = urlsplit(url)
    if parsed.scheme not in {"postgres", "postgresql"} or parsed.hostname not in {"127.0.0.1", "::1", "localhost"}:
        raise SystemExit("TEST_POSTGRES_URL must point to a local disposable PostgreSQL cluster.")
    name = "solar_assistant_test_" + uuid4().hex[:12]
    url_for_test = urlunsplit(parsed._replace(path=f"/{name}"))
    with psycopg.connect(url, autocommit=True) as admin:
        admin.execute(sql.SQL("CREATE DATABASE {}").format(sql.Identifier(name)))
        try:
            run_api(url_for_test)
        finally:
            admin.execute(sql.SQL("DROP DATABASE {} WITH (FORCE)").format(sql.Identifier(name)))


def run_api(url: str) -> None:
    os.environ.update(APP_ENVIRONMENT="development", DATABASE_URL=url, MIGRATION_DATABASE_URL=url,
                      DB_CONNECTION_MODE="direct", JWT_SIGNING_SECRET=token_urlsafe(48))
    from app.core.config import Settings
    from app.main import create_app
    from app.modules.assistant.groq import GROQ_CHAT_URL

    command.upgrade(Config("alembic.ini"), "head")
    settings = Settings(_env_file=None, log_level="CRITICAL", rate_limit_secret=token_urlsafe(48),
                        groq_api_key="test-only-key", groq_model="openai/gpt-oss-20b")
    calls = []
    provider_status = 200
    provider_times_out = False

    async def provider(url, *, json, headers):
        assert url == GROQ_CHAT_URL and headers["Authorization"] == "Bearer test-only-key"
        assert json["model"] == "openai/gpt-oss-20b" and json["service_tier"] == "on_demand"
        calls.append(json["messages"])
        if provider_times_out:
            raise httpx.ReadTimeout("private upstream details")
        if provider_status == 429:
            return httpx.Response(429, json={"private": "private upstream details"}, headers={"Retry-After": "30"})
        return httpx.Response(200, json={"choices": [{"message": {"content": f"Test reply {len(calls)}"}}]})

    with (
        TestClient(create_app(settings)) as client,
        patch.object(httpx.AsyncClient, "post", side_effect=provider),
        patch("app.modules.assistant.service.time", return_value=time()),
    ):
        prefix = "/api/v1/ai"

        def register(phone, **fields):
            return client.post("/api/v1/customers/register", json={
                "full_name": "Test Customer", "phone_number": phone,
                "installation_credential": base64.urlsafe_b64encode(token_bytes(32)).decode().rstrip("="), **fields,
            })

        assert register("9000000001", solar_capacity_kv=6).status_code == 422
        first = register("9000000001", solar_company=" Example Solar ", solar_capacity_kv=5)
        second = register("9000000002")
        assert first.status_code == second.status_code == 201
        assert first.json()["customer"]["solar_company"] == "Example Solar"
        assert first.json()["customer"]["solar_capacity_kv"] == 5
        assert second.json()["customer"]["solar_company"] is None
        assert second.json()["customer"]["solar_capacity_kv"] is None
        owner, other = ({"Authorization": f"Bearer {result.json()['tokens']['access_token']}"} for result in (first, second))
        profile = client.get("/api/v1/customers/me", headers=owner).json()
        assert profile["solar_company"] == "Example Solar" and profile["solar_capacity_kv"] == 5
        assert client.get(f"{prefix}/conversations").status_code == 401
        assert client.post(f"{prefix}/chat", headers=owner, json={
            "request_id": str(uuid4()), "message": " ",
        }).status_code == 422

        first_turn = {"request_id": str(uuid4()), "message": "How do I book?"}
        response = client.post(f"{prefix}/chat", headers=owner, json=first_turn)
        assert response.status_code == 200, response.text
        chat = response.json()
        conversation_id = chat["conversation"]["id"]
        assert [message["role"] for message in chat["messages"]] == ["user", "assistant"]
        replay = client.post(f"{prefix}/chat", headers=owner, json=first_turn)
        assert replay.json() == chat, (replay.json(), chat)
        assert len(calls) == 1

        messages = f"{prefix}/conversations/{conversation_id}/messages"
        regenerate = f"{prefix}/conversations/{conversation_id}/regenerate"
        conversation = f"{prefix}/conversations/{conversation_id}"
        for result in (
            client.get(messages, headers=other),
            client.post(regenerate, headers=other, json={"request_id": str(uuid4()), "revision": 1}),
            client.post(f"{prefix}/chat", headers=other, json={
                "request_id": str(uuid4()), "conversation_id": conversation_id, "message": "Read history",
            }),
            client.delete(conversation, headers=other),
        ):
            assert result.status_code == 404
        assert not client.get(f"{prefix}/conversations", headers=other).json()["items"]

        follow_up = {"request_id": str(uuid4()), "conversation_id": conversation_id, "message": "And what comes next?"}
        assert client.post(f"{prefix}/chat", headers=owner, json=follow_up).status_code == 200
        assert calls[-1][1:] == [
            {"role": "user", "content": first_turn["message"]},
            {"role": "assistant", "content": "Test reply 1"},
            {"role": "user", "content": follow_up["message"]},
        ]
        update = {"request_id": str(uuid4()), "revision": 2}
        regenerated = client.post(regenerate, headers=owner, json=update)
        assert regenerated.status_code == 200 and regenerated.json()["conversation"]["revision"] == 3
        assert client.post(regenerate, headers=owner, json=update).json() == regenerated.json() and len(calls) == 3
        latest = client.get(messages, headers=owner, params={"limit": 2}).json()
        assert [message["position"] for message in latest["items"]] == [3, 4]
        assert latest["items"][-1]["content"] == "Test reply 3"
        older = client.get(messages, headers=owner, params={"before": latest["next_before"], "limit": 2}).json()
        assert [message["position"] for message in older["items"]] == [1, 2] and older["next_before"] is None

        provider_status = 429
        rejected = client.post(f"{prefix}/chat", headers=owner, json={**follow_up, "request_id": str(uuid4())})
        assert rejected.status_code == 429 and rejected.json()["error"]["code"] == "assistant_quota"
        assert rejected.headers["Retry-After"] == "30"
        assert "private upstream details" not in rejected.text
        limited = client.post(f"{prefix}/chat", headers=owner, json={**follow_up, "request_id": str(uuid4())})
        assert limited.status_code == 429 and limited.json()["error"]["code"] == "assistant_rate_limited"
        assert len(calls) == 4 and len(client.get(messages, headers=owner).json()["items"]) == 4

        provider_times_out = True
        timeout = client.post(f"{prefix}/chat", headers=other, json={**first_turn, "request_id": str(uuid4())})
        assert timeout.status_code == 504 and timeout.json()["error"]["code"] == "assistant_timeout"
        assert client.get(f"{prefix}/conversations", headers=owner).json()["total"] == 1
        assert client.delete(conversation, headers=owner).status_code == 204
        assert client.get(messages, headers=owner).status_code == 404
    print("Assistant and solar registration integration passed.")


if __name__ == "__main__":
    run()
