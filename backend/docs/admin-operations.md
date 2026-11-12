# Administrative bookings, customers, and dashboard API

Use the [admin authentication contract](./admin-auth.md). Paths below are relative to `/api/v1/admin`. Protected requests use an admin bearer token. Responses containing administrative data carry `Cache-Control: no-store`. User, booking, note, and customer lists use `items`, `total`, `page`, `page_size`, `total_pages`, `has_next`, and `has_previous`. Page numbering starts at 1, and page size defaults to 20 and is capped at 100.

An empty list has this shape.

```json
{"items":[],"total":0,"page":1,"page_size":20,"total_pages":0,"has_next":false,"has_previous":false}
```

## Booking operations

| Method and path | Permission | Request and success response |
| --- | --- | --- |
| `GET /bookings` | `bookings.read` | Filters below. Returns a page of booking cards. |
| `GET /bookings/{booking_id}` | `bookings.read` | Returns booking details and status history. |
| `PATCH /bookings/{booking_id}/status` | `bookings.update`, plus `bookings.cancel` when cancelling | JSON with `status` and optional `reason`. Returns updated details. |
| `PATCH /bookings/{booking_id}/follow-up` | `bookings.update` and `bookings.read` | Supply a missing `service_date`, `address`, or both on a pending booking. Returns updated details. |
| `POST /bookings/{booking_id}/cancel` | `bookings.cancel` | Optional JSON `reason`. Returns updated details. |
| `GET /bookings/{booking_id}/notes` | `bookings.notes.read` | `page`, `page_size`. Returns a page of private notes, newest first. |
| `POST /bookings/{booking_id}/notes` | `bookings.notes.create` | JSON `note`, 1–4,000 characters after trimming. Returns the created note with `201`. |
| `PATCH /bookings/{booking_id}/notes/{note_id}` | `bookings.notes.update` | JSON `note`. The author or owner may edit it. Returns the updated note. |
| `DELETE /bookings/{booking_id}/notes/{note_id}` | `bookings.notes.delete` | No body. Returns `204`. |

Booking list filters can be combined. Use `search` for a partial match on reference, customer snapshot name, or phone. The separate `reference`, `customer_name`, and `customer_phone` fields narrow the results. Other filters are `status`, `service_id`, `date_from` and `date_to` (requested service date), `created_from` and `created_to` (business-local creation date), `city`, `district`, and `postal_code`. City and district match case-insensitively. Date ranges are inclusive. Sort options are `newest` (default), `oldest`, `service_date` (ascending), and `updated` (newest update first).

`technician_id` filters the booking list to bookings currently assigned to that technician. Historical assignments remain available from the assignment history routes.

Cards include booking UUID, reference, customer UUID, original name and primary phone, service ID and original name, requested date, status and label, full address summary, timestamps, and the existing estimate and currency. Details extend the [customer booking detail schema](./bookings.md) with `customer_id`, `service_current_description`, `legacy_admin_notes`, and enriched `history`. The description is current catalogue information. Contact, address, pricing, and service name retain their booking-time values. `estimated_amount` is the existing estimate and remains null for quotes or unset prices. Time preference and technician fields are reserved for phases that supply those data.

History entries include `old_status`, `new_status`, `status_label`, `created_at`, `changed_by_type`, `changed_by_id`, `changed_by_name`, and `reason`. Private history reasons and legacy admin notes require note-read permission. A note record contains `id`, `booking_id`, `admin_id`, `note`, `created_at`, and `updated_at`. New notes are separate from customer instructions and never appear in the customer API.

