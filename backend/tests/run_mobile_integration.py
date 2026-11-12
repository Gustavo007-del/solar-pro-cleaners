"""Run the Expo HTTP client against a disposable local PostgreSQL database."""
import json
import os
import socket
import subprocess
import threading
from datetime import datetime, time, timedelta
from decimal import Decimal
from pathlib import Path
from secrets import token_urlsafe
from time import monotonic, sleep
from urllib.parse import urlsplit, urlunsplit
from uuid import uuid4
from zoneinfo import ZoneInfo

import psycopg
import uvicorn
from psycopg import sql

from alembic import command
from alembic.config import Config

ROOT = Path(__file__).resolve().parents[2]


def run() -> None:
    url = os.environ.get("TEST_POSTGRES_URL", "")
    parsed = urlsplit(url)
    if parsed.scheme not in {"postgres", "postgresql"} or parsed.hostname not in {"127.0.0.1", "::1", "localhost"}:
        raise SystemExit("TEST_POSTGRES_URL must point to a local disposable PostgreSQL cluster.")
    database_name = "solar_mobile_test_" + uuid4().hex[:12]
    database_url = urlunsplit(parsed._replace(path=f"/{database_name}"))
    with psycopg.connect(url, autocommit=True) as admin:
        admin.execute(sql.SQL("CREATE DATABASE {}").format(sql.Identifier(database_name)))
        try:
            run_clients(database_url)
        finally:
            admin.execute(sql.SQL("DROP DATABASE {} WITH (FORCE)").format(sql.Identifier(database_name)))


def run_clients(database_url: str) -> None:
    from app.core.config import Settings, get_settings
    from app.core.database import create_database

    os.environ.update(
        APP_ENVIRONMENT="development", DATABASE_URL=database_url, MIGRATION_DATABASE_URL=database_url,
        DB_CONNECTION_MODE="direct", JWT_SIGNING_SECRET=token_urlsafe(48), ADMIN_JWT_SIGNING_SECRET=token_urlsafe(48),
        ADMIN_BOOTSTRAP_NAME="Test Owner", ADMIN_BOOTSTRAP_EMAIL="owner@example.com",
        ADMIN_BOOTSTRAP_PASSWORD=token_urlsafe(32),
    )
    get_settings.cache_clear()
    command.upgrade(Config("alembic.ini"), "head")
    from app.bootstrap_owner import provision_owner
    from app.main import create_app
    from app.modules.business.models import BusinessClosure, BusinessOperatingHour, BusinessProfile
    from app.modules.locations.models import ServiceArea
    from app.modules.locations.schemas import LocationFields
    from app.modules.locations.service import coverage_key
    from app.modules.pricing.models import ServicePrice
    from app.modules.services.models import Service

    settings = Settings(_env_file=None, log_level="CRITICAL", rate_limit_secret=token_urlsafe(48))
    database = create_database(settings)
    service_date = datetime.now(ZoneInfo("Asia/Kolkata")).date() + timedelta(days=7)
    closure_date = service_date + timedelta(days=1)
    try:
        with database.sessions() as db:
            provision_owner(db, settings)
            with db.begin():
                business = BusinessProfile(business_name="Integration Test Business", timezone="Asia/Kolkata")
                service = Service(name="Test Cleaning", slug="test-cleaning", short_description="Panel cleaning",
                                  description="Test service", benefits=["Clean panels"])
                hidden = Service(name="Inactive", slug="inactive", short_description="Inactive",
                                 description="Inactive service", is_active=False)
                db.add_all([business, service, hidden])
                db.flush()
                service_id, hidden_id = str(service.id), str(hidden.id)
                db.add_all([
                    ServicePrice(service_id=service.id, pricing_type="per_panel", price_per_panel=Decimal("10.00"),
                                 minimum_charge=Decimal("100.00")),
                    ServiceArea(name="Test PIN", match_type="pin", postal_code="682001",
                                coverage_key=coverage_key("pin", LocationFields(postal_code="682001"))),
                    BusinessClosure(business_profile_id=business.id, closure_date=closure_date),
                    BusinessOperatingHour(business_profile_id=business.id, day_of_week=service_date.weekday(),
                                          is_open=True, opening_time=time(9), closing_time=time(17)),
                ])
    finally:
        database.engine.dispose()

    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        server = uvicorn.Server(uvicorn.Config(create_app(settings), log_level="critical", access_log=False))
        thread = threading.Thread(target=server.run, kwargs={"sockets": [listener]}, daemon=True)
        thread.start()
        try:
            deadline = monotonic() + 10
            while not server.started:
                if not thread.is_alive() or monotonic() > deadline:
                    raise RuntimeError("Local test API could not start.")
                sleep(0.05)
            environment = {**os.environ, "SOLAR_TEST_FIXTURE": json.dumps({
                "base": f"http://127.0.0.1:{listener.getsockname()[1]}/api/v1",
                "service": service_id, "hidden": hidden_id, "serviceDate": service_date.isoformat(),
                "closureDate": closure_date.isoformat(),
            })}
            subprocess.run(["node", "--test", "tests/mobile-api.integration.cjs"], cwd=ROOT, env=environment, check=True)
        finally:
            server.should_exit = True
            thread.join(timeout=10)


if __name__ == "__main__":
    run()

