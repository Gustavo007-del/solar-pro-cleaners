const booking = (id: string) => `/admin/bookings/${encodeURIComponent(id)}`;
const customer = (id: string) => `/admin/customers/${encodeURIComponent(id)}`;
const technician = (id: string) => `/admin/technicians/${encodeURIComponent(id)}`;
const user = (id: string) => `/admin/users/${encodeURIComponent(id)}`;
const service = (id: string) => `/services/${encodeURIComponent(id)}`;

export const routes = {
  auth: (action: 'login' | 'refresh' | 'logout' | 'logout-all' | 'change-password') => `/admin/auth/${action}`,
  me: '/admin/me',
  summary: '/admin/dashboard/summary', analytics: '/admin/dashboard/bookings-analytics',
  bookings: '/admin/bookings', booking, bookingStatus: (id: string) => booking(id) + '/status',
  cancelBooking: (id: string) => booking(id) + '/cancel', notes: (id: string) => booking(id) + '/notes',
  note: (id: string, note: string) => booking(id) + '/notes/' + encodeURIComponent(note),
  assignments: (id: string) => booking(id) + '/assignments', eligible: (id: string) => booking(id) + '/eligible-technicians',
  assignmentAction: (id: string, action: 'assign' | 'reassign' | 'unassign') => booking(id) + '/' + action,
  customers: '/admin/customers', customer, customerBookings: (id: string) => customer(id) + '/bookings',
  customerState: (id: string, action: 'activate' | 'deactivate') => customer(id) + '/' + action,
  technicians: '/admin/technicians', technician, workload: '/admin/technicians/workload',
  technicianState: (id: string, action: 'activate' | 'deactivate') => technician(id) + '/' + action,
  schedule: (id: string) => technician(id) + '/availability', leave: (id: string) => technician(id) + '/leave',
  leaveItem: (id: string, leave: string) => technician(id) + '/leave/' + encodeURIComponent(leave),
  technicianAssignments: (id: string) => technician(id) + '/assignments',
  users: '/admin/users', user, deactivateUser: (id: string) => user(id) + '/deactivate',
  services: '/services', service, pricing: (id: string) => service(id) + '/pricing',
  areas: '/service-areas', business: '/business', hours: '/business/operating-hours', closures: '/business/closures',
  availability: '/availability',
};

