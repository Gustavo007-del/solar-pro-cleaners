from collections.abc import Iterator
from typing import Annotated

from fastapi import Depends, Request
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.database import Database
from app.core.exceptions import AppError


def request_settings(request: Request) -> Settings:
    return request.app.state.settings


def database_session(request: Request) -> Iterator[Session]:
    database: Database | None = request.app.state.database
    if database is None:
        raise AppError(503, "database_unavailable", "The database is unavailable.")
    yield from database.session()


AppSettings = Annotated[Settings, Depends(request_settings)]
DatabaseSession = Annotated[Session, Depends(database_session, scope="function")]
