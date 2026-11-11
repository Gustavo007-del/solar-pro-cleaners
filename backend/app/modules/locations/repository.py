from uuid import UUID

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.core.exceptions import AppError
from app.modules.locations.address_schemas import SavedAddressListItem
from app.modules.locations.models import CustomerAddress
from app.schemas.common import Page, PaginationParams


def get_owned_address(db: Session, customer_id: UUID, address_id: UUID) -> CustomerAddress:
    row = db.scalar(select(CustomerAddress).where(
        CustomerAddress.customer_id == customer_id, CustomerAddress.id == address_id,
    ))
    if row is None:
        raise AppError(404, "address_not_found", "The requested saved address was not found.")
    return row


def clear_default(db: Session, customer_id: UUID, *, except_id: UUID | None = None) -> None:
    statement = update(CustomerAddress).where(
        CustomerAddress.customer_id == customer_id, CustomerAddress.is_default.is_(True),
    )
    if except_id is not None:
        statement = statement.where(CustomerAddress.id != except_id)
    db.execute(statement.values(is_default=False))


def list_owned_addresses(db: Session, customer_id: UUID, query: PaginationParams) -> Page[SavedAddressListItem]:
    owned = CustomerAddress.customer_id == customer_id
    total = db.scalar(select(func.count()).select_from(CustomerAddress).where(owned)) or 0
    columns = [getattr(CustomerAddress, field) for field in SavedAddressListItem.model_fields]
    rows = db.execute(
        select(*columns).where(owned)
        .order_by(CustomerAddress.is_default.desc(), CustomerAddress.created_at.desc(), CustomerAddress.id.desc())
        .offset(query.offset).limit(query.page_size)
    ).mappings()
    return Page[SavedAddressListItem](
        items=[SavedAddressListItem.model_validate(row) for row in rows],
        page=query.page, page_size=query.page_size, total=total,
    )
