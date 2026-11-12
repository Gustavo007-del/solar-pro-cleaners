from dataclasses import dataclass
from datetime import datetime, timedelta
from uuid import UUID, uuid4

from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.exceptions import AppError
from app.modules.customers.credentials import (
    AccessIdentity, authentication_failed, installation_digest, issue_access_token,
    new_refresh_token, refresh_digest, signing_key, utc_now,
)
from app.modules.customers.models import Customer, CustomerInstallation, RefreshSession
from app.modules.customers.schemas import (
    CustomerAuthentication, CustomerLogin, CustomerProfile, CustomerProfileUpdate,
    CustomerRegister, CustomerTokens, RefreshRequest,
)
from app.modules.notifications.models import CustomerDevice

INSTALLATION_HASH_CONSTRAINT = "uq_customer_installations_credential_hash"


@dataclass(frozen=True)
class CustomerContext:
    identity: AccessIdentity
    profile: CustomerProfile

    @property
    def customer_id(self) -> UUID:
        return self.identity.customer_id


def _lock_customer(db: Session, customer_id: UUID) -> Customer | None:
    # Session mutations always take this lock before reading or changing session state.
    return db.scalar(select(Customer).where(Customer.id == customer_id).with_for_update())


def _require_active_customer(db: Session, customer_id: UUID) -> Customer:
    customer = _lock_customer(db, customer_id)
    if customer is None or not customer.is_active:
        raise authentication_failed()
    return customer


def _active_session(db: Session, identity: AccessIdentity, now: datetime):
    return db.execute(
        select(Customer, RefreshSession)
        .select_from(Customer)
        .join(RefreshSession, RefreshSession.customer_id == Customer.id)
        .join(CustomerInstallation, CustomerInstallation.id == RefreshSession.installation_id)
        .where(
            Customer.id == identity.customer_id,
            Customer.is_active.is_(True),
            RefreshSession.id == identity.session_id,
            RefreshSession.revoked_at.is_(None),
            RefreshSession.expires_at > now,
            CustomerInstallation.customer_id == Customer.id,
            CustomerInstallation.is_active.is_(True),
            CustomerInstallation.revoked_at.is_(None),
        )
    ).one_or_none()


def authenticate_customer(db: Session, identity: AccessIdentity) -> CustomerContext:
    with db.begin():
        active = _active_session(db, identity, utc_now())
        if active is None:
            raise authentication_failed()
        customer, _ = active
        return CustomerContext(identity, CustomerProfile.model_validate(customer))


def _issue_session(
    db: Session,
    customer: Customer,
    installation: CustomerInstallation,
    settings: Settings,
    now: datetime,
    *,
    family_id: UUID,
    expires_at: datetime,
) -> CustomerAuthentication:
    refresh_token = new_refresh_token()
    session_id = uuid4()
    db.add(RefreshSession(
        id=session_id,
        customer_id=customer.id,
        installation_id=installation.id,
        family_id=family_id,
        refresh_token_hash=refresh_digest(refresh_token),
        expires_at=expires_at,
    ))
    installation.last_used_at = now
    access_token, expires_in = issue_access_token(AccessIdentity(customer.id, session_id), settings, now, expires_at)
    return CustomerAuthentication(
        customer=CustomerProfile.model_validate(customer),
        tokens=CustomerTokens(
            access_token=access_token,
            refresh_token=refresh_token.get_secret_value(),
            expires_in=expires_in,
            refresh_expires_at=expires_at,
        ),
    )


def _start_session(
    db: Session, customer: Customer, installation: CustomerInstallation, settings: Settings
) -> CustomerAuthentication:
    now = utc_now()
    return _issue_session(
        db, customer, installation, settings, now,
        family_id=uuid4(), expires_at=now + timedelta(days=settings.refresh_token_expire_days),
    )


def register_customer(db: Session, settings: Settings, data: CustomerRegister) -> CustomerAuthentication:
    signing_key(settings)
    try:
        with db.begin():
            customer = Customer(
                full_name=data.full_name,
                phone_number=data.phone_number,
                alternate_phone_number=data.alternate_phone_number,
            )
            db.add(customer)
            db.flush()
            installation = CustomerInstallation(
                customer_id=customer.id,
                credential_hash=installation_digest(data.installation_credential),
                installation_label=data.installation_label,
            )
            db.add(installation)
            db.flush()
            return _start_session(db, customer, installation, settings)
    except IntegrityError as exc:
        if getattr(getattr(exc.orig, "diag", None), "constraint_name", None) != INSTALLATION_HASH_CONSTRAINT:
            raise
        raise AppError(409, "installation_already_registered", "Use installation login to restore a session.") from None