Status changes use the existing transition graph. Confirmation requires a recorded date and location. Administrative cancellation is allowed from pending or confirmed. A cancellation reason is customer-visible, so use a private note for internal context. Use the [technician assignment endpoints](./technicians.md#booking-assignments) to assign or remove a technician. Start and completion for assigned work belong to the internal technician workflow. Legacy in-progress records without assignment history can still transition to completed through the admin status route. Status changes, history, and audit events commit atomically.

## Customer operations

| Method and path | Permission | Request and success response |
| --- | --- | --- |
| `GET /customers` | `customers.read` | Page of profiles with `total_bookings` and `last_booking_at`. Filters below. |
| `GET /customers/{customer_id}` | `customers.read` | Optional `address_page` and `address_page_size`. Returns profile, paginated saved addresses, booking counts, and the five newest booking cards. |
| `PATCH /customers/{customer_id}` | `customers.update` plus corresponding state permission if supplied | Non-empty subset of `full_name`, `phone_number`, `alternate_phone_number`, and `is_active`. Returns updated profile. |
| `POST /customers/{customer_id}/activate` | `customers.activate` | Optional JSON `reason` code. Returns active profile. |
| `POST /customers/{customer_id}/deactivate` | `customers.deactivate` | Optional JSON `reason` code. Returns inactive profile and revokes customer sessions. |
| `GET /customers/{customer_id}/bookings` | `customers.read` | The customer booking list filters and pagination. Returns that customer's booking cards. |

Customer list filters include `search` (case-insensitive name prefix or primary/alternate phone prefix), `is_active`, `registered_from`, `registered_to`, and `sort` (`newest`, `oldest`, `name`). Registration filters are business-local dates. `last_booking_at` is the creation timestamp of the most recently submitted booking, or null. Saved addresses are read-only here. Coordinates and their Maps URL require `locations.read`.

Profiles retain the Phase 2 schema and normalization. A changed primary number already used by another customer returns `409` for an administrative edit. Existing shared numbers and the existing mobile registration policy are preserved. Set `alternate_phone_number` to null to clear it. Account status reason codes are `customer_request`, `account_review`, `policy`, and `other`. Deactivation preserves prior bookings and addresses and invalidates live customer sessions. Activation permits fresh login. Repeating an already-applied activation or deactivation returns the existing state.

## Dashboard

- `GET /dashboard/summary` requires `dashboard.read`. Optional `start_date` and `end_date` must be supplied together. `recent_limit` defaults to 5 and supports up to 20. The response contains `timezone`, `reporting_period`, `booking_counts` by status, `total_bookings`, `total_customers`, `new_customers`, `bookings_today`, `bookings_this_week`, `bookings_this_month`, `recent_created`, `recent_updated`, and `recent_completed`. Booking totals default to all time. With an explicit range, those totals use the booking creation date and each activity list uses its respective timestamp. New registrations default to the last 30 calendar days. Total registered customers and today/week/month counters are independent of the selected range.
- `GET /dashboard/bookings-analytics` requires `dashboard.analytics.read`. Optional paired `start_date` and `end_date` default to the last 30 days and allow at most 366 inclusive days. Use `interval=day|week|month`. The response includes `timezone`, `reporting_period`, `interval`, `points`, `status_distribution`, `completed`, and `cancelled`. Each point has `period_start`, `total`, `completed`, `cancelled`, and `status_counts`. The series groups bookings by creation date and counts their current status. It includes zero buckets. Weekly buckets start Monday. No revenue metrics are returned.

Reporting uses the active business timezone, or `BUSINESS_TIMEZONE` if no profile is active (defaults to Asia/Kolkata). Status maps always contain all six statuses. For example, a zero-valued point is:

```json
{"period_start":"2026-11-11","total":0,"completed":0,"cancelled":0,"status_counts":{"pending":0,"confirmed":0,"assigned":0,"in_progress":0,"completed":0,"cancelled":0}}
```

## Authorization and errors

Owner has all permissions. Admin can read and update bookings, cancel bookings, read and create notes, edit their own notes, read and update customer contact details, and read both dashboard endpoints. Owner alone can delete notes, edit another author's note, and change customer account state. Staff can read bookings and dashboard summaries. Staff cannot read notes, customer profiles, or chart analytics. Existing catalogue and location permissions remain applicable.

Administrative audit events store actor and resource IDs, action, timestamp, and sanitized status, changed-field names, or reason codes where applicable. Audit metadata omits contact values, notes, and credentials. API errors use the shared envelope. Expected statuses include `401` for invalid sessions, `403` for missing permission, `404` for missing records, `409` for invalid transitions or duplicate primary phone edits, and `422` for invalid bodies and filters.
