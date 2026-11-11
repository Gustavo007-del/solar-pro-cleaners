import re
from uuid import UUID

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core.exceptions import AppError
from app.modules.admins.audit import AccountReason, record_audit
from app.modules.admins.permissions import AdminRole, Permission, enforce_permission
from app.modules.admins.reporting_dates import business_zone, date_filters
from app.modules.admins.sessions import AdminContext, lock_authorized_admin
from app.modules.bookings.metrics import status_counts
from app.modules.bookings.models import Booking
from app.modules.bookings.repository import page_bookings
from app.modules.bookings.schemas import BookingListItem, BookingListQuery
from app.modules.customers.admin_schemas import AdminCustomerCard, AdminCustomerDetails, AdminCustomerQuery, AdminCustomerUpdate, CustomerDetailQuery
from app.modules.customers.models import Customer
from app.modules.customers.schemas import CustomerProfile
from app.modules.customers.service import lock_customer_for_management, set_locked_customer_active
from app.modules.locations.address_schemas import SavedAddressDetails
from app.modules.locations.models import CustomerAddress
from app.schemas.common import AdminPage


def _get_customer(db: Session, customer_id: UUID) -> Customer:
    customer = db.get(Customer, customer_id)
    if customer is None:
        raise AppError(404, "customer_not_found", "The requested customer was not found.")
    return customer


def list_customers(db: Session, query: AdminCustomerQuery) -> AdminPage[AdminCustomerCard]:
    filters = []
    if query.is_active is not None:
        filters.append(Customer.is_active == query.is_active)
    if query.registered_from or query.registered_to:
        filters.extend(date_filters(Customer.created_at, query.registered_from, query.registered_to, business_zone(db)))
    if query.search:
        matches = [func.lower(Customer.full_name).startswith(query.search.lower(), autoescape=True)]
        if re.fullmatch(r"[+0-9 ()-]+", query.search):
            digits = re.sub(r"[^0-9]", "", query.search)
            if digits:
                prefixes = {"+" + digits} if query.search.startswith("+") else {"+91" + digits, "+" + digits}
                matches.extend(
                    column.startswith(prefix, autoescape=True)
                    for column in (Customer.phone_number, Customer.alternate_phone_number) for prefix in prefixes
                )
        filters.append(or_(*matches))
    order = {
        "newest": (Customer.created_at.desc(), Customer.id.desc()),
        "oldest": (Customer.created_at, Customer.id),
        "name": (func.lower(Customer.full_name), Customer.id),
    }[query.sort]
    total = db.scalar(select(func.count()).select_from(Customer).where(*filters)) or 0
    selected = (
        select(Customer.id).where(*filters).order_by(*order)
        .offset(query.offset).limit(query.page_size).cte("selected_customers")
    )
    activity = (
        select(Booking.customer_id, func.count().label("total"), func.max(Booking.created_at).label("last_booking_at"))
        .join(selected, selected.c.id == Booking.customer_id).group_by(Booking.customer_id).subquery()
    )
    rows = db.execute(
        select(Customer, activity.c.total, activity.c.last_booking_at)
        .select_from(Customer)
        .join(selected, selected.c.id == Customer.id)
        .outerjoin(activity, activity.c.customer_id == Customer.id)
        .order_by(*order)
    )
    return AdminPage[AdminCustomerCard](
        items=[
            AdminCustomerCard(**CustomerProfile.model_validate(customer).model_dump(), total_bookings=count or 0, last_booking_at=last)
            for customer, count, last in rows
        ],
        page=query.page, page_size=query.page_size, total=total,
    )


def customer_history(db: Session, customer_id: UUID, query: BookingListQuery) -> AdminPage[BookingListItem]:
    _get_customer(db, customer_id)
    page = page_bookings(db, query, customer_id=customer_id)
    return AdminPage[BookingListItem](**page.model_dump())


def read_customer(
    db: Session, customer_id: UUID, query: CustomerDetailQuery, *, show_coordinates: bool,
) -> AdminCustomerDetails:
    customer = _get_customer(db, customer_id)
    owned = CustomerAddress.customer_id == customer_id
    count = db.scalar(select(func.count()).select_from(CustomerAddress).where(owned)) or 0
    addresses = db.scalars(
        select(CustomerAddress).where(owned)
        .order_by(CustomerAddress.is_default.desc(), CustomerAddress.created_at.desc(), CustomerAddress.id.desc())
        .offset((query.address_page - 1) * query.address_page_size).limit(query.address_page_size)
    )
    items = [SavedAddressDetails.model_validate(row) for row in addresses]
    if not show_coordinates:
        items = [item.model_copy(update={"latitude": None, "longitude": None}) for item in items]
    counts = status_counts(db, Booking.customer_id == customer_id)
    recent = page_bookings(db, BookingListQuery(page_size=5), customer_id=customer_id).items
    return AdminCustomerDetails(
        customer=CustomerProfile.model_validate(customer),
        saved_addresses=AdminPage[SavedAddressDetails](
            items=items, total=count, page=query.address_page, page_size=query.address_page_size,
        ),
        total_bookings=sum(counts.values()), booking_status_counts=counts, recent_bookings=recent,
    )


def _change_active(db: Session, customer: Customer, active: bool, actor_id: UUID, reason: AccountReason | None) -> None:
    if customer.is_active != active:
        set_locked_customer_active(db, customer, active)
        record_audit(
            db, "customer_activated" if active else "customer_deactivated",
            actor_id=actor_id, resource_id=customer.id, resource_type="customer", account_reason=reason,
        )


def change_active(
    db: Session, context: AdminContext, customer_id: UUID, active: bool, reason: AccountReason | None,
) -> CustomerProfile:
    permission = Permission.CUSTOMERS_ACTIVATE if active else Permission.CUSTOMERS_DEACTIVATE
    with db.begin():
        actor = lock_authorized_admin(db, context, permission)
        customer = lock_customer_for_management(db, customer_id)
        _change_active(db, customer, active, actor.id, reason)
        db.flush()
        return CustomerProfile.model_validate(customer)


def edit_customer(db: Session, context: AdminContext, customer_id: UUID, data: AdminCustomerUpdate) -> CustomerProfile:
    with db.begin():
        actor = lock_authorized_admin(db, context, Permission.CUSTOMERS_UPDATE)
        customer = lock_customer_for_management(db, customer_id)
        changes = data.model_dump(exclude_unset=True, exclude={"is_active"})
        if data.is_active is not None:
            permission = Permission.CUSTOMERS_ACTIVATE if data.is_active else Permission.CUSTOMERS_DEACTIVATE
            enforce_permission(AdminRole(actor.role), permission)

        phone = changes.get("phone_number")
        if phone is not None and phone != customer.phone_number:
            # Serializes competing administrative changes to the same number.
            db.execute(select(func.pg_advisory_xact_lock(func.hashtextextended(phone, 7317))))
            duplicate = db.scalar(select(Customer.id).where(
                Customer.phone_number == phone, Customer.id != customer_id,
            ).limit(1))
            if duplicate is not None:
                raise AppError(409, "customer_phone_conflict", "Another customer already uses this primary phone number.")

        fields = tuple(field for field, value in changes.items() if getattr(customer, field) != value)
        for field in fields:
            setattr(customer, field, changes[field])
        if fields:
            record_audit(
                db, "customer_updated", actor_id=actor.id, resource_id=customer.id,
                resource_type="customer", customer_fields=fields,
            )
        if data.is_active is not None:
            _change_active(db, customer, data.is_active, actor.id, None)
        db.flush()
        return CustomerProfile.model_validate(customer)
