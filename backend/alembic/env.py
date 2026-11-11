import logging

from alembic import context
from sqlalchemy import create_engine
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.pool import NullPool

from app.core.config import get_settings
from app.core.logging import configure_logging
from app.models.registry import Base

settings = get_settings()
configure_logging(settings)
logger = logging.getLogger("app.migrations")
target_metadata = Base.metadata
version_table = "solar_care_alembic_version"


def include_name(name, type_, parent_names):
    # Supabase and other applications can own tables alongside this service.
    if type_ == "table":
        return parent_names["schema_qualified_table_name"] in target_metadata.tables
    return True


def run_migrations_offline() -> None:
    context.configure(
        url=settings.connection_url(migrations=True),
        target_metadata=target_metadata,
        version_table=version_table,
        include_name=include_name,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    engine = create_engine(
        settings.connection_url(migrations=True),
        poolclass=NullPool,
        connect_args={"connect_timeout": settings.db_connect_timeout_seconds},
        hide_parameters=True,
    )
    try:
        with engine.connect() as connection:
            context.configure(
                connection=connection,
                target_metadata=target_metadata,
                version_table=version_table,
                include_name=include_name,
            )
            with context.begin_transaction():
                context.run_migrations()
    except SQLAlchemyError:
        logger.error("migration_failed", extra={"event": "migration_failed"})
        raise RuntimeError("Database migration failed.") from None
    finally:
        engine.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
