import re
from datetime import date, datetime, time, timedelta
from typing import Annotated, Literal
from uuid import UUID
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, Query
from pydantic import ValidationError
from sqlalchemy import case, func, or_, select

from app.api.dependencies import AppSettings, DatabaseSession
from app.core.exceptions import AppError
from app.modules.admins.dependencies import AdminRoute, require_permission
from app.modules.admins.models import AdminUser
from app.modules.admins.permissions import AdminRole, Permission
from app.modules.admins.responses import prevent_caching
from app.modules.admins.sessions import AdminContext, lock_authorized_admin
from app.modules.crm import service as crm
from app.modules.crm.models import FollowUp, Lead, LeadEvent, LeadSource
from app.modules.crm.schemas import (
    BulkInput, ConversionInput, FollowUpInput, ImportInput, InteractionInput, LeadWrite,
    NoteInput, SourceInput, Status, StatusInput,
)
from app.modules.customers.credentials import utc_now
from app.schemas.catalogue import PublicPageQuery

router = APIRouter(prefix="/admin/crm", route_class=AdminRoute, dependencies=[Depends(prevent_caching)], tags=["CRM"])
Worker = Annotated[AdminContext, Depends(require_permission(Permission.CRM_WORK))]
Manager = Annotated[AdminContext, Depends(require_permission(Permission.CRM_MANAGE))]


def lead_json(lead, follow_up=None, suppressed=False):
    return {
        **lead.details, "id": lead.id, "name": lead.name, "phone": lead.phone, "location": lead.location,
        "district": lead.district, "installation_date": lead.installation_date, "status": lead.status,
        "priority": lead.priority, "source": lead.source, "assigned_to": lead.assigned_to,
        "last_contacted_at": lead.last_contacted_at, "next_follow_up": follow_up,
        "created_at": lead.created_at, "updated_at": lead.updated_at, "archived_at": lead.archived_at,
        "customer_id": lead.customer_id, "booking_id": lead.booking_id, "converted_at": lead.converted_at,
        "contact_blocked": suppressed or lead.status == crm.NO_CONTACT,
    }


def event_json(row, author):
    return {"id": row.id, "lead_id": row.lead_id, "author": author, "kind": row.kind,
            "note": row.note, "details": row.details, "created_at": row.created_at}


def follow_json(row, lead, suppressed=False):
    return {"id": row.id, "lead_id": row.lead_id, "name": lead.name,
            "phone": lead.phone if not (lead.archived_at or suppressed or lead.status == crm.NO_CONTACT) else None,
            "assigned_to": lead.assigned_to, "due_at": row.due_at, "status": row.status,
            "reason": row.reason, "notes": row.notes}


def page(db, query, pagination, serialize):
    total = db.scalar(select(func.count()).select_from(query.order_by(None).subquery()))
    rows = db.execute(query.offset(pagination.offset).limit(pagination.page_size))
    return {"items": [serialize(*row) for row in rows], "total": total, "page": pagination.page,
            "page_size": pagination.page_size, "has_next": pagination.offset + pagination.page_size < total,
            "has_previous": pagination.page > 1}


class Filters(PublicPageQuery):
    search: str | None = Query(default=None, max_length=100)
    status: Status | None = None
    source: str | None = Query(default=None, max_length=100)
    district: str | None = Query(default=None, max_length=100)
    assigned_to: UUID | None = None
    installed_from: date | None = None
    installed_to: date | None = None
    follow_up_date: date | None = None
    sort: Literal["newest", "oldest", "priority", "follow_up"] = "newest"
    archived: bool = False


def day_bounds(day, timezone):
    zone = ZoneInfo(timezone)
    return datetime.combine(day, time.min, zone), datetime.combine(day + timedelta(days=1), time.min, zone)


