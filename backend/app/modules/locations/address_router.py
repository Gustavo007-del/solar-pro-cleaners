from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Query, Response, status

from app.api.dependencies import DatabaseSession
from app.modules.customers.dependencies import AuthenticatedCustomer
from app.modules.locations.address_schemas import (
    SavedAddressCreate, SavedAddressDetails, SavedAddressListItem, SavedAddressUpdate,
)
from app.modules.locations.addresses import create_address, delete_address, set_default_address, update_address
from app.modules.locations.repository import get_owned_address, list_owned_addresses
from app.schemas.catalogue import PublicPageQuery
from app.schemas.common import ErrorResponse, Page

router = APIRouter(
    prefix="/customers/me/addresses", tags=["saved addresses"],
    responses={401: {"model": ErrorResponse}, 404: {"model": ErrorResponse}, 503: {"model": ErrorResponse}},
)


@router.post("", status_code=status.HTTP_201_CREATED, summary="Save an address for the current customer")
def create(data: SavedAddressCreate, db: DatabaseSession, customer: AuthenticatedCustomer, response: Response) -> SavedAddressDetails:
    response.headers["Cache-Control"] = "no-store"
    return create_address(db, customer, data)


@router.get("", summary="List the current customer's saved addresses")
def addresses(
    db: DatabaseSession, customer: AuthenticatedCustomer, response: Response,
    query: Annotated[PublicPageQuery, Query()],
) -> Page[SavedAddressListItem]:
    response.headers["Cache-Control"] = "no-store"
    return list_owned_addresses(db, customer.customer_id, query)


@router.get("/{address_id}", summary="Read an owned saved address")
def details(
    address_id: UUID, db: DatabaseSession, customer: AuthenticatedCustomer, response: Response,
) -> SavedAddressDetails:
    response.headers["Cache-Control"] = "no-store"
    return SavedAddressDetails.model_validate(get_owned_address(db, customer.customer_id, address_id))


@router.patch("/{address_id}", summary="Edit an owned saved address")
def update(
    address_id: UUID, data: SavedAddressUpdate, db: DatabaseSession, customer: AuthenticatedCustomer, response: Response,
) -> SavedAddressDetails:
    response.headers["Cache-Control"] = "no-store"
    return update_address(db, customer, address_id, data)


@router.delete("/{address_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete an owned saved address")
def delete(address_id: UUID, db: DatabaseSession, customer: AuthenticatedCustomer) -> Response:
    delete_address(db, customer, address_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT, headers={"Cache-Control": "no-store"})


@router.put("/{address_id}/default", summary="Set the default saved address")
def default(
    address_id: UUID, db: DatabaseSession, customer: AuthenticatedCustomer, response: Response,
) -> SavedAddressDetails:
    response.headers["Cache-Control"] = "no-store"
    return set_default_address(db, customer, address_id)
