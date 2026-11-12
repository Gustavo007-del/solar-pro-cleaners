"""Exercise the notification API and worker queue against disposable PostgreSQL.

Run from backend/ with TEST_POSTGRES_URL set to a local test cluster.
Requires the dev-only httpx package. Expo calls are simulated.
"""

import os
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta
from secrets import token_urlsafe
from threading import Barrier, Event
from urllib.parse import urlsplit, urlunsplit
from uuid import uuid4

import psycopg
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from psycopg import sql
from sqlalchemy import func, select


def check_schedule():
    from app.modules.notifications.scheduling import next_occurrence
    from app.modules.notifications.schemas import Schedule

    monthly = Schedule(mode="repeat", frequency="monthly", start_at=datetime(2027, 1, 31, 10), month_day=31)
    first = next_occurrence(monthly)
    assert first == datetime(2027, 1, 31, 4, 30, tzinfo=UTC)
    assert next_occurrence(monthly, first) == datetime(2027, 2, 28, 4, 30, tzinfo=UTC)
    weekly = Schedule(mode="repeat", frequency="weekly", start_at=datetime(2027, 1, 1, 9), weekdays=[0, 2])
    assert next_occurrence(weekly) == datetime(2027, 1, 4, 3, 30, tzinfo=UTC)
    daily = Schedule(mode="repeat", frequency="daily", timezone="America/New_York",
                     start_at=datetime(2027, 3, 13, 2, 30))
    gap = next_occurrence(daily, next_occurrence(daily))
    assert gap == datetime(2027, 3, 14, 7, 30, tzinfo=UTC)
    assert next_occurrence(daily, gap) == datetime(2027, 3, 15, 6, 30, tzinfo=UTC)
    once = Schedule(mode="once", start_at=datetime(2027, 11, 20, 10, 30))
    assert next_occurrence(once) == datetime(2027, 11, 20, 5, tzinfo=UTC)
    assert next_occurrence(once, next_occurrence(once)) is None
    print("PASS: one-time, weekly, monthly and DST schedule calculations")