def lead_query(actor, filters, timezone):
    due = select(FollowUp.due_at).where(FollowUp.lead_id == Lead.id, FollowUp.status == "open").scalar_subquery()
    query = select(Lead, due, crm.suppressed_phone()).where(
        crm.access(actor), Lead.archived_at.is_not(None) if filters.archived else Lead.archived_at.is_(None),
    )
    if filters.search:
        search = filters.search.strip()
        conditions = [Lead.name.icontains(search, autoescape=True), Lead.location.icontains(search, autoescape=True)]
        if re.fullmatch(r"[+0-9 ()-]+", search):
            digits = re.sub(r"[^0-9]", "", search)
            if digits:
                conditions.append(Lead.phone.contains(digits.removeprefix("00"), autoescape=True))
        query = query.where(or_(*conditions))
    for value, column in ((filters.status, Lead.status), (filters.source, Lead.source), (filters.assigned_to, Lead.assigned_to)):
        if value is not None:
            query = query.where(column == value)
    if filters.district:
        query = query.where(Lead.district.icontains(filters.district, autoescape=True))
    if filters.installed_from:
        query = query.where(Lead.installation_date >= filters.installed_from)
    if filters.installed_to:
        query = query.where(Lead.installation_date <= filters.installed_to)
    if filters.follow_up_date:
        start, end = day_bounds(filters.follow_up_date, timezone)
        query = query.where(due >= start, due < end)
    order = {"newest": Lead.created_at.desc(), "oldest": Lead.created_at.asc(),
             "priority": case({"high": 0, "medium": 1}, value=Lead.priority, else_=2), "follow_up": due.asc().nulls_last()}
    return query.order_by(order[filters.sort], Lead.id)


@router.get("/leads")
def list_leads(db: DatabaseSession, admin: Worker, settings: AppSettings, filters: Annotated[Filters, Query()]):
    return page(db, lead_query(admin.profile, filters, settings.business_timezone), filters, lead_json)


@router.post("/leads", status_code=201)
def create(db: DatabaseSession, admin: Worker, body: LeadWrite):
    with db.begin():
        actor = lock_authorized_admin(db, admin, Permission.CRM_WORK)
        return lead_json(crm.save(db, actor, body, allow_duplicate=body.allow_duplicate))


@router.get("/sources")
def sources(db: DatabaseSession, admin: Worker):
    return list(db.scalars(select(LeadSource.name).order_by(LeadSource.name)))


@router.post("/sources", status_code=201)
def create_source(db: DatabaseSession, admin: Manager, body: SourceInput):
    from sqlalchemy.dialects.postgresql import insert

    with db.begin():
        lock_authorized_admin(db, admin, Permission.CRM_MANAGE)
        added = db.scalar(insert(LeadSource).values(name=body.name).on_conflict_do_nothing().returning(LeadSource.name))
        if added is None:
            raise AppError(409, "source_exists", "This source already exists.")
        return {"name": added}


@router.get("/staff")
def staff(db: DatabaseSession, admin: Manager):
    return [{"id": id, "name": name} for id, name in db.execute(
        select(AdminUser.id, AdminUser.full_name).where(AdminUser.is_active.is_(True)).order_by(AdminUser.full_name)
    )]


@router.post("/leads/bulk")
def bulk(db: DatabaseSession, admin: Manager, body: BulkInput):
    with db.begin():
        actor = lock_authorized_admin(db, admin, Permission.CRM_MANAGE)
        for lead_id in sorted(set(body.ids)):
            lead = crm.get_lead(db, actor, lead_id, lock=True)
            if body.action == "assign":
                crm.assign(db, actor, lead, body.assigned_to)
            elif body.action == "priority" and body.priority:
                crm.event(db, lead, actor, "priority", previous=lead.priority, priority=body.priority)
                lead.priority = body.priority
            elif body.action == "status" and body.status:
                crm.change_status(db, actor, lead, body.status, body.reason)
            elif body.action in ("archive", "restore"):
                if body.action == "archive":
                    crm.close_followups(db, lead)
                lead.archived_at = utc_now() if body.action == "archive" else None
                crm.event(db, lead, actor, body.action)
            else:
                raise AppError(422, "missing_bulk_value", "Choose a value for this action.")
        return {"updated": len(set(body.ids))}


