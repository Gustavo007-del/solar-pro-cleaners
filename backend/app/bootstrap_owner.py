"""Provision the first owner from private deployment environment variables."""

import os
import sys

from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.core.database import create_database
from app.core.exceptions import AppError
from app.modules.admins.audit import record_audit
from app.modules.admins.models import AdminUser
from app.modules.admins.passwords import hash_password, validate_password
from app.modules.admins.permissions import AdminRole
from app.modules.admins.schemas import AdminEmail, Password
from app.modules.customers.schemas import FullName
from app.schemas.catalogue import ConfigInput


class OwnerInput(ConfigInput):
    full_name: FullName
    email: AdminEmail
    password: Password


def provision_owner(db: Session, settings: Settings) -> bool:
    with db.begin():
        if db.scalar(select(AdminUser.id).where(AdminUser.role == AdminRole.OWNER)) is not None:
            return False
        data = OwnerInput.model_validate({
            "full_name": os.environ.get("ADMIN_BOOTSTRAP_NAME"),
            "email": os.environ.get("ADMIN_BOOTSTRAP_EMAIL"),
            "password": os.environ.get("ADMIN_BOOTSTRAP_PASSWORD"),
        })
        validate_password(data.password, settings, email=data.email)
        statement = insert(AdminUser).values(
            full_name=data.full_name, email=data.email, password_hash=hash_password(data.password),
            role=AdminRole.OWNER.value, is_active=True,
        ).on_conflict_do_nothing().returning(AdminUser.id)
        owner_id = db.scalar(statement)
        if owner_id is None:
            if db.scalar(select(AdminUser.id).where(AdminUser.role == AdminRole.OWNER)) is not None:
                return False
            raise AppError(409, "owner_email_conflict", "The bootstrap email is already assigned.")
        record_audit(db, "owner_provisioned", resource_id=owner_id, new_role=AdminRole.OWNER)
        return True


def main() -> None:
    try:
        settings = get_settings()
        database = create_database(settings)
        try:
            with database.sessions() as db:
                created = provision_owner(db, settings)
        finally:
            database.engine.dispose()
    except (ValidationError, AppError):
        sys.exit("Owner provisioning credentials are invalid or conflict with an existing account.")
    except (RuntimeError, SQLAlchemyError):
        sys.exit("Owner provisioning could not access the configured database.")
    print("Initial owner created." if created else "An initial owner already exists.")


if __name__ == "__main__":
    main()
