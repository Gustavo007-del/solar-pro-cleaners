import argparse
from pathlib import Path
from uuid import UUID

from pydantic import Field, ValidationError, model_validator
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.database import create_database
from app.modules.business.models import BusinessClosure, BusinessOperatingHour, BusinessProfile
from app.modules.business.schemas import BusinessClosureInput, BusinessProfileInput, OperatingHourFields
from app.modules.locations.models import ServiceArea
from app.modules.locations.schemas import ServiceAreaInput
from app.modules.locations.service import coverage_key
from app.modules.pricing.models import ServicePrice
from app.modules.pricing.schemas import PriceInput
from app.modules.services.models import Service
from app.modules.services.schemas import ServiceInput
from app.schemas.catalogue import ConfigInput


class SeedConfigurationError(ValueError):
    pass


class BusinessSeed(ConfigInput):
    services: list[ServiceInput] = Field(default_factory=list)
    prices: list[PriceInput] = Field(default_factory=list)
    service_areas: list[ServiceAreaInput] = Field(default_factory=list)
    business: BusinessProfileInput | None = None
    operating_hours: list[OperatingHourFields] = Field(default_factory=list)
    closures: list[BusinessClosureInput] = Field(default_factory=list)

    @model_validator(mode="after")
    def reject_duplicate_inputs(self) -> "BusinessSeed":
        keys = (
            [service.slug for service in self.services],
            [(price.service_slug, price.effective_from) for price in self.prices],
            [coverage_key(area.match_type, area) for area in self.service_areas],
            [hours.day_of_week for hours in self.operating_hours],
            [closure.closure_date for closure in self.closures],
        )
        if any(len(group) != len(set(group)) for group in keys):
            raise ValueError("The configuration contains duplicate records.")
        return self


def _insert(db: Session, model, keys: tuple[str, ...], values: dict) -> UUID | None:
    statement = insert(model).values(**values).on_conflict_do_nothing(index_elements=list(keys))
    return db.scalar(statement.returning(model.id))


def seed_business(db: Session, config: BusinessSeed) -> dict[str, int]:
    counts = {key: 0 for key in ("services", "prices", "service_areas", "business", "operating_hours", "closures")}
    with db.begin():
        for service in config.services:
            counts["services"] += _insert(db, Service, ("slug",), service.model_dump()) is not None
        for price in config.prices:
            service_id = db.scalar(select(Service.id).where(Service.slug == price.service_slug))
            if service_id is None:
                raise SeedConfigurationError("A price references an unknown service slug.")
            values = price.model_dump(exclude={"service_slug"})
            counts["prices"] += _insert(
                db, ServicePrice, ("service_id", "effective_from"), {**values, "service_id": service_id},
            ) is not None
        for area in config.service_areas:
            counts["service_areas"] += _insert(
                db, ServiceArea, ("coverage_key",),
                {**area.model_dump(), "coverage_key": coverage_key(area.match_type, area)},
            ) is not None

        if config.business is not None:
            counts["business"] += _insert(
                db, BusinessProfile, ("singleton_key",), {"singleton_key": 1, **config.business.model_dump()},
            ) is not None

        if config.operating_hours or config.closures:
            business_id = db.scalar(select(BusinessProfile.id).where(BusinessProfile.singleton_key == 1))
            if business_id is None:
                raise SeedConfigurationError("A business profile is required for hours and closures.")
            for hours in config.operating_hours:
                counts["operating_hours"] += _insert(
                    db, BusinessOperatingHour, ("business_profile_id", "day_of_week"),
                    {"business_profile_id": business_id, **hours.model_dump()},
                ) is not None
            for closure in config.closures:
                counts["closures"] += _insert(
                    db, BusinessClosure, ("business_profile_id", "closure_date"),
                    {"business_profile_id": business_id, **closure.model_dump()},
                ) is not None
    return counts


def main() -> None:
    parser = argparse.ArgumentParser(description="Insert owner-supplied business configuration.")
    parser.add_argument("--file", type=Path, required=True, help="Path to an owner-reviewed JSON file.")
    args = parser.parse_args()
    try:
        config = BusinessSeed.model_validate_json(args.file.read_bytes())
    except OSError:
        parser.exit(2, "Unable to read the configuration file.\n")
    except ValidationError as exc:
        parser.exit(2, f"Configuration contains {exc.error_count()} validation error(s). See the configuration contract.\n")

    try:
        database = create_database(get_settings())
        try:
            with database.sessions() as db:
                counts = seed_business(db, config)
        finally:
            database.engine.dispose()
    except SeedConfigurationError as exc:
        parser.exit(2, f"{exc}\n")
    except RuntimeError:
        parser.exit(2, "Backend or database configuration is unavailable. See backend/.env.example.\n")
    except SQLAlchemyError:
        parser.exit(2, "Database rejected the configuration. No seed changes were committed.\n")

    for name, count in counts.items():
        print(f"{name}: {count} inserted")


if __name__ == "__main__":
    main()
