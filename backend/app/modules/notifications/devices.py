from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.core.exceptions import AppError
from app.modules.customers.credentials import utc_now
from app.modules.customers.models import Customer, CustomerInstallation
from app.modules.customers.service import CustomerContext, lock_authenticated_session
from app.modules.notifications.models import CustomerDevice
from app.modules.notifications.schemas import DeviceRegistration, DeviceResponse


def eligible_devices():
    device = CustomerDevice
    return (
        device.is_active.is_(True), device.notification_enabled.is_(True), device.expo_push_token.is_not(None),
        select(Customer.id).where(Customer.id == device.customer_id, Customer.is_active.is_(True)).exists(),
        select(CustomerInstallation.id).where(
            CustomerInstallation.id == device.installation_id, CustomerInstallation.is_active.is_(True),
            CustomerInstallation.revoked_at.is_(None),
        ).exists(),
    )


def register(db: Session, customer: CustomerContext, data: DeviceRegistration) -> DeviceResponse:
    with db.begin():
        owner, session, now = lock_authenticated_session(db, customer)
        # Serialize token transfers and installations before touching device rows.
        db.execute(select(func.pg_advisory_xact_lock(41001301)))
        current = db.scalar(select(CustomerDevice).where(CustomerDevice.installation_id == session.installation_id).with_for_update())
        db.execute(update(CustomerDevice).where(
            CustomerDevice.expo_push_token == data.expo_push_token,
            CustomerDevice.installation_id != session.installation_id,
        ).values(expo_push_token=None, is_active=False, revision=CustomerDevice.revision + 1))
        if current is None:
            current = CustomerDevice(
                customer_id=owner.id, installation_id=session.installation_id, revision=1,
            )
            db.add(current)
        elif current.expo_push_token != data.expo_push_token or not current.is_active or not current.notification_enabled:
            current.revision += 1
        for field, value in data.model_dump().items():
            setattr(current, field, value)
        current.is_active = current.notification_enabled = True
        current.last_registered_at = current.last_seen_at = now
        db.flush()
        return DeviceResponse.model_validate(current)


def set_preference(db: Session, customer: CustomerContext, enabled: bool, device_id=None) -> None:
    with db.begin():
        owner, session, _ = lock_authenticated_session(db, customer)
        db.execute(select(func.pg_advisory_xact_lock(41001301)))
        device = CustomerDevice
        criteria = device.id == device_id if device_id else device.installation_id == session.installation_id
        current = db.scalar(select(device).where(criteria, device.customer_id == owner.id).with_for_update())
        if current is None:
            if device_id or enabled:
                raise AppError(404, "notification_device_not_found", "Register the device first.")
            return
        if enabled and current.expo_push_token is None:
            raise AppError(409, "notification_token_required", "Register the device again.")
        if current.notification_enabled != enabled or current.is_active != enabled:
            current.revision += 1
        current.is_active = current.notification_enabled = enabled
        current.last_seen_at = utc_now()