def import_rows(db, actor, body, confirm):
    rows = []
    seen = set()
    for index, raw in enumerate(body.rows, start=1):
        try:
            data = LeadWrite.model_validate(raw)
            if db.get(LeadSource, data.source) is None:
                raise AppError(422, "unknown_source", "Unknown lead source.")
            duplicate = bool(data.phone and (data.phone in seen or crm.duplicates(db, data.phone)))
            if data.phone:
                seen.add(data.phone)
            if duplicate and not body.allow_duplicates:
                rows.append({"row": index, "status": "duplicate", "message": "Phone already exists."})
                continue
            incomplete = not data.name or not data.phone or not data.installation_date
            if confirm:
                with db.begin_nested():
                    crm.save(db, actor, data, allow_duplicate=body.allow_duplicates)
            rows.append({"row": index, "status": "imported" if confirm else "valid",
                         "duplicate": duplicate, "requires_review": incomplete})
        except ValidationError as error:
            fields = ", ".join(str(issue["loc"][0]) if issue["loc"] else "record" for issue in error.errors())
            rows.append({"row": index, "status": "invalid", "message": f"Check {fields}."})
        except AppError as error:
            rows.append({"row": index, "status": "duplicate" if error.code == "duplicate_lead" else "invalid",
                         "message": error.message})
    return {"total": len(rows), "imported": sum(row["status"] == "imported" for row in rows),
            "skipped": sum(row["status"] in {"invalid", "duplicate"} for row in rows), "rows": rows}


@router.post("/import/{action}")
def import_leads(db: DatabaseSession, admin: Manager, action: Literal["preview", "confirm"], body: ImportInput):
    with db.begin():
        actor = lock_authorized_admin(db, admin, Permission.CRM_MANAGE)
        return import_rows(db, actor, body, action == "confirm")


@router.get("/leads/{lead_id}")
def detail(db: DatabaseSession, admin: Worker, lead_id: UUID):
    lead = crm.get_lead(db, admin.profile, lead_id)
    due = db.scalar(select(FollowUp.due_at).where(FollowUp.lead_id == lead.id, FollowUp.status == "open"))
    suppressed = db.scalar(select(crm.suppressed_phone()).select_from(Lead).where(Lead.id == lead.id))
    return lead_json(lead, due, suppressed)


@router.put("/leads/{lead_id}")
def edit(db: DatabaseSession, admin: Worker, lead_id: UUID, body: LeadWrite):
    with db.begin():
        actor = lock_authorized_admin(db, admin, Permission.CRM_WORK)
        lead = crm.get_lead(db, actor, lead_id, lock=True)
        if lead.archived_at or lead.status == crm.NO_CONTACT and body.phone != lead.phone:
            raise AppError(409, "lead_edit_blocked", "Restore the lead or correct Do Not Contact before editing its phone.")
        return lead_json(crm.save(db, actor, body, lead=lead, allow_duplicate=body.allow_duplicate))


@router.post("/leads/{lead_id}/status")
def status(db: DatabaseSession, admin: Worker, lead_id: UUID, body: StatusInput):
    with db.begin():
        actor = lock_authorized_admin(db, admin, Permission.CRM_WORK)
        lead = crm.get_lead(db, actor, lead_id, lock=True)
        crm.change_status(db, actor, lead, body.status, body.reason)
        return {"status": lead.status}


