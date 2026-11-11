from typing import Annotated

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.api.dependencies import AppSettings, DatabaseSession
from app.modules.customers.credentials import authentication_failed, decode_access_token
from app.modules.customers.service import CustomerContext, authenticate_customer

customer_bearer = HTTPBearer(
    scheme_name="CustomerAccessToken", bearerFormat="JWT", auto_error=False,
    description="Customer access token. Admin authentication uses a separate scheme.",
)


def current_customer(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(customer_bearer)],
    db: DatabaseSession,
    settings: AppSettings,
) -> CustomerContext:
    if credentials is None:
        raise authentication_failed()
    identity = decode_access_token(credentials.credentials, settings)
    return authenticate_customer(db, identity)


AuthenticatedCustomer = Annotated[CustomerContext, Depends(current_customer)]