def login_customer(db: Session, settings: Settings, data: CustomerLogin) -> CustomerAuthentication:
    signing_key(settings)
    digest = installation_digest(data.installation_credential)
    with db.begin():
        customer_id = db.scalar(select(CustomerInstallation.customer_id).where(CustomerInstallation.credential_hash == digest))
        if customer_id is None:
            raise authentication_failed()
        customer = _require_active_customer(db, customer_id)
        installation = db.scalar(select(CustomerInstallation).where(
            CustomerInstallation.credential_hash == digest,
            CustomerInstallation.customer_id == customer.id,
            CustomerInstallation.is_active.is_(True),
            CustomerInstallation.revoked_at.is_(None),
        ))
        if installation is None:
            raise authentication_failed()
        return _start_session(db, customer, installation, settings)


def _revoke_sessions(db: Session, customer_id: UUID, now: datetime, *, family_id: UUID | None = None) -> None:
    statement = update(RefreshSession).where(RefreshSession.customer_id == customer_id, RefreshSession.revoked_at.is_(None))
    if family_id is not None:
        statement = statement.where(RefreshSession.family_id == family_id)
    db.execute(statement.values(revoked_at=now))


def rotate_refresh_token(db: Session, settings: Settings, data: RefreshRequest) -> CustomerAuthentication:
    signing_key(settings)
    digest = refresh_digest(data.refresh_token)
    with db.begin():
        customer_id = db.scalar(select(RefreshSession.customer_id).where(RefreshSession.refresh_token_hash == digest))
        if customer_id is None:
            raise authentication_failed()
        customer = _require_active_customer(db, customer_id)
        previous = db.scalar(select(RefreshSession).where(
            RefreshSession.customer_id == customer.id, RefreshSession.refresh_token_hash == digest,
        ))
        if previous is None:
            raise authentication_failed()

        now = utc_now()
        if previous.rotated_at is not None:
            _revoke_sessions(db, customer.id, now, family_id=previous.family_id)
        else:
            if previous.revoked_at is not None or int(previous.expires_at.timestamp()) <= int(now.timestamp()):
                raise authentication_failed()
            installation = db.scalar(select(CustomerInstallation).where(
                CustomerInstallation.id == previous.installation_id,
                CustomerInstallation.customer_id == customer.id,
                CustomerInstallation.is_active.is_(True),
                CustomerInstallation.revoked_at.is_(None),
            ))
            if installation is None:
                raise authentication_failed()

            previous.last_used_at = now
            previous.revoked_at = now
            previous.rotated_at = now
            db.flush()
            return _issue_session(
                db, customer, installation, settings, now,
                family_id=previous.family_id, expires_at=previous.expires_at,
            )

    # The replay revocation must commit before returning an authentication error.
    raise authentication_failed()


def lock_authenticated_session(
    db: Session, context: CustomerContext
) -> tuple[Customer, RefreshSession, datetime]:
    _require_active_customer(db, context.customer_id)
    now = utc_now()
    active = _active_session(db, context.identity, now)
    if active is None:
        raise authentication_failed()
    customer, session = active
    return customer, session, now


def logout_customer(db: Session, context: CustomerContext, *, all_devices: bool = False) -> None:
    with db.begin():
        _, session, now = lock_authenticated_session(db, context)
        if all_devices:
            _revoke_sessions(db, context.customer_id, now)
        else:
            session.revoked_at = now
        devices = update(CustomerDevice).where(CustomerDevice.customer_id == context.customer_id)
        if not all_devices:
            devices = devices.where(CustomerDevice.installation_id == session.installation_id)
        db.execute(devices.values(is_active=False, revision=CustomerDevice.revision + 1))


def update_customer(db: Session, context: CustomerContext, data: CustomerProfileUpdate) -> CustomerProfile:
    with db.begin():
        customer, _, _ = lock_authenticated_session(db, context)
        for field, value in data.model_dump(exclude_unset=True).items():
            setattr(customer, field, value)
        db.flush()
        return CustomerProfile.model_validate(customer)


def lock_customer_for_management(db: Session, customer_id: UUID) -> Customer:
    customer = _lock_customer(db, customer_id)
    if customer is None:
        raise AppError(404, "customer_not_found", "The requested customer was not found.")
    return customer


def set_locked_customer_active(db: Session, customer: Customer, active: bool) -> None:
    customer.is_active = active
    if not active:
        _revoke_sessions(db, customer.id, utc_now())
        db.execute(update(CustomerDevice).where(CustomerDevice.customer_id == customer.id).values(
            is_active=False, revision=CustomerDevice.revision + 1,
        ))


def deactivate_customer(db: Session, customer_id: UUID) -> None:
    with db.begin():
        set_locked_customer_active(db, lock_customer_for_management(db, customer_id), False)