@router.get("/events")
def events(db: DatabaseSession, admin: Worker, pagination: Annotated[PublicPageQuery, Depends()],
           lead_id: UUID | None = None, calls: bool = False):
    if lead_id:
        crm.get_lead(db, admin.profile, lead_id)
    query = select(LeadEvent, AdminUser.full_name).join(Lead, Lead.id == LeadEvent.lead_id).join(
        AdminUser, AdminUser.id == LeadEvent.actor_id).where(crm.access(admin.profile))
    if lead_id:
        query = query.where(LeadEvent.lead_id == lead_id)
    if calls:
        query = query.where(LeadEvent.kind == "call")
    return page(db, query.order_by(LeadEvent.created_at.desc(), LeadEvent.id), pagination, event_json)


@router.post("/leads/{lead_id}/notes", status_code=201)
def notes(db: DatabaseSession, admin: Worker, lead_id: UUID, body: NoteInput):
    with db.begin():
        actor = lock_authorized_admin(db, admin, Permission.CRM_WORK)
        crm.event(db, crm.get_lead(db, actor, lead_id, lock=True), actor, "note", body.note)
        return {"saved": True}


@router.post("/leads/{lead_id}/interactions", status_code=201)
def interactions(db: DatabaseSession, admin: Worker, lead_id: UUID, body: InteractionInput):
    with db.begin():
        actor = lock_authorized_admin(db, admin, Permission.CRM_WORK)
        lead = crm.get_lead(db, actor, lead_id, lock=True)
        crm.require_contactable(db, lead)
        lead.last_contacted_at = utc_now()
        if body.interest:
            lead.details = {**lead.details, "interest": body.interest}
        crm.event(db, lead, actor, "call", body.note, **body.model_dump(exclude={"note", "follow_up"}))
        if lead.status != "converted":
            status = {"answered": "contacted", "no_answer": "no_answer", "busy": "no_answer", "switched_off": "no_answer",
                      "requested_callback": "follow_up_required", "invalid_number": "invalid",
                      "interested": "interested", "not_interested": "not_interested"}.get(body.outcome)
            if status:
                crm.change_status(db, actor, lead, status)
        if body.follow_up:
            crm.schedule(db, actor, lead, body.follow_up)
        return {"saved": True}


@router.get("/follow-ups")
def followups(db: DatabaseSession, admin: Worker, settings: AppSettings, pagination: Annotated[PublicPageQuery, Depends()],
              bucket: Literal["today", "overdue", "upcoming", "completed", "history", "open"] = "today",
              lead_id: UUID | None = None):
    query = select(FollowUp, Lead, crm.suppressed_phone()).join(Lead, Lead.id == FollowUp.lead_id).where(crm.access(admin.profile))
    if lead_id:
        crm.get_lead(db, admin.profile, lead_id)
        query = query.where(Lead.id == lead_id)
    now = utc_now()
    start, end = day_bounds(now.astimezone(ZoneInfo(settings.business_timezone)).date(), settings.business_timezone)
    if bucket == "completed":
        query = query.where(FollowUp.status == "completed")
    elif bucket != "history":
        query = query.where(FollowUp.status == "open", Lead.archived_at.is_(None), Lead.status != crm.NO_CONTACT,
                            ~crm.suppressed_phone())
        if bucket == "today":
            query = query.where(FollowUp.due_at >= start, FollowUp.due_at < end)
        elif bucket == "overdue":
            query = query.where(FollowUp.due_at < now)
        elif bucket == "upcoming":
            query = query.where(FollowUp.due_at >= end)
    order = FollowUp.due_at.desc() if bucket in ("completed", "history") else FollowUp.due_at.asc()
    return page(db, query.order_by(order, FollowUp.id), pagination, follow_json)


@router.post("/leads/{lead_id}/follow-ups", status_code=201)
def schedule(db: DatabaseSession, admin: Worker, lead_id: UUID, body: FollowUpInput):
    with db.begin():
        actor = lock_authorized_admin(db, admin, Permission.CRM_WORK)
        lead = crm.get_lead(db, actor, lead_id, lock=True)
        return follow_json(crm.schedule(db, actor, lead, body), lead)


