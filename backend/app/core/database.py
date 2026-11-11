from collections.abc import Iterator
from dataclasses import dataclass

from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import NullPool

from app.core.config import Settings


@dataclass(frozen=True)
class Database:
    engine: Engine
    sessions: sessionmaker[Session]

    def session(self) -> Iterator[Session]:
        with self.sessions() as session:
            yield session


def create_database(settings: Settings) -> Database:
    url = settings.connection_url()
    connect_args = {"connect_timeout": settings.db_connect_timeout_seconds}

    if settings.db_connection_mode == "transaction":
        engine = create_engine(
            url,
            poolclass=NullPool,
            connect_args={**connect_args, "prepare_threshold": None},
            hide_parameters=True,
        )
    else:
        engine = create_engine(
            url,
            pool_size=settings.db_pool_size,
            max_overflow=settings.db_max_overflow,
            pool_timeout=settings.db_pool_timeout_seconds,
            pool_recycle=settings.db_pool_recycle_seconds,
            pool_pre_ping=True,
            connect_args=connect_args,
            hide_parameters=True,
        )

    sessions = sessionmaker(engine, expire_on_commit=False, info={"business_timezone": settings.business_timezone})
    return Database(engine=engine, sessions=sessions)
