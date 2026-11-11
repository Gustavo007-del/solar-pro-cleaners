from fastapi import APIRouter, Depends, Response, status

from app.api.rate_limits import RATE_LIMITED, rate_limit
from app.api.dependencies import AppSettings, DatabaseSession
from app.modules.customers.dependencies import AuthenticatedCustomer
from app.modules.customers.schemas import (
    CustomerAccount, CustomerAuthentication, CustomerLogin, CustomerProfile,
    CustomerProfileUpdate, CustomerRegister, LogoutResponse, RefreshRequest,
)
from app.modules.customers.service import (
    login_customer, logout_customer, register_customer, rotate_refresh_token, update_customer,
)
from app.schemas.common import ErrorResponse


def prevent_caching(response: Response) -> None:
    response.headers["Cache-Control"] = "no-store"


router = APIRouter(
    prefix="/customers",
    tags=["customers"],
    dependencies=[Depends(prevent_caching)],
    responses={
        401: {"model": ErrorResponse, "description": "Customer authentication failed."},
        503: {"model": ErrorResponse, "description": "A required service is unavailable."},
    },
)


@router.post(
    "/register", status_code=status.HTTP_201_CREATED, summary="Register a customer installation",
    dependencies=[rate_limit("customer_register")],
    responses={**RATE_LIMITED, 409: {"model": ErrorResponse, "description": "Use installation login to restore a session."}},
)
def register(data: CustomerRegister, db: DatabaseSession, settings: AppSettings) -> CustomerAuthentication:
    return register_customer(db, settings, data)


@router.post("/auth/login", dependencies=[rate_limit("customer_login")], responses=RATE_LIMITED, summary="Restore a session using an installation credential")
def login(data: CustomerLogin, db: DatabaseSession, settings: AppSettings) -> CustomerAuthentication:
    return login_customer(db, settings, data)


@router.post("/auth/refresh", dependencies=[rate_limit("customer_refresh")], responses=RATE_LIMITED, summary="Rotate a customer refresh token")
def refresh(data: RefreshRequest, db: DatabaseSession, settings: AppSettings) -> CustomerAuthentication:
    return rotate_refresh_token(db, settings, data)


@router.post("/auth/logout", summary="Revoke the current customer session")
def logout(db: DatabaseSession, customer: AuthenticatedCustomer) -> LogoutResponse:
    logout_customer(db, customer)
    return LogoutResponse()


@router.post("/auth/logout-all", summary="Revoke all sessions for the authenticated customer")
def logout_all(db: DatabaseSession, customer: AuthenticatedCustomer) -> LogoutResponse:
    logout_customer(db, customer, all_devices=True)
    return LogoutResponse()


@router.get("/me", summary="Read the authenticated customer's profile")
def get_profile(customer: AuthenticatedCustomer) -> CustomerProfile:
    return customer.profile


@router.patch("/me", dependencies=[rate_limit("customer_update")], responses=RATE_LIMITED, summary="Update the authenticated customer's contact details")
def update_profile(data: CustomerProfileUpdate, db: DatabaseSession, customer: AuthenticatedCustomer) -> CustomerProfile:
    return update_customer(db, customer, data)


@router.get("/me/account", summary="Read the authenticated customer's account status")
def get_account(customer: AuthenticatedCustomer) -> CustomerAccount:
    return CustomerAccount.model_validate(customer.profile, from_attributes=True)
