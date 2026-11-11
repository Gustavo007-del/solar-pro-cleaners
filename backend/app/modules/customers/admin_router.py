from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query

from app.api.dependencies import DatabaseSession
from app.api.rate_limits import RATE_LIMITED, rate_limit
from app.modules.admins.dependencies import require_permission
from app.modules.admins.permissions import Permission
from app.modules.admins.responses import prevent_caching
from app.modules.admins.sessions import AdminContext
from app.modules.bookings.schemas import BookingListItem, BookingListQuery
from app.modules.customers.admin_schemas import (
    AccountStatusRequest, AdminCustomerCard, AdminCustomerDetails, AdminCustomerQuery, AdminCustomerUpdate, CustomerDetailQuery,
)
from app.modules.customers.admin_service import change_active, customer_history, edit_customer, list_customers, read_customer
from app.modules.customers.schemas import CustomerProfile
from app.schemas.common import AdminPage, ErrorResponse

router = APIRouter(
    prefix="/admin/customers", tags=["admin customers"], dependencies=[Depends(prevent_caching)],
    responses={401: {"model": ErrorResponse}, 403: {"model": ErrorResponse}, 404: {"model": ErrorResponse}},
)
Reader = Annotated[AdminContext, Depends(require_permission(Permission.CUSTOMERS_READ))]
Editor = Annotated[AdminContext, Depends(require_permission(Permission.CUSTOMERS_UPDATE))]
Activator = Annotated[AdminContext, Depends(require_permission(Permission.CUSTOMERS_ACTIVATE))]
Deactivator = Annotated[AdminContext, Depends(require_permission(Permission.CUSTOMERS_DEACTIVATE))]


@router.get("", summary="Search and list customers")
def customers(db: DatabaseSession, admin: Reader, query: Annotated[AdminCustomerQuery, Query()]) -> AdminPage[AdminCustomerCard]:
    return list_customers(db, query)


@router.get("/{customer_id}", summary="Read customer profile, saved addresses and booking summary")
def customer(
    customer_id: UUID, db: DatabaseSession, admin: Reader, query: Annotated[CustomerDetailQuery, Query()],
) -> AdminCustomerDetails:
    return read_customer(db, customer_id, query, show_coordinates=Permission.LOCATIONS_READ in admin.profile.permissions)


@router.patch(
    "/{customer_id}", summary="Update customer contact details or account state",
    dependencies=[rate_limit("admin_customer_update")],
    responses={**RATE_LIMITED, 409: {"model": ErrorResponse, "description": "The primary phone is already in use."}},
)
def edit(customer_id: UUID, data: AdminCustomerUpdate, db: DatabaseSession, admin: Editor) -> CustomerProfile:
    return edit_customer(db, admin, customer_id, data)


@router.post("/{customer_id}/activate", summary="Activate a customer account",
             dependencies=[rate_limit("admin_customer_update")], responses=RATE_LIMITED)
def activate(
    customer_id: UUID, db: DatabaseSession, admin: Activator, data: AccountStatusRequest | None = None,
) -> CustomerProfile:
    return change_active(db, admin, customer_id, True, data.reason if data else None)


@router.post("/{customer_id}/deactivate", summary="Deactivate a customer account and revoke its sessions",
             dependencies=[rate_limit("admin_customer_update")], responses=RATE_LIMITED)
def deactivate(
    customer_id: UUID, db: DatabaseSession, admin: Deactivator, data: AccountStatusRequest | None = None,
) -> CustomerProfile:
    return change_active(db, admin, customer_id, False, data.reason if data else None)


@router.get("/{customer_id}/bookings", summary="List a customer's booking history")
def bookings(
    customer_id: UUID, db: DatabaseSession, admin: Reader, query: Annotated[BookingListQuery, Query()],
) -> AdminPage[BookingListItem]:
    return customer_history(db, customer_id, query)