@router.post("/follow-ups/{follow_up_id}/{action}")
def update_followup(db: DatabaseSession, admin: Worker, follow_up_id: UUID,
                    action: Literal["complete", "cancel", "reschedule"], body: FollowUpInput | None = None):
    with db.begin():
        actor = lock_authorized_admin(db, admin, Permission.CRM_WORK)
        lead_id = db.scalar(select(FollowUp.lead_id).where(FollowUp.id == follow_up_id))
        lead = crm.get_lead(db, actor, lead_id, lock=True)
        record = db.scalar(select(FollowUp).where(FollowUp.id == follow_up_id).with_for_update())
        if record.status != "open":
            raise AppError(409, "follow_up_closed", "This follow-up is already closed.")
        if action == "reschedule":
            if body is None:
                raise AppError(422, "follow_up_required", "Enter a new date, time and reason.")
            record = crm.schedule(db, actor, lead, body, record)
        else:
            record.status = "completed" if action == "complete" else "cancelled"
            crm.event(db, lead, actor, "follow_up_" + record.status, follow_up_id=str(record.id))
        return follow_json(record, lead)


@router.get("/leads/{lead_id}/customer-matches")
def matches(db: DatabaseSession, admin: Manager, lead_id: UUID):
    lead = crm.get_lead(db, admin.profile, lead_id)
    return [{"id": customer.id, "name": customer.full_name} for customer in crm.customer_matches(db, lead)]


@router.post("/leads/{lead_id}/convert")
def convert(db: DatabaseSession, admin: Manager, lead_id: UUID, body: ConversionInput):
    with db.begin():
        actor = lock_authorized_admin(db, admin, Permission.CRM_MANAGE)
        lead = crm.get_lead(db, actor, lead_id, lock=True)
        crm.convert(db, actor, lead, body)
        return lead_json(lead)


@router.get("/overview")
def overview(db: DatabaseSession, admin: Worker, settings: AppSettings):
    active = (crm.access(admin.profile), Lead.archived_at.is_(None))
    now = utc_now()
    start, end = day_bounds(now.astimezone(ZoneInfo(settings.business_timezone)).date(), settings.business_timezone)
    statuses = dict(db.execute(select(Lead.status, func.count()).where(*active).group_by(Lead.status)).all())
    sources = dict(db.execute(select(Lead.source, func.count()).where(*active).group_by(Lead.source)).all())
    day = func.date(func.timezone(settings.business_timezone, Lead.created_at))
    timeline = db.execute(select(day, func.count()).where(*active, Lead.created_at >= start - timedelta(days=29))
                          .group_by(day).order_by(day)).all()
    due, overdue, completed, cancelled = db.execute(select(
        func.count().filter(FollowUp.status == "open", FollowUp.due_at >= start, FollowUp.due_at < end),
        func.count().filter(FollowUp.status == "open", FollowUp.due_at < now),
        func.count().filter(FollowUp.status == "completed"),
        func.count().filter(FollowUp.status == "cancelled"),
    ).select_from(FollowUp).join(Lead).where(*active)).one()
    outcome = LeadEvent.details["outcome"].astext
    reached = {"answered", "requested_callback", "interested", "not_interested", "cleaning_already_completed"}
    contacted, calls, answered = db.execute(select(
        func.count(func.distinct(LeadEvent.lead_id)).filter(outcome.in_(reached)),
        func.count(), func.count().filter(outcome.in_(reached)),
    ).select_from(LeadEvent).join(Lead).where(*active, LeadEvent.kind == "call")).one()
    return {"total": sum(statuses.values()), "statuses": statuses, "sources": sources,
            "timeline": [{"date": date, "count": count} for date, count in timeline],
            "due": due, "overdue": overdue, "completed": completed, "cancelled": cancelled,
            "contacted": contacted, "calls": calls, "answered": answered}
