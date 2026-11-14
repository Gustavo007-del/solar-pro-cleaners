from enum import StrEnum

from app.core.exceptions import AppError


class AdminRole(StrEnum):
    OWNER = "owner"
    ADMIN = "admin"
    STAFF = "staff"


class Permission(StrEnum):
    CRM_WORK = "crm.work"
    CRM_MANAGE = "crm.manage"
    USERS_READ = "admin.users.read"
    USERS_CREATE = "admin.users.create"
    USERS_UPDATE = "admin.users.update"
    USERS_DEACTIVATE = "admin.users.deactivate"
    ROLES_MANAGE = "admin.roles.manage"
    BOOKINGS_READ = "bookings.read"
    BOOKINGS_UPDATE = "bookings.update"
    BOOKINGS_CANCEL = "bookings.cancel"
    BOOKINGS_ASSIGN = "bookings.assign"
    BOOKINGS_REASSIGN = "bookings.reassign"
    BOOKINGS_UNASSIGN = "bookings.unassign"
    BOOKINGS_NOTES_READ = "bookings.notes.read"
    BOOKINGS_NOTES_CREATE = "bookings.notes.create"
    BOOKINGS_NOTES_UPDATE = "bookings.notes.update"
    BOOKINGS_NOTES_DELETE = "bookings.notes.delete"
    CUSTOMERS_READ = "customers.read"
    CUSTOMERS_UPDATE = "customers.update"
    CUSTOMERS_ACTIVATE = "customers.activate"
    CUSTOMERS_DEACTIVATE = "customers.deactivate"
    DASHBOARD_READ = "dashboard.read"
    DASHBOARD_ANALYTICS_READ = "dashboard.analytics.read"
    SERVICES_READ = "services.read"
    SERVICES_MANAGE = "services.manage"
    LOCATIONS_READ = "locations.read"
    LOCATIONS_MANAGE = "locations.manage"
    BUSINESS_MANAGE = "business.manage"
    NOTIFICATIONS_READ = "notifications.read"
    NOTIFICATIONS_MANAGE = "notifications.manage"
    NOTIFICATIONS_BROADCAST = "notifications.broadcast"
    TECHNICIANS_READ = "technicians.read"
    TECHNICIANS_CREATE = "technicians.create"
    TECHNICIANS_UPDATE = "technicians.update"
    TECHNICIANS_ACTIVATE = "technicians.activate"
    TECHNICIANS_DEACTIVATE = "technicians.deactivate"
    TECHNICIAN_AVAILABILITY_READ = "technicians.availability.read"
    TECHNICIAN_AVAILABILITY_MANAGE = "technicians.availability.manage"
    TECHNICIAN_LEAVE_MANAGE = "technicians.leave.manage"
    TECHNICIAN_ASSIGNMENTS_READ = "technicians.assignments.read"
    TECHNICIAN_ASSIGNMENTS_MANAGE = "technicians.assignments.manage"


ROLE_PERMISSIONS = {
    AdminRole.OWNER: frozenset(Permission),
    AdminRole.ADMIN: frozenset({
        Permission.CRM_WORK, Permission.CRM_MANAGE,
        Permission.BOOKINGS_READ, Permission.BOOKINGS_UPDATE, Permission.BOOKINGS_CANCEL,
        Permission.BOOKINGS_NOTES_READ, Permission.BOOKINGS_NOTES_CREATE, Permission.BOOKINGS_NOTES_UPDATE,
        Permission.CUSTOMERS_READ, Permission.CUSTOMERS_UPDATE,
        Permission.DASHBOARD_READ, Permission.DASHBOARD_ANALYTICS_READ,
        Permission.SERVICES_READ, Permission.SERVICES_MANAGE, Permission.LOCATIONS_READ,
        Permission.LOCATIONS_MANAGE,
        Permission.NOTIFICATIONS_READ, Permission.NOTIFICATIONS_MANAGE,
        Permission.TECHNICIANS_READ, Permission.TECHNICIANS_CREATE, Permission.TECHNICIANS_UPDATE,
        Permission.TECHNICIAN_AVAILABILITY_READ, Permission.TECHNICIAN_AVAILABILITY_MANAGE,
        Permission.TECHNICIAN_LEAVE_MANAGE, Permission.TECHNICIAN_ASSIGNMENTS_READ,
        Permission.TECHNICIAN_ASSIGNMENTS_MANAGE, Permission.BOOKINGS_ASSIGN,
        Permission.BOOKINGS_REASSIGN, Permission.BOOKINGS_UNASSIGN,
    }),
    AdminRole.STAFF: frozenset({
        Permission.CRM_WORK,
        Permission.BOOKINGS_READ, Permission.SERVICES_READ, Permission.LOCATIONS_READ, Permission.DASHBOARD_READ,
    }),
}


def enforce_permission(role: AdminRole, permission: Permission) -> None:
    if permission not in ROLE_PERMISSIONS[role]:
        raise AppError(403, "admin_permission_denied", "You do not have permission to perform this action.")