def exercise(database_url: str):
    from app.core.config import Settings, get_settings

    os.environ.update(
        APP_ENVIRONMENT="development", DATABASE_URL=database_url, MIGRATION_DATABASE_URL=database_url,
        DB_CONNECTION_MODE="direct", JWT_SIGNING_SECRET=token_urlsafe(48), ADMIN_JWT_SIGNING_SECRET=token_urlsafe(48),
        RATE_LIMIT_SECRET=token_urlsafe(48), LOG_LEVEL="CRITICAL",
    )
    get_settings.cache_clear()
    command.upgrade(Config("alembic.ini"), "head")

    from app.core.database import create_database
    from app.main import create_app
    from app.modules.admins.credentials import AdminIdentity, issue_access
    from app.modules.admins.models import AdminAuditLog, AdminSession, AdminUser
    from app.modules.notifications.expo import ExpoFailure
    from app.modules.notifications.models import CustomerDevice, NotificationCampaign, NotificationDelivery, NotificationExecution
    from app.modules.notifications.queue import (
        claim_campaigns, claim_receipts, claim_sends, recover_and_finalize, store_receipts, store_sends,
    )
    from app.modules.notifications.worker import run_cycle

    check_schedule()
    settings = Settings(_env_file=None, notification_receipt_delay_seconds=1, notification_http_timeout_seconds=1)
    database = create_database(settings)
    now = datetime.now(UTC)
    expires = now + timedelta(hours=1)
    prefix = "/api/v1"
    path = "/admin/notifications/campaigns"
    devices = "/customers/me/devices"

    def headers(token):
        return {"Authorization": f"Bearer {token}"}

    def admin(role):
        with database.sessions.begin() as db:
            person = AdminUser(role=role, full_name=f"Test {role}", email=f"{role}@example.com", password_hash="unused")
            db.add(person)
            db.flush()
            session = AdminSession(admin_user_id=person.id, transport="token", family_id=uuid4(),
                                   refresh_token_hash=uuid4().hex * 2, expires_at=expires)
            db.add(session)
            db.flush()
            token, _ = issue_access(settings, AdminIdentity(person.id, session.id), now, expires)
        return headers(token)

    def call(client, method, endpoint, expected, *, auth=None, **kwargs):
        response = client.request(method, prefix + endpoint, headers=auth, **kwargs)
        assert response.status_code == expected, (method, endpoint, response.status_code, response.text)
        return response.json() if response.content else None

    def customer(client, name, phone):
        result = call(client, "POST", "/customers/register", 201, json={
            "full_name": name, "phone_number": phone, "installation_credential": token_urlsafe(32),
        })
        return result["customer"]["id"], headers(result["tokens"]["access_token"])

    def register(client, auth, token):
        return call(client, "POST", devices, 200, auth=auth, json={"expo_push_token": token, "platform": "android"})

    def draft(client, auth, recipient=None, schedule=None, request_id=None):
        return call(client, "POST", path, 201, auth=auth, json={
            "request_id": request_id or str(uuid4()), "title": "Test", "message": "This is a test campaign.",
            "recipient_type": "selected_customers" if recipient else "all_customers",
            "customer_ids": [recipient] if recipient else [], "schedule": schedule or {"mode": "now"},
        })

    def mutate(client, auth, campaign, action, expected=200, confirm=False):
        return call(client, "POST", f"{path}/{campaign['id']}/actions/{action}", expected, auth=auth,
                    json={"confirm_broadcast": confirm})

    class ExpoStub:
        def __init__(self):
            self.sent = []

        def send(self, messages):
            self.sent.extend(messages)
            return [{"status": "ok", "id": f"ticket-{i}"} for i, _ in enumerate(messages)]

        def receipts(self, tickets):
            return {ticket: {"status": "ok"} for ticket in tickets}

    try:
        owner, manager, staff = admin("owner"), admin("admin"), admin("staff")
        with TestClient(create_app(settings)) as client:
            c1, customer1 = customer(client, "Customer One", "+919000000001")
            c2, customer2 = customer(client, "Customer Two", "+919000000002")
            d1 = register(client, customer1, "ExpoPushToken[test-phone-one]")
            assert register(client, customer1, "ExpoPushToken[test-phone-one-new]")["id"] == d1["id"]
            d2 = register(client, customer2, "ExpoPushToken[test-phone-two]")
            assert "expo_push_token" not in d2
            # A second installation for the same account exercises per-device fanout.
            from app.modules.customers.credentials import AccessIdentity, issue_access_token
            from app.modules.customers.models import CustomerInstallation, RefreshSession
            with database.sessions.begin() as db:
                installation = CustomerInstallation(customer_id=c1, credential_hash=uuid4().hex * 2)
                db.add(installation)
                db.flush()
                session = RefreshSession(customer_id=c1, installation_id=installation.id, family_id=uuid4(),
                                         refresh_token_hash=uuid4().hex * 2, expires_at=expires)
                db.add(session)
                db.flush()
                secondary, _ = issue_access_token(AccessIdentity(installation.customer_id, session.id), settings, now, expires)
            register(client, headers(secondary), "ExpoPushToken[test-phone-three]")
            assert call(client, "GET", devices, 200, auth=customer1)["total"] == 2
            call(client, "DELETE", f"{devices}/{d2['id']}", 404, auth=customer1)
            call(client, "GET", path, 401, auth=customer1)
            call(client, "GET", path, 403, auth=staff)
            call(client, "GET", devices, 401, auth=owner)
            request_id = str(uuid4())
            immediate = draft(client, owner, request_id=request_id)
            assert draft(client, owner, request_id=request_id)["id"] == immediate["id"]
            mutate(client, manager, immediate, "send", 403, confirm=True)
            mutate(client, owner, immediate, "send", 422)
            mutate(client, owner, immediate, "send", confirm=True)
            mutate(client, owner, immediate, "send", 409, confirm=True)
            call(client, "PATCH", "/customers/me/notification-preferences", 204, auth=customer2, json={"enabled": False})
            stub = ExpoStub()
            with database.sessions() as db:
                run_cycle(db, settings, stub, Event())
            assert {item["to"] for item in stub.sent} == {
                "ExpoPushToken[test-phone-one-new]", "ExpoPushToken[test-phone-three]",
            }
            history = call(client, "GET", f"{path}/{immediate['id']}/executions", 200, auth=owner)
            assert history["total"] == 1 and history["items"][0]["successful_submissions"] == 2
            with database.sessions() as db:
                jobs = claim_receipts(db, settings, now + timedelta(minutes=1))
                assert len(jobs) == 2
                store_receipts(db, settings, now + timedelta(minutes=1), jobs, {
                    jobs[0].ticket: {"status": "ok"},
                    jobs[1].ticket: {"status": "error", "details": {"error": "DeviceNotRegistered"}},
                })
            logs = call(client, "GET", f"{path}/{immediate['id']}/deliveries", 200, auth=owner)
            assert {item["status"] for item in logs["items"]} == {"provider_accepted", "invalid_device"}
            assert all(item["submission_accepted"] and "expo_push_token" not in item for item in logs["items"])
            stats = call(client, "GET", "/admin/notifications/stats", 200, auth=owner)
            assert stats["submissions"] == 2 and stats["eligible_devices"] == 1
            device_list = call(client, "GET", f"/admin/notifications/devices?customer_id={c1}", 200, auth=owner)
            assert device_list["total"] == 2 and all("expo_push_token" not in item for item in device_list["items"])
            print("PASS: device ownership, token rotation, multi-device fanout, RBAC, deduplication and Expo receipts")

            first = now + timedelta(days=1)
            repeating = draft(client, manager, c1, {"mode": "repeat", "frequency": "minutes",
                                                   "interval": 30, "max_occurrences": 2, "start_at": first.isoformat()})
            mutate(client, manager, repeating, "schedule")
            mutate(client, manager, repeating, "pause")
            with database.sessions() as db:
                assert claim_campaigns(db, first + timedelta(minutes=3), 10) == 0
            mutate(client, manager, repeating, "resume")

            barrier = Barrier(2)
            late = first + timedelta(minutes=65)

            def competing_claim():
                with database.sessions() as db:
                    barrier.wait(timeout=10)
                    return claim_campaigns(db, late, 10)

            with ThreadPoolExecutor(max_workers=2) as pool:
                assert sorted(pool.map(lambda _: competing_claim(), range(2))) == [0, 1]

            # A fresh connection picks up the outbox after the scheduling process has exited.
            with database.sessions() as db:
                jobs = claim_sends(db, late, 100)
                assert len(jobs) == 1 and jobs[0].attempt == 1
                store_sends(db, settings, late, jobs, None, ExpoFailure("expo_temporarily_unavailable", retryable=True))
                assert claim_sends(db, late + timedelta(seconds=5), 100) == []
                jobs = claim_sends(db, late + timedelta(seconds=16), 100)
                assert len(jobs) == 1 and jobs[0].attempt == 2
                store_sends(db, settings, late + timedelta(seconds=17), jobs, [{"status": "ok", "id": "retry-ok"}])
                assert recover_and_finalize(db, settings, late + timedelta(seconds=18)) == 1
            following = first + timedelta(minutes=90)
            with database.sessions() as db:
                assert claim_campaigns(db, following - timedelta(seconds=1), 10) == 0
                assert claim_campaigns(db, following, 10) == 1
                assert len(claim_sends(db, following, 100)) == 1
            # Simulate a worker crash after claiming but before persisting the send response.
            with database.sessions() as db:
                restarted = following + timedelta(minutes=2)
                assert recover_and_finalize(db, settings, restarted) == 1
                assert claim_sends(db, restarted, 100) == []
                assert claim_campaigns(db, restarted, 10) == 0
                assert db.scalar(select(func.count()).select_from(NotificationExecution)) == 3
                assert db.scalar(select(func.count()).select_from(NotificationDelivery)
                                 .where(NotificationDelivery.error_code == "submission_unknown")) == 1
                assert db.scalar(select(func.count()).select_from(AdminAuditLog).where(
                    AdminAuditLog.resource_type == "notification_campaign",
                )) >= 6
            result = call(client, "GET", f"{path}/{repeating['id']}", 200, auth=manager)
            assert result["next_run_at"] is None and result["occurrence_count"] == 2
            print("PASS: overlapping workers, durable restart recovery, retry backoff, missed slots and occurrence limits")

            single = draft(client, manager, c1, {"mode": "once", "start_at": first.isoformat()})
            changed = {key: single[key] for key in (
                "title", "message", "notification_type", "recipient_type", "customer_ids",
                "destination", "booking_id", "custom_data", "schedule",
            )}
            changed["message"] = "Edited before sending."
            call(client, "PUT", f"{path}/{single['id']}", 200, auth=manager, json=changed)
            mutate(client, manager, single, "schedule")
            with database.sessions() as db:
                assert claim_campaigns(db, first, 10) == 1
            mutate(client, manager, single, "cancel")
            with database.sessions() as db:
                assert claim_sends(db, following + timedelta(minutes=5), 100) == []
                assert recover_and_finalize(db, settings, following + timedelta(minutes=5)) == 1
                assert db.scalar(select(func.count()).select_from(NotificationDelivery)
                                 .where(NotificationDelivery.status == "cancelled")) == 1
                assert db.scalar(select(func.count()).select_from(NotificationCampaign)
                                 .where(NotificationCampaign.status == "cancelled")) == 1
            call(client, "POST", "/customers/auth/logout-all", 200, auth=customer1)
            with database.sessions() as db:
                assert db.scalar(select(func.count()).select_from(CustomerDevice)
                                 .where(CustomerDevice.is_active.is_(True))) == 0
            print("PASS: one-time scheduling, editing, cancellation and device logout")
    finally:
        database.engine.dispose()


def main():
    url = os.environ.get("TEST_POSTGRES_URL", "")
    parsed = urlsplit(url)
    if parsed.scheme not in {"postgres", "postgresql"} or parsed.hostname not in {"127.0.0.1", "::1", "localhost"}:
        raise SystemExit("TEST_POSTGRES_URL must point to a local disposable PostgreSQL cluster.")
    name = "solar_push_test_" + uuid4().hex[:12]
    with psycopg.connect(url, autocommit=True) as db:
        db.execute(sql.SQL("CREATE DATABASE {}").format(sql.Identifier(name)))
        try:
            exercise(urlunsplit(parsed._replace(path=f"/{name}")))
        finally:
            db.execute(sql.SQL("DROP DATABASE {} WITH (FORCE)").format(sql.Identifier(name)))


if __name__ == "__main__":
    main()
