from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Response
from pydantic import AwareDatetime, Field
from sqlalchemy import func, or_, select

from app.api.dependencies import AppSettings, DatabaseSession
from app.api.rate_limits import rate_limit
from app.core.exceptions import AppError
from app.modules.admins.audit import record_audit
from app.modules.admins.dependencies import AdminRoute, require_permission
from app.modules.admins.permissions import Permission
from app.modules.admins.responses import prevent_caching
from app.modules.admins.sessions import AdminContext, lock_authorized_admin
from app.modules.customers.dependencies import AuthenticatedCustomer
from app.modules.notifications.campaigns import campaign_record, change_campaign, save_campaign
from app.modules.notifications.devices import eligible_devices, register, set_preference
from app.modules.notifications.models import (
    CustomerDevice, NotificationCampaign as Campaign, NotificationDelivery as Delivery, NotificationExecution as Execution,
)
from app.modules.notifications.schemas import (
    AdminDeviceResponse, CampaignAction, CampaignContent, CampaignCreate, CampaignResponse, CampaignStatus, DeliveryResponse,
    DevicePreferences, DeviceRegistration, DeviceResponse, ExecutionResponse,
)
from app.schemas.catalogue import PublicPageQuery
from app.schemas.common import AdminPage, Page

customer_router = APIRouter(prefix="/customers/me", dependencies=[Depends(prevent_caching)], tags=["Customer notifications"])
admin_router = APIRouter(
    prefix="/admin/notifications", route_class=AdminRoute, dependencies=[Depends(prevent_caching)],
    tags=["Admin notifications"],
)
Reader = Annotated[AdminContext, Depends(require_permission(Permission.NOTIFICATIONS_READ))]
Manager = Annotated[AdminContext, Depends(require_permission(Permission.NOTIFICATIONS_MANAGE))]


def paged(db, query, pagination, schema, page=AdminPage):
    total = db.scalar(select(func.count()).select_from(query.order_by(None).subquery()))
    items = db.scalars(query.offset(pagination.offset).limit(pagination.page_size)).all()
    return page[schema](items=items, total=total, page=pagination.page, page_size=pagination.page_size)


@customer_router.post("/devices", response_model=DeviceResponse, dependencies=[rate_limit("notification_device")])
def register_device(db: DatabaseSession, customer: AuthenticatedCustomer, body: DeviceRegistration):
    return register(db, customer, body)


@customer_router.get("/devices", response_model=Page[DeviceResponse])
def list_devices(db: DatabaseSession, customer: AuthenticatedCustomer, query: Annotated[PublicPageQuery, Query()]):
    return paged(db, select(CustomerDevice).where(CustomerDevice.customer_id == customer.customer_id)
                 .order_by(CustomerDevice.last_seen_at.desc(), CustomerDevice.id), query, DeviceResponse, Page)


@customer_router.delete("/devices/{device_id}", status_code=204)
def remove_device(db: DatabaseSession, customer: AuthenticatedCustomer, device_id: UUID):
    set_preference(db, customer, False, device_id)
    return Response(status_code=204)


@customer_router.patch("/notification-preferences", status_code=204)
def change_preference(db: DatabaseSession, customer: AuthenticatedCustomer, body: DevicePreferences):
    set_preference(db, customer, body.enabled)
    return Response(status_code=204)


class CampaignQuery(PublicPageQuery):
    search: str | None = Field(default=None, max_length=100)
    status: CampaignStatus | None = None
    created_from: AwareDatetime | None = None
    created_to: AwareDatetime | None = None
    sort: Literal["newest", "oldest", "next_run"] = "newest"


class DeliveryQuery(PublicPageQuery):
    status: Literal["queued", "sending", "submitted", "provider_accepted", "invalid_device",
                    "failed", "skipped", "cancelled"] | None = None
    execution_id: UUID | None = None


class DeviceQuery(PublicPageQuery):
    customer_id: UUID | None = None
    platform: Literal["android", "ios"] | None = None


@admin_router.get("/devices", response_model=AdminPage[AdminDeviceResponse])
def admin_devices(db: DatabaseSession, admin: Reader, filters: Annotated[DeviceQuery, Query()]):
    query = select(CustomerDevice)
    if filters.customer_id:
        query = query.where(CustomerDevice.customer_id == filters.customer_id)
    if filters.platform:
        query = query.where(CustomerDevice.platform == filters.platform)
    return paged(db, query.order_by(CustomerDevice.last_seen_at.desc(), CustomerDevice.id), filters, AdminDeviceResponse)


