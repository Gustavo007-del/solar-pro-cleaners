# Customer booking API

The booking routes use the Phase 2 customer bearer token. The backend derives ownership from the live session. A booking ID belonging to another customer returns the same `404` as an unknown ID.

## Endpoints

Paths below are relative to `/api/v1`. Requests with bodies use JSON. Success responses use `Cache-Control: no-store`.

| Endpoint | Request | Response |
| --- | --- | --- |
| `POST /bookings` | Creation body and optional `Idempotency-Key` header | `201` booking details. An identical retry returns `200` with the existing booking's current details. |
| `GET /bookings/my` | Optional `page`, `page_size`, `sort` (`newest` or `oldest`), `status`, `date_from`, `date_to`, and `reference` | Page of the current customer's booking cards with shared pagination metadata. Date filters are inclusive requested service dates. Reference search is case-insensitive and partial. |
| `GET /bookings/{booking_id}` | Booking UUID | `200` details for the owned booking. |
| `POST /bookings/{booking_id}/cancel` | Booking UUID and optional body with `reason` | `200` updated details and appended cancellation history. Only pending bookings are eligible. |

The supported statuses are `pending`, `confirmed`, `assigned`, `in_progress`, `completed`, and `cancelled`. Sort order uses the creation timestamp with the booking ID as a stable tie-breaker. Page size defaults to 20 and is capped at 100.

`GET /bookings/my` includes `status_counts` on page one, with totals across all statuses for the authenticated customer. Counts are independent of the requested filters. Later pages return null for that field.

### Creation body

The inline address contract below remains supported. See the [locations contract](./locations.md) for selecting a saved address or applying one-time overrides.

| Field | Type and meaning |
| --- | --- |
| `service_id` | UUID from the active service catalogue. |
| `service_date` | Requested business-local date in YYYY-MM-DD form. |
| `address.address_line` | Required complete readable installation address, up to 800 characters. |
| `address.locality`, `city`, `district`, `state`, `landmark` | Optional address fields. Supply available locality data for better coverage matching. |
| `address.postal_code` | Optional six-digit Indian PIN code string. |
| `address.location_source` | `gps`, `manual`, or `gps_with_manual_address`. |
| `address.latitude`, `address.longitude` | Both required for GPS sources. Manual addresses omit both or set both to null. Decimal strings or JSON numbers are accepted and rounded to eight decimal places. |
| `pricing.panel_quantity` | Integer from 1 through 10,000. Required when per-panel pricing applies. The `pricing` object can be omitted when no quantity is needed. |
| `customer_instructions` | Optional nonblank string up to 500 characters. |

The body rejects unexpected fields. Customer identity and contact snapshots come from the authenticated profile. The backend generates the reference, assigns the initial status, and computes any estimate. The optional cancellation reason is also limited to 500 characters.

### Response fields

- A **booking card** contains `id`, `booking_reference`, `service_id`, `service_name`, `service_date`, `status`, `status_label`, `estimated_amount`, `currency`, `created_at`, and `address_summary`.
- **Booking details** include every card field and `customer` (`full_name`, `phone_number`, `alternate_phone_number`), `address` (address fields plus `google_maps_url`), and `pricing` (`pricing_type`, `base_price`, `price_per_panel`, `minimum_charge`, `panel_quantity`, `estimated_amount`, `currency`). Details also include `customer_instructions`, `coverage_matched`, `updated_at`, `confirmed_at`, `assigned_at`, `started_at`, `completed_at`, `cancelled_at`, `cancellation_reason`, and ordered `history`.
- A **history item** contains `old_status` (null at creation), `new_status`, `status_label`, and `created_at`. Unreached milestones have null timestamps. Private notes, actor IDs, pricing row IDs, and idempotency hashes are internal.
- IDs and monetary amounts serialize as strings. Coordinates serialize as numbers or null. Dates and timestamps use ISO 8601. Optional values may be null. Manual bookings have a null Maps URL. GPS bookings include the free Maps URL for their stored coordinates. [Google Maps URLs](https://developers.google.com/maps/documentation/urls/get-started)

Errors use the Phase 1 `error` envelope. Common cases are `401` for invalid authentication, `404` for an unavailable service or inaccessible booking, `422` for a past date, invalid payload or missing per-panel quantity, and `409` for a blocked date, idempotency conflict, or ineligible cancellation.

## Submission, pricing, and status

Creation checks the active service, coverage, and business schedule in the same transaction as the booking write. Past dates, closed weekdays, and configured closures are rejected. Inconclusive coverage and unconfigured hours can produce a pending request for business review. An accepted request records a requested date and awaits business confirmation. It does not reserve a time slot.

Pricing is selected at submission time using Phase 3 effective periods. A fixed estimate uses the configured base price, and a per-panel estimate multiplies the rate by the panel quantity. A configured minimum applies to either estimate when higher. Custom quotes and services without applicable pricing have a null estimate. Estimates are informational. Stored snapshots preserve the service name, contact details, address, pricing configuration and estimated amount even after catalogue or profile edits.

References use the format `SC-XXXX-XXXX-XXXX` with a random 32-character alphabet that omits visually ambiguous letters. A unique database constraint and bounded retries handle collisions.

Use an optional opaque `Idempotency-Key` of 1–128 ASCII letters, digits, dots, underscores, hyphens, or tildes, starting with a letter or digit. The key is scoped to the authenticated customer. The backend stores hashes of the key and validated request. Matching retries reuse the booking, even if the service configuration later changes. Reusing a key for a different request returns `409`. Without a key, each successful submission is a separate request.

Creation and cancellation lock the customer row and revalidate the session. Cancellation and future administrative status changes lock the booking row. A booking, its snapshots, and its initial history event commit together. Each subsequent transition updates its milestone and appends history in the same transaction. The status timeline reads the booking and history together.

Customer cancellation starts with pending bookings only. Administrative transitions are internal service functions for a future authorized caller. The lifecycle is pending → confirmed → assigned → in progress → completed, with cancellation from pending or confirmed. Completed and cancelled bookings are terminal. The transition graph anticipates technician assignment, but the admin service leaves assignment unavailable until that feature exists. Admin listing, search, filters and note updates have no public routes.

## Expo integration

- Keep the existing local booking experience until the mobile integration phase. A local booking UUID or reference remains a local identifier. A successful API response supplies the backend UUID and reference used for future reads and cancellation.
- Add a requested service date and ask for panel quantity when applicable. Map the formatted address to `address_line`. Map edited GPS addresses to `gps_with_manual_address`. Pass the stored address fields and coordinate pair and omit any local Maps URL, local customer snapshot, or computed price.
- Generate one idempotency key per logical submission, such as a UUID. Retain the key with its request while a response is uncertain. Retry the same payload with the same key, including after a successful token refresh. Use a new key for a deliberately new request.
- Load history from `/my`, then use the server booking ID for details. Prefer the returned history events for the timeline. Format money from the decimal strings and show a blank or quotation state for a null estimate. Display server and local records according to their actual origin. A local record becomes a server booking only after an explicit successful submission.
- The Alembic migration creates four booking tables with restrictive foreign keys and row-level security. Public Supabase roles have no table privileges. The trusted backend database role needs the appropriate read, write, and locking privileges. Deactivation preserves history. A separate authorized retention workflow can govern any future deletion.
