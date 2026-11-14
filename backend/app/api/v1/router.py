from fastapi import APIRouter

from app.modules.admins.router import router as admins_router
from app.modules.admins.dashboard_router import router as admin_dashboard_router
from app.modules.availability.router import router as availability_router
from app.modules.bookings.router import router as bookings_router
from app.modules.bookings.admin_router import router as admin_bookings_router
from app.modules.business.router import router as business_router
from app.modules.customers.router import router as customers_router
from app.modules.customers.admin_router import router as admin_customers_router
from app.modules.crm.router import router as crm_router
from app.modules.locations.router import router as locations_router
from app.modules.locations.router import location_router
from app.modules.locations.address_router import router as saved_addresses_router
from app.modules.notifications.router import admin_router as admin_notifications_router, customer_router as customer_notifications_router
from app.modules.services.router import router as services_router
from app.modules.system.public import api as public_info_router
from app.modules.system.router import router as system_router
from app.modules.technicians.router import router as technicians_router
from app.modules.technicians.assignment_router import router as admin_assignments_router

router = APIRouter()
for module_router in (
    system_router, public_info_router, customers_router, bookings_router, services_router,
    locations_router, location_router, saved_addresses_router, business_router, availability_router,
    admins_router, admin_bookings_router, admin_customers_router, admin_dashboard_router,
    technicians_router, admin_assignments_router, customer_notifications_router, admin_notifications_router, crm_router,
):
    router.include_router(module_router)
