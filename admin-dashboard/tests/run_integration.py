"""Exercise the dashboard and FastAPI with an isolated loopback database."""
import argparse
import json
import os
import socket
import subprocess
import sys
import threading
from datetime import datetime, time, timedelta
from decimal import Decimal
from pathlib import Path
from secrets import token_urlsafe
from time import monotonic, sleep
from urllib.parse import urlsplit, urlunsplit
from urllib.request import urlopen
from uuid import uuid4
from zoneinfo import ZoneInfo

import psycopg
import uvicorn
from alembic import command
from alembic.config import Config
from psycopg import sql

DASHBOARD = Path(__file__).resolve().parents[1]
BACKEND = DASHBOARD.parent / "backend"
LOCAL_EMAIL = "owner@example.com"
LOCAL_PASSWORD = "Dashboard-fixture-83!sunrise"


def run() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--preview", action="store_true")
    args = parser.parse_args()
    root = urlsplit(os.environ.get("TEST_POSTGRES_URL", ""))
    if root.scheme != "postgresql" or root.hostname not in {"127.0.0.1", "localhost", "::1"}:
        raise SystemExit("Set TEST_POSTGRES_URL to a disposable local PostgreSQL cluster.")
    if not (DASHBOARD / "node_modules" / "next").exists():
        raise SystemExit("Run npm ci in admin-dashboard first.")
    sys.path.insert(0, str(BACKEND))
    os.chdir(BACKEND)
    database = "solar_admin_test_" + uuid4().hex[:12]
    with psycopg.connect(urlunsplit(root), autocommit=True) as connection:
        connection.execute(sql.SQL("CREATE DATABASE {}").format(sql.Identifier(database)))
        try:
            run_servers(urlunsplit(root._replace(path=f"/{database}")), args.preview)
        finally:
            connection.execute(sql.SQL("DROP DATABASE {} WITH (FORCE)").format(sql.Identifier(database)))


def run_servers(database_url: str, preview: bool) -> None:
    with socket.socket() as listener, socket.socket() as web_socket:
        listener.bind(("127.0.0.1", 0))
        web_socket.bind(("127.0.0.1", 0))
        port = web_socket.getsockname()[1]
        web_socket.close()
        api_base = f"http://127.0.0.1:{listener.getsockname()[1]}/api/v1"
        dashboard = f"http://127.0.0.1:{port}"
        os.environ.update(APP_ENVIRONMENT="development", DATABASE_URL=database_url, MIGRATION_DATABASE_URL=database_url,
                          DB_CONNECTION_MODE="direct", JWT_SIGNING_SECRET=token_urlsafe(48),
                          ADMIN_JWT_SIGNING_SECRET=token_urlsafe(48), ADMIN_BOOTSTRAP_NAME="Solar Care Owner",
                          ADMIN_BOOTSTRAP_EMAIL=LOCAL_EMAIL, ADMIN_BOOTSTRAP_PASSWORD=LOCAL_PASSWORD,
                          ADMIN_COOKIE_SECURE="false", ADMIN_BROWSER_ORIGINS=json.dumps([dashboard]),
                          ALLOWED_CORS_ORIGINS=json.dumps([dashboard]), LOG_LEVEL="CRITICAL")
        command.upgrade(Config("alembic.ini"), "head")

        from app.bootstrap_owner import provision_owner
        from app.core.config import get_settings
        from app.core.database import create_database
        from app.main import create_app
        from app.modules.business.models import BusinessOperatingHour, BusinessProfile
        from app.modules.pricing.models import ServicePrice
        from app.modules.services.models import Service

        settings = get_settings()
        db = create_database(settings)
        day = datetime.now(ZoneInfo("Asia/Kolkata")).date() + timedelta(days=2)
        try:
            with db.sessions() as session:
                provision_owner(session, settings)
                with session.begin():
                    business = BusinessProfile(business_name="Solar Care", timezone="Asia/Kolkata")
                    service = Service(name="Solar panel cleaning", slug="solar-panel-cleaning",
                                      short_description="Professional rooftop panel care",
                                      description="On-site cleaning for residential solar installations.")
                    session.add_all([business, service])
                    session.flush()
                    service_id = str(service.id)
                    session.add(ServicePrice(service_id=service.id, pricing_type="fixed", base_price=Decimal("550.00")))
                    session.add(BusinessOperatingHour(business_profile_id=business.id, day_of_week=day.weekday(),
                                                       is_open=True, opening_time=time(9), closing_time=time(17)))
        finally:
            db.engine.dispose()

        server = uvicorn.Server(uvicorn.Config(create_app(settings), log_level="critical", access_log=False))
        api_thread = threading.Thread(target=server.run, kwargs={"sockets": [listener]}, daemon=True)
        api_thread.start()
        process = None
        try:
            deadline = monotonic() + 12
            while not server.started:
                if monotonic() > deadline or not api_thread.is_alive():
                    raise RuntimeError("The local API did not start.")
                sleep(.05)
            web_env = {**os.environ, "API_BASE_URL": api_base, "DASHBOARD_ORIGIN": dashboard,
                       "NEXT_TELEMETRY_DISABLED": "1"}
            process = subprocess.Popen(["node", "node_modules/next/dist/bin/next", "dev",
                                        "--hostname", "127.0.0.1", "--port", str(port)], cwd=DASHBOARD, env=web_env)
            deadline = monotonic() + 120
            while True:
                try:
                    with urlopen(dashboard + "/login", timeout=3) as response:
                        if response.status == 200:
                            break
                except OSError:
                    if monotonic() > deadline or process.poll() is not None:
                        raise RuntimeError("The dashboard preview did not start.") from None
                    sleep(.3)
            fixture = json.dumps({"dashboard": dashboard, "api": api_base, "service_id": service_id,
                                  "date": day.isoformat(), "email": LOCAL_EMAIL, "password": LOCAL_PASSWORD})
            subprocess.run(["node", "--test", "tests/dashboard.test.mjs"], cwd=DASHBOARD,
                           env={**web_env, "SOLAR_ADMIN_FIXTURE": fixture}, check=True)
            if preview:
                print(f"Preview available at {dashboard}/login", flush=True)
                try:
                    input("Press Enter to close the local preview. ")
                except EOFError:
                    process.wait()
        finally:
            if process and process.poll() is None:
                if os.name == "nt":
                    subprocess.run(["taskkill", "/PID", str(process.pid), "/T", "/F"], capture_output=True)
                else:
                    process.terminate()
                process.wait(timeout=12)
            server.should_exit = True
            api_thread.join(timeout=12)


if __name__ == "__main__":
    run()

