# Technician management and assignments

Use the existing [admin authentication contract](./admin-auth.md). All paths below are relative to `/api/v1/admin` and require an admin bearer token. Technician records are distinct from admin users and customers. This phase has no technician-facing authentication or workflow routes.

List responses use the shared `items`, `total`, `page`, `page_size`, `total_pages`, `has_next`, and `has_previous` envelope. UUIDs are strings, calendar dates use YYYY-MM-DD, and timestamps use ISO 8601. Errors use the existing structured envelope.

## Technician profiles

| Method and path | Permission | Input and response |
| --- | --- | --- |
| `POST /technicians` | `technicians.create` | Requires `full_name` and `primary_phone`. Returns `201` with the technician profile. |
| `GET /technicians` | `technicians.read` | Paginated cards with ID, name, primary phone, city, employment and active status, active count, and completed count. |
| `GET /technicians/{technician_id}` | `technicians.read`, `technicians.availability.read`, `technicians.assignments.read` | Profile plus `workload`, effective `availability`, paginated `active_assignments`, and five `recent_assignments`. Pagination applies to active assignments. |
| `PATCH /technicians/{technician_id}` | `technicians.update`, plus `technicians.deactivate` for inactive/terminated employment | Apply a non-empty subset of editable profile fields. Returns the updated profile. |
| `POST /technicians/{technician_id}/deactivate` | `technicians.deactivate` | Optional JSON `reason` and `retain_active_assignments`. Returns the inactive profile. |
| `POST /technicians/{technician_id}/activate` | `technicians.activate` | No body. Returns the active profile. |

Optional profile inputs are `alternate_phone`, `email`, `profile_image_url` (HTTPS), `address`, `city`, `district`, `pin_code`, `joining_date`, `notes`, and `employment_status`. Contact numbers normalize to Indian international mobile format. Normalized primary phone and non-null email are unique. Employment status is `active`, `inactive`, `on_leave`, or `terminated`. A profile also returns `id`, `is_active`, `availability_reset_at`, `deactivation_reason`, `created_at`, and `updated_at`. To clear an optional editable field, send null.

Technician lists accept `page`, `page_size`, `search` (name or phone), `employment_status`, `is_active`, `city`, `district`, and `sort` (`newest`, `name`, or `joining_date`, newest non-null joining date first).

Deactivation blocks new assignments. When active assignments exist, resolve them first or explicitly send `retain_active_assignments: true` with a reason. Existing assignments remain intact. Reactivation is unavailable for terminated employment. It does not create assignments or restore previous schedule entries. An operator can explicitly set the applicable availability again.

## Availability and leave

| Method and path | Permission | Input and response |
| --- | --- | --- |
| `GET /technicians/{id}/availability` | `technicians.availability.read` | Paginated schedule records and business `timezone`. `date_from` and `date_to` filter dated entries and retain recurring entries. |
| `PUT /technicians/{id}/availability` | `technicians.availability.manage` | Replace or create the record for one date or weekday. Returns the record. |
| `GET /technicians/{id}/leave` | `technicians.leave.manage` | Paginated leave records. Optional dates filter records that overlap the interval. |
| `POST /technicians/{id}/leave` | `technicians.leave.manage` | JSON `start_date`, `end_date`, optional `reason`, and `is_approved` (true by default). Returns `201`. |
| `PATCH /technicians/{id}/leave/{leave_id}` | `technicians.leave.manage` | Non-empty subset of the leave fields. Returns the updated record. |
| `DELETE /technicians/{id}/leave/{leave_id}` | `technicians.leave.manage` | Returns `204`. |

A schedule input uses exactly one of `availability_date` or `day_of_week` (0 Monday through 6 Sunday), plus `availability_status` and optional `reason`. The status is `available`, `unavailable`, `on_leave`, or `temporarily_unavailable`. Available entries may specify `start_time` and `end_time` as ordered, same-day business-local times, or omit both for the full day. Other entries omit both. Time intervals do not create booking slots. Schedule and leave responses add IDs and timestamps.

Employment eligibility and approved leave take precedence. An eligible date-specific entry overrides its recurring weekday entry. Missing schedules mean unconfigured availability. Current workload availability also accounts for an existing assignment and whether local time is within scheduled hours. Approved leave cannot be added or extended over active assignments. Leave ranges are inclusive and overlapping records return `409`. Schedule edits retain existing assignments. Business timezone comes from the active business profile, with Asia/Kolkata as fallback.

