from typing import Literal

from pydantic import BaseModel


class HealthResponse(BaseModel):
    status: Literal["ok"]


class ApplicationInfo(BaseModel):
    name: str
    api_version: str