@admin_router.get("/campaigns", response_model=AdminPage[CampaignResponse])
def list_campaigns(db: DatabaseSession, admin: Reader, filters: Annotated[CampaignQuery, Query()]):
    query = select(Campaign)
    if filters.search:
        query = query.where(or_(Campaign.title.icontains(filters.search, autoescape=True),
                                Campaign.message.icontains(filters.search, autoescape=True)))
    if filters.status:
        query = query.where(Campaign.status == filters.status)
    if filters.created_from:
        query = query.where(Campaign.created_at >= filters.created_from)
    if filters.created_to:
        query = query.where(Campaign.created_at < filters.created_to)
    ordering = {"newest": Campaign.created_at.desc(), "oldest": Campaign.created_at.asc(),
                "next_run": Campaign.next_run_at.asc().nulls_last()}
    return paged(db, query.order_by(ordering[filters.sort], Campaign.id), filters, CampaignResponse)


@admin_router.get("/stats", response_model=dict[str, int])
def stats(db: DatabaseSession, admin: Reader):
    campaign_counts = dict(db.execute(select(Campaign.status, func.count()).group_by(Campaign.status)).all())
    delivery_counts = dict(db.execute(select(Delivery.status, func.count()).group_by(Delivery.status)).all())
    submissions, failures = db.execute(select(
        func.count().filter(Delivery.submission_accepted.is_(True)),
        func.count().filter(Delivery.submission_accepted.is_(False), Delivery.status.in_(("failed", "invalid_device"))),
    )).one()
    return {
        "campaigns": sum(campaign_counts.values()), "scheduled": campaign_counts.get("scheduled", 0),
        "active": campaign_counts.get("active", 0), "paused": campaign_counts.get("paused", 0),
        "completed": campaign_counts.get("completed", 0), "submissions": submissions, "failed_submissions": failures,
        "provider_accepted": delivery_counts.get("provider_accepted", 0),
        "failed_deliveries": delivery_counts.get("failed", 0) + delivery_counts.get("invalid_device", 0),
        "eligible_devices": db.scalar(select(func.count()).select_from(CustomerDevice).where(*eligible_devices())),
    }


@admin_router.post("/campaigns", response_model=CampaignResponse, status_code=201)
def create_campaign(db: DatabaseSession, admin: Manager, settings: AppSettings, body: CampaignCreate):
    return save_campaign(db, admin, settings, body)


@admin_router.get("/campaigns/{campaign_id}", response_model=CampaignResponse)
def detail(db: DatabaseSession, admin: Reader, campaign_id: UUID):
    return campaign_record(db, campaign_id)


@admin_router.put("/campaigns/{campaign_id}", response_model=CampaignResponse)
def edit(db: DatabaseSession, admin: Manager, settings: AppSettings, campaign_id: UUID, body: CampaignContent):
    return save_campaign(db, admin, settings, body, campaign_id)


@admin_router.delete("/campaigns/{campaign_id}", status_code=204)
def delete(db: DatabaseSession, admin: Manager, campaign_id: UUID):
    with db.begin():
        actor = lock_authorized_admin(db, admin, Permission.NOTIFICATIONS_MANAGE)
        record = campaign_record(db, campaign_id, lock=True)
        if record.status != "draft":
            raise AppError(409, "notification_delete_unavailable", "Only drafts can be deleted.")
        db.delete(record)
        record_audit(db, "notification_deleted", actor_id=actor.id, resource_id=campaign_id,
                     resource_type="notification_campaign")
    return Response(status_code=204)


@admin_router.post("/campaigns/{campaign_id}/actions/{action}", response_model=CampaignResponse,
                   dependencies=[rate_limit("notification_action")])
def action(db: DatabaseSession, admin: Manager, settings: AppSettings, campaign_id: UUID,
           action: Literal["send", "schedule", "pause", "resume", "cancel"], body: CampaignAction):
    return change_campaign(db, admin, settings, campaign_id, action, body.confirm_broadcast)


@admin_router.get("/campaigns/{campaign_id}/executions", response_model=AdminPage[ExecutionResponse])
def executions(db: DatabaseSession, admin: Reader, campaign_id: UUID, query: Annotated[PublicPageQuery, Query()]):
    campaign_record(db, campaign_id)
    return paged(db, select(Execution).where(Execution.campaign_id == campaign_id)
                 .order_by(Execution.scheduled_execution_at.desc(), Execution.id), query, ExecutionResponse)


@admin_router.get("/campaigns/{campaign_id}/deliveries", response_model=AdminPage[DeliveryResponse])
def deliveries(db: DatabaseSession, admin: Reader, campaign_id: UUID, filters: Annotated[DeliveryQuery, Query()]):
    campaign_record(db, campaign_id)
    query = select(Delivery).join(Execution).where(Execution.campaign_id == campaign_id)
    if filters.status:
        query = query.where(Delivery.status == filters.status)
    if filters.execution_id:
        query = query.where(Delivery.execution_id == filters.execution_id)
    return paged(db, query.order_by(Delivery.created_at.desc(), Delivery.id), filters, DeliveryResponse)
