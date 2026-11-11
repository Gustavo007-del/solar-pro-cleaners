import hashlib
import json
from unicodedata import normalize

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.modules.locations.models import ServiceArea
from app.modules.locations.schemas import CoverageCheckResponse, CoverageResult, LocationFields, MatchType, PublicServiceArea
from app.schemas.common import Page, PaginationParams


def normalized_place(value: str | None) -> str:
    return " ".join(normalize("NFKC", value or "").casefold().split())


def coverage_key(match_type: MatchType, location: LocationFields, *, use_district: bool = True) -> str:
    district = normalized_place(location.district) if use_district else ""
    city = normalized_place(location.city)
    state = normalized_place(location.state)
    if match_type == "pin":
        values = [match_type, location.postal_code]
    elif match_type == "locality":
        values = [match_type, state, district, city, normalized_place(location.locality)]
    elif match_type == "city":
        values = [match_type, state, district, city]
    else:
        values = [match_type, state, district]
    return hashlib.sha256(json.dumps(values, ensure_ascii=False).encode("utf-8")).hexdigest()


def _candidate_keys(location: LocationFields) -> list[str]:
    keys: list[str] = []
    if location.postal_code:
        keys.append(coverage_key("pin", location))
    if location.state and location.city:
        if location.locality:
            keys.extend(coverage_key("locality", location, use_district=qualified) for qualified in (True, False))
        keys.extend(coverage_key("city", location, use_district=qualified) for qualified in (True, False))
    if location.state and location.district:
        keys.append(coverage_key("district", location))
    return list(dict.fromkeys(keys))


def check_coverage(db: Session, location: LocationFields) -> CoverageResult:
    keys = _candidate_keys(location)
    if keys:
        rows = db.scalars(select(ServiceArea).where(
            ServiceArea.is_active.is_(True), ServiceArea.coverage_key.in_(keys),
        ))
        by_key = {area.coverage_key: area for area in rows}
        for key in keys:
            area = by_key.get(key)
            if area is None:
                continue
            if area.match_type == "pin" and any(
                getattr(location, field) and getattr(area, field)
                and normalized_place(getattr(location, field)) != normalized_place(getattr(area, field))
                for field in ("locality", "city", "district", "state")
            ):
                return CoverageResult(
                    covered=None, reason="conflicting_pin",
                    message="The PIN code and address details need business confirmation.",
                )
            return CoverageResult(
                covered=True, reason="matched", matched_area_id=area.id,
                matched_area_name=area.name, match_type=area.match_type,
                message="The address matches a configured service area.",
            )
    return CoverageResult(
        covered=None, reason="no_confident_match",
        message="The business needs to confirm coverage for this address.",
    )


def evaluate_coverage(db: Session, location: LocationFields) -> CoverageCheckResponse:
    result = check_coverage(db, location)
    match_type = "postal_code" if result.match_type == "pin" else result.match_type or "unmatched"
    return CoverageCheckResponse(
        is_covered=result.covered is True,
        match_type=match_type,
        matched_service_area_id=result.matched_area_id,
        matched_service_area_name=result.matched_area_name,
        requires_manual_confirmation=result.covered is not True,
        message=result.message,
    )


def list_service_areas(db: Session, query: PaginationParams) -> Page[PublicServiceArea]:
    active = ServiceArea.is_active.is_(True)
    total = db.scalar(select(func.count()).select_from(ServiceArea).where(active)) or 0
    areas = db.scalars(
        select(ServiceArea).where(active).order_by(ServiceArea.name, ServiceArea.id)
        .offset(query.offset).limit(query.page_size)
    )
    return Page[PublicServiceArea](
        items=[PublicServiceArea.model_validate(area) for area in areas],
        page=query.page, page_size=query.page_size, total=total,
    )
