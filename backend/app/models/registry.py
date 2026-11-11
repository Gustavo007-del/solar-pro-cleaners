"""Import feature models to populate Alembic's shared metadata."""

from app.models.base import Base
from app.modules.admins.models import AdminAuditLog, AdminLoginBucket, AdminSession, AdminUser
from app.modules.bookings.models import Booking, BookingAddress, BookingAdminNote, BookingPricingSnapshot, BookingStatusHistory
from app.modules.business.models import BusinessClosure, BusinessOperatingHour, BusinessProfile
from app.modules.customers.models import Customer, CustomerInstallation, RefreshSession
from app.modules.locations.models import CustomerAddress, ServiceArea
from app.modules.pricing.models import ServicePrice
from app.modules.services.models import Service
from app.modules.technicians.models import BookingAssignment, Technician, TechnicianAvailability, TechnicianLeave

__all__ = [
    "AdminAuditLog", "AdminLoginBucket", "AdminSession", "AdminUser",
    "Base", "Booking", "BookingAddress", "BookingAdminNote", "BookingPricingSnapshot", "BookingStatusHistory",
    "BusinessClosure", "BusinessOperatingHour", "BusinessProfile",
    "Customer", "CustomerAddress", "CustomerInstallation", "RefreshSession", "Service", "ServiceArea", "ServicePrice",
    "BookingAssignment", "Technician", "TechnicianAvailability", "TechnicianLeave",
]
