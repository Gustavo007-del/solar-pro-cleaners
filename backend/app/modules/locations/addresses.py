from uuid import UUID

from pydantic import ValidationError
from sqlalchemy.orm import Session

from app.core.exceptions import AppError
from app.modules.customers.service import CustomerContext, lock_authenticated_session
from app.modules.locations.address_schemas import (
    AddressInput, AddressPatch, SavedAddressCreate, SavedAddressDetails, SavedAddressUpdate,
)
from app.modules.locations.models import CustomerAddress
from app.modules.locations.repository import clear_default, get_owned_address

ADDRESS_TEXT_FIELDS = {
    "address_line", "address_line_2", "locality", "city", "district", "state", "postal_code", "landmark",
}


def merge_address(row: CustomerAddress, patch: AddressPatch | None) -> AddressInput:
    original = {field: getattr(row, field) for field in AddressInput.model_fields}
    changes = patch.model_dump(exclude_unset=True, include=set(original)) if patch is not None else {}
    merged = {**original, **changes}
    if (
        "location_source" not in changes and original["location_source"] == "gps"
        and any(key in changes and changes[key] != original[key] for key in ADDRESS_TEXT_FIELDS)
    ):
        merged["location_source"] = "gps_with_manual_address"
    try:
        return AddressInput.model_validate(merged)
    except ValidationError:
        raise AppError(422, "invalid_address", "Check the address, coordinate pair, and location source.") from None


def resolve_saved_address(
    db: Session, customer_id: UUID, address_id: UUID, overrides: AddressPatch | None,
) -> AddressInput:
    return merge_address(get_owned_address(db, customer_id, address_id), overrides)


def create_address(db: Session, context: CustomerContext, data: SavedAddressCreate) -> SavedAddressDetails:
    with db.begin():
        lock_authenticated_session(db, context)
        if data.is_default:
            clear_default(db, context.customer_id)
        row = CustomerAddress(customer_id=context.customer_id, **data.model_dump())
        db.add(row)
        db.flush()
        return SavedAddressDetails.model_validate(row)


def update_address(
    db: Session, context: CustomerContext, address_id: UUID, data: SavedAddressUpdate,
) -> SavedAddressDetails:
    with db.begin():
        lock_authenticated_session(db, context)
        row = get_owned_address(db, context.customer_id, address_id)
        address = merge_address(row, data)
        if data.is_default:
            clear_default(db, context.customer_id, except_id=row.id)
        for name, value in address.model_dump().items():
            setattr(row, name, value)
        for name in ("label", "is_default"):
            if name in data.model_fields_set:
                setattr(row, name, getattr(data, name))
        db.flush()
        return SavedAddressDetails.model_validate(row)


def delete_address(db: Session, context: CustomerContext, address_id: UUID) -> None:
    with db.begin():
        lock_authenticated_session(db, context)
        db.delete(get_owned_address(db, context.customer_id, address_id))


def set_default_address(db: Session, context: CustomerContext, address_id: UUID) -> SavedAddressDetails:
    with db.begin():
        lock_authenticated_session(db, context)
        row = get_owned_address(db, context.customer_id, address_id)
        clear_default(db, context.customer_id, except_id=row.id)
        row.is_default = True
        db.flush()
        return SavedAddressDetails.model_validate(row)
