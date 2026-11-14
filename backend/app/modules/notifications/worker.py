"""Run with `python -m app.modules.notifications.worker`, separately from ASGI."""

import logging
import signal
from threading import Event

from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.core.database import create_database
from app.core.logging import configure_logging
from app.models import registry as _model_registry  # Resolve foreign keys in this standalone process.
from app.modules.customers.credentials import utc_now
from app.modules.notifications.expo import ExpoClient, ExpoFailure
from app.modules.notifications.queue import (
    claim_campaigns, claim_receipts, claim_sends, recover_and_finalize, store_receipts, store_sends,
)

logger = logging.getLogger("app.modules.notifications.worker")


def run_cycle(db: Session, settings: Settings, expo: ExpoClient, stop: Event) -> None:
    count = claim_campaigns(db, utc_now(), settings.notification_claim_limit)
    if count:
        logger.info("notification_campaigns_claimed", extra={"event": "notification_campaigns_claimed", "count": count})
    if stop.is_set():
        return
    jobs = claim_sends(db, utc_now(), settings.notification_batch_size)
    if jobs:
        try:
            results = expo.send([job.message for job in jobs])
        except ExpoFailure as failure:
            logger.warning("notification_expo_send_failed", extra={"event": "notification_expo_send_failed",
                                                                   "error_code": failure.code})
            store_sends(db, settings, utc_now(), jobs, None, failure)
        else:
            store_sends(db, settings, utc_now(), jobs, results)
    if stop.is_set():
        return
    receipts = claim_receipts(db, settings, utc_now())
    if receipts:
        try:
            results = expo.receipts([job.ticket for job in receipts])
        except ExpoFailure as failure:
            logger.warning("notification_expo_receipt_failed", extra={"event": "notification_expo_receipt_failed",
                                                                      "error_code": failure.code})
            results = {}
        store_receipts(db, settings, utc_now(), receipts, results)
    count = recover_and_finalize(db, settings, utc_now())
    if count:
        logger.info("notification_executions_finished", extra={"event": "notification_executions_finished", "count": count})


def main() -> None:
    settings = get_settings()
    configure_logging(settings)
    database, expo, stop = create_database(settings), ExpoClient(settings), Event()

    def stop_worker(*_) -> None:
        stop.set()

    signal.signal(signal.SIGTERM, stop_worker)
    signal.signal(signal.SIGINT, stop_worker)
    logger.info("notification_worker_started", extra={"event": "notification_worker_started"})
    delay = settings.notification_poll_seconds
    try:
        while not stop.is_set():
            try:
                with database.sessions() as db:
                    run_cycle(db, settings, expo, stop)
                delay = settings.notification_poll_seconds
            except SQLAlchemyError as error:
                original = getattr(error, "orig", error)
                logger.error("notification_database_issue", extra={
                    "event": "notification_database_issue",
                    "error_code": getattr(original, "sqlstate", None) or type(original).__name__,
                })
                delay = min(300, max(5, delay * 2))
            except Exception:
                logger.error("notification_cycle_failed", extra={"event": "notification_cycle_failed"})
                delay = min(300, max(5, delay * 2))
            stop.wait(delay)
    finally:
        database.engine.dispose()
        logger.info("notification_worker_stopped", extra={"event": "notification_worker_stopped"})


if __name__ == "__main__":
    main()
