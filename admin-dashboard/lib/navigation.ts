import {
  Activity, Bell, Building2, CalendarCheck2, CalendarClock, CalendarDays, ChartNoAxesCombined, ClipboardList,
  LayoutGrid, MapPinned, Settings2, ShieldCheck, Sun, Users, Wrench, type LucideIcon,
} from 'lucide-react';

export type NavEntry = { id: string; label: string; icon: LucideIcon; permissions: string[] };
export const navigation: { title: string; entries: NavEntry[] }[] = [
  { title: 'Overview', entries: [{ id: 'dashboard', label: 'Dashboard', icon: LayoutGrid, permissions: ['dashboard.read'] }] },
  { title: 'Operations', entries: [
    { id: 'bookings', label: 'Bookings', icon: CalendarDays, permissions: ['bookings.read'] },
    { id: 'customers', label: 'Customers', icon: Users, permissions: ['customers.read'] },
    { id: 'technicians', label: 'Technicians', icon: Wrench, permissions: ['technicians.read'] },
    { id: 'assignments', label: 'Assignments', icon: ClipboardList, permissions: ['bookings.read', 'technicians.assignments.read'] },
    { id: 'notifications', label: 'Notifications', icon: Bell, permissions: ['notifications.read'] },
  ] },
  { title: 'Business management', entries: [
    { id: 'services', label: 'Services', icon: Sun, permissions: ['services.read'] },
    { id: 'service-areas', label: 'Service areas', icon: MapPinned, permissions: ['locations.read'] },
    { id: 'availability', label: 'Availability', icon: CalendarClock, permissions: ['locations.read', 'services.read'] },
    { id: 'business', label: 'Business settings', icon: Building2, permissions: [] },
  ] },
  { title: 'Reports', entries: [
    { id: 'booking-reports', label: 'Booking reports', icon: ChartNoAxesCombined, permissions: ['dashboard.analytics.read'] },
    { id: 'customer-reports', label: 'Customer reports', icon: Activity, permissions: ['dashboard.read', 'customers.read'] },
    { id: 'technician-reports', label: 'Technician performance', icon: CalendarCheck2, permissions: ['technicians.assignments.read', 'technicians.availability.read'] },
  ] },
  { title: 'Administration', entries: [
    { id: 'admin-users', label: 'Admin users', icon: ShieldCheck, permissions: ['admin.users.read'] },
    { id: 'settings', label: 'Account settings', icon: Settings2, permissions: [] },
  ] },
];

export const entries = navigation.flatMap((group) => group.entries);

