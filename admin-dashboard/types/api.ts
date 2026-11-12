export const statuses = ['pending', 'confirmed', 'assigned', 'in_progress', 'completed', 'cancelled'] as const;
export type Status = typeof statuses[number];
export type Counts = Record<Status, number>;
export type Page<T> = { items: T[]; total: number; page: number; page_size: number; total_pages: number; has_next: boolean; has_previous: boolean };
export type Admin = {
  id: string; full_name: string; email: string; role: 'owner' | 'admin' | 'staff'; is_active: boolean;
  created_at: string; updated_at: string; last_login_at: string | null;
};
export type Profile = Admin & { permissions: string[] };
export type Auth = { admin: Profile; tokens: { access_token: string; refresh_token: null; token_type: 'bearer'; expires_in: number; refresh_expires_at: string } };
export type Address = {
  address_line: string; address_line_2: string | null; locality: string | null; city: string | null; district: string | null;
  state: string | null; postal_code: string | null; landmark: string | null; latitude: number | null;
  longitude: number | null; google_maps_url: string | null; recipient_name: string | null; recipient_phone: string | null;
};
export type CurrentAssignment = { assignment_id: string; technician_id: string; technician_name: string; assignment_status: string };
export type BookingCard = {
  id: string; booking_reference: string; service_id: string; service_name: string; service_date: string;
  address_summary: string; estimated_amount: string | null; currency: string; created_at: string; status: Status;
  status_label: string; customer_id?: string; customer_name?: string; customer_phone?: string; current_assignment?: CurrentAssignment | null;
};
export type Price = { pricing_type: 'fixed' | 'per_panel' | 'custom_quote' | null; base_price?: string | null;
  price_per_panel?: string | null; minimum_charge?: string | null; currency: string; panel_quantity?: number | null;
  estimated_amount?: string | null };
export type Booking = BookingCard & {
  customer_id: string; customer: { full_name: string; phone_number: string; alternate_phone_number: string | null };
  address: Address; pricing: Price; customer_instructions: string | null; cancellation_reason: string | null;
  legacy_admin_notes: string | null; current_assignment: CurrentAssignment | null; updated_at: string;
  history: { old_status: Status | null; new_status: Status; status_label: string; created_at: string;
    changed_by_type: string; changed_by_name: string | null; reason: string | null }[];
};
export type Note = { id: string; admin_id: string; note: string; created_at: string; updated_at: string };
export type Customer = { id: string; full_name: string; phone_number: string; alternate_phone_number: string | null;
  is_active: boolean; created_at: string; updated_at: string };
export type CustomerCard = Customer & { total_bookings: number; last_booking_at: string | null };
export type SavedAddress = Address & { id: string; label: string | null; is_default: boolean };
export type CustomerDetails = { customer: Customer; saved_addresses: Page<SavedAddress>; total_bookings: number;
  booking_status_counts: Counts; recent_bookings: BookingCard[] };
export const employment = ['active', 'inactive', 'on_leave', 'terminated'] as const;
export const availabilityStatuses = ['available', 'unavailable', 'on_leave', 'temporarily_unavailable'] as const;
export const assignmentStatuses = ['assigned', 'accepted', 'in_progress', 'completed', 'rejected', 'cancelled', 'reassignment_required'] as const;
export type TechnicianCard = { id: string; full_name: string; primary_phone: string; city: string | null;
  is_active: boolean; employment_status: typeof employment[number]; active_assignments: number; completed_assignments: number };
export type Availability = { date: string; timezone: string; available: boolean; status: typeof availabilityStatuses[number];
  source: string; start_time: string | null; end_time: string | null };
export type Workload = { active_assignments: number; completed_assignments: number; rejected_assignments: number; cancelled_assignments: number };
export type WorkloadCard = Pick<TechnicianCard, 'id' | 'full_name' | 'employment_status' | 'is_active'> & {
  workload: Workload; availability: Availability };
export type Technician = Omit<TechnicianCard, 'active_assignments' | 'completed_assignments'> & {
  alternate_phone: string | null; email: string | null; address: string | null; district: string | null; pin_code: string | null;
  joining_date: string | null; notes: string | null; deactivation_reason: string | null; profile_image_url: string | null;
  workload: Workload; availability: Availability; active_assignments: Page<Assignment>; recent_assignments: Assignment[];
};
export type Schedule = { id: string; availability_date: string | null; day_of_week: number | null; start_time: string | null;
  end_time: string | null; availability_status: typeof availabilityStatuses[number]; reason: string | null };
export type Leave = { id: string; start_date: string; end_date: string; is_approved: boolean; reason: string | null };
export type Assignment = { id: string; technician_id: string; technician_name: string; booking_id: string; booking_reference: string;
  assignment_status: string; assigned_at: string; ended_at: string | null; service_date: string; administrative_note: string | null;
  operational_note: string | null; reassignment_reason: string | null; cancellation_reason: string | null; replaces_assignment_id: string | null };
export type Candidate = { id: string; full_name: string; city: string | null; start_time: string | null; end_time: string | null };
export type Candidates = Page<Candidate> & { service_date: string; timezone: string; requires_in_progress_override: boolean };
export type Service = { id: string; name: string; slug: string; short_description: string; benefits: string[]; display_order: number };
export type ServiceDetail = Service & { description: string };
export type ServiceArea = { id: string; name: string; match_type: string; postal_code: string | null; locality: string | null;
  city: string | null; district: string | null; state: string | null; description: string | null };
export type Business = { business_name: string; timezone: string; description: string | null; short_description: string | null;
  primary_phone: string | null; alternate_phone: string | null; whatsapp_number: string | null; support_email: string | null;
  business_address: string | null; city: string | null; district: string | null; state: string | null; postal_code: string | null;
  website_url: string | null; privacy_policy_url: string | null; terms_url: string | null };
export type Hours = { timezone: string; days: { day_of_week: number; is_open: boolean; opening_time: string | null; closing_time: string | null }[] };
export type Closure = { closure_date: string };
export type AvailabilityCheck = { requested_date: string; timezone: string; service_active: boolean; message: string;
  reason: string; coverage: { message: string; matched_area_name: string | null } };
export type RecentBooking = Pick<BookingCard, 'id' | 'booking_reference' | 'service_name' | 'service_date' | 'status' | 'created_at'> & {
  updated_at: string; completed_at: string | null };
export type Summary = { timezone: string; reporting_period: { start_date: string; end_date: string };
  booking_counts: Counts; total_bookings: number; total_customers: number; new_customers: number;
  bookings_today: number; bookings_this_week: number; bookings_this_month: number;
  recent_created: RecentBooking[]; recent_updated: RecentBooking[]; recent_completed: RecentBooking[] };
export type Analytics = { timezone: string; interval: string; reporting_period: Summary['reporting_period'];
  status_distribution: Counts; completed: number; cancelled: number;
  points: { period_start: string; total: number; completed: number; cancelled: number; status_counts: Counts }[] };