## Booking assignments

| Method and path | Permission | Input and response |
| --- | --- | --- |
| `GET /bookings/{booking_id}/eligible-technicians` | `technicians.assignments.manage` plus `bookings.assign` or `bookings.reassign` for the requested mode | Returns a paginated advisory picker with service date, timezone and `requires_in_progress_override`. |
| `POST /bookings/{booking_id}/assign` | `bookings.assign` and `technicians.assignments.manage` | JSON `technician_id`, optional `note`. Returns `201` with the assignment. |
| `POST /bookings/{booking_id}/reassign` | `bookings.reassign` and `technicians.assignments.manage` | JSON `new_technician_id`, `reassignment_reason`, optional `administrative_note` and `allow_in_progress`. Returns `201` with the replacement. |
| `POST /bookings/{booking_id}/unassign` | `bookings.unassign` and `technicians.assignments.manage` | Optional `reason` and `allow_in_progress`. Returns the ended assignment. |
| `GET /bookings/{booking_id}/assignments` | `technicians.assignments.read` | Paginated assignment history. |
| `GET /technicians/{id}/assignments` | `technicians.assignments.read` | Paginated assignment history for that technician. |
| `GET /technicians/workload` | `technicians.assignments.read` and `technicians.availability.read` | Paginated technician workload cards. |

The picker accepts `mode=assign|reassign` (default assign), `search` (name substring), `page` and `page_size`. Results are sorted by name and ID and contain technician ID, name, city and scheduled times. Reassignment excludes the technician whose assignment is being replaced. The write rechecks eligibility, booking state and permissions under locks.

Assignment history filters accept `assignment_status`, `date_from`, and `date_to` (inclusive requested service dates) and `sort=newest|oldest|completed`. Assignment records contain assignment, booking, technician, and assigning admin IDs, booking reference, technician name, service date, status, milestone timestamps, `ended_at`, `ended_by_admin_id`, `replaces_assignment_id`, reasons, and notes. Workload accepts technician list filters plus `date_from` and `date_to` for counts by requested service date. Effective availability always describes the current business-local time. Count fields are `active_assignments`, `completed_assignments`, `rejected_assignments`, and `cancelled_assignments`.

An initial assignment requires a confirmed booking, an active technician with explicit availability for the service date, and no approved leave. If a same-day schedule has already ended, assignment is unavailable. Without time slots the system allows one active assignment per technician per service date and one current assignment per booking. Partial unique indexes protect both rules. Booking and technician locks, assignment writes, booking history, and administrative audits are transactional.

Assignment moves the booking to `assigned`. Acceptance is a separate future technician action. Reassignment ends the active record as `reassignment_required`, adds a linked replacement, and keeps the previous record. Unassigning marks the assignment `cancelled` and returns the booking to `confirmed` for review. A started job requires explicit JSON `allow_in_progress: true` and a reason before either action. Neither action completes or cancels the booking. Booking status history preserves each actual change, and milestone fields retain the first recorded timestamp. The Phase 7 admin booking views now return `current_assignment` when present. Ordinary admin status edits cannot bypass the assignment workflow.

Owner has all permissions. Admin can read and manage profiles, availability, leave, and assignments. Owner alone can activate or deactivate a technician. Staff retains existing booking access with the current assignment summary, while technician management and assignment history require separate permissions. Audit logs store actor, action, resource, and safe metadata. Reasons and notes remain on their operational records.

## Future technician application

See the [proposed technician client contract](./technician-client.md) for the reserved routes, schemas and identity boundary.

The internal workflow service supports scoped job reads, acceptance, rejection, start, completion, and reporting inability to complete. Job reads return active assignments belonging to the technician and only the contact, location, and instructions needed for the job. Future callers must derive the technician ID from a dedicated technician session and enforce ownership before supplying it. Rejection or inability to complete returns the booking to confirmed. Starting and completing update both records and record technician attribution on booking history. Technician job transitions have no HTTP routes in this phase.

Future technician credentials and refresh sessions should use separate tables linked to `technicians.id`, a dedicated signer, issuer, audience, and token type. Provision them through an authorized administrative process and revoke them independently. Keep their permissions limited to assigned work. The migration enables RLS and revokes public table privileges on the new tables. Existing bookings and status events are retained.
