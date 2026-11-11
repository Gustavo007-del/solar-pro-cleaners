# Saved addresses and coverage

The Expo app can keep using inline booking addresses. Saved addresses are optional, scoped to the authenticated customer, and independent of booking snapshots. No location request is performed by the backend.

## Saved-address API

Paths below are relative to `/api/v1`. Use the Phase 2 customer bearer token.

| Method and path | Request | Response |
| --- | --- | --- |
| `POST /customers/me/addresses` | Full address with optional `label` and `is_default` | `201` saved address details |
| `GET /customers/me/addresses` | Optional `page` and `page_size` | Page of address cards, with the default first, then newest first |
| `GET /customers/me/addresses/{address_id}` | Saved address UUID | `200` saved address details |
| `PATCH /customers/me/addresses/{address_id}` | At least one editable field | `200` updated details |
| `DELETE /customers/me/addresses/{address_id}` | Saved address UUID | `204`. Deleting a default leaves no default. |
| `PUT /customers/me/addresses/{address_id}/default` | Saved address UUID, no body | `200` details of the selected default |

A full address requires `address_line` and `location_source`. Optional fields are `address_line_2`, `recipient_name`, `recipient_phone`, `locality`, `city`, `district`, `state`, `postal_code`, `landmark`, `latitude`, and `longitude`. Recipient phone uses the same Indian mobile normalization as customer profiles. PIN codes are six-digit strings when known. Blank address fields are invalid. Use null to omit or clear an optional field.

Supported sources are `manual`, `gps`, and `gps_with_manual_address`. GPS sources require both coordinates. Manual addresses omit both. The API accepts decimal strings or JSON numbers and stores coordinates rounded to eight decimal places. PATCH preserves omitted fields, validates the resulting address, and leaves coordinates intact when text changes. Text edits on a GPS address mark it as `gps_with_manual_address` unless a source is supplied. To switch to manual, send `location_source: "manual"` with both coordinates null.

List cards contain `id`, `label`, `address_line`, `locality`, `city`, `postal_code`, `location_source`, `is_default`, `created_at`, and `updated_at`. Details also include the rest of the address fields and `google_maps_url`. Coordinates serialize as JSON numbers or null, and timestamps use ISO 8601. A valid coordinate pair yields a Maps URL. A manual address has a null URL. [Google Maps URLs](https://developers.google.com/maps/documentation/urls/get-started)

Default changes run in a transaction under the customer lock, and a partial unique index enforces one default per customer. Creating without the flag does not implicitly pick a default. Unknown and other customers' IDs share the same `404`. Requests with invalid fields or inconsistent coordinate and source combinations return the shared `422` error response.

## Coverage precheck

`POST /api/v1/locations/check-coverage` uses customer authentication and accepts a JSON object containing any of `postal_code`, `locality`, `city`, `district`, `state`, `latitude`, and `longitude`. A coordinate pair is optional and is validated if supplied. The endpoint performs no write. It returns:

- `is_covered` and `requires_manual_confirmation` as booleans.
- `match_type` as `postal_code`, `locality`, `city`, `district`, or `unmatched`.
- `matched_service_area_id` and `matched_service_area_name`, null when unmatched.
- A human-readable `message`.

The check reuses active Phase 3 service areas and their exact PIN and qualified text matching. Coordinates alone produce an unmatched result that requires confirmation. A false coverage flag means the configuration did not establish a confident match. The legacy public service-area endpoint retains its existing nullable coverage semantics. Booking creation evaluates coverage again using the effective address.

## Booking integration

On `POST /api/v1/bookings`, send exactly one of:

- `address` with the full address fields, as in Phase 4.
- `saved_address_id` for an owned saved address, optionally with `address_overrides` containing changed address fields. Omitted override fields preserve saved values. Explicit null clears optional values. Overrides apply only to the booking.

The server copies the resolved address into the existing booking snapshot within the creation transaction, including optional second line and recipient details. Those fields are returned inside booking `address` alongside the existing Maps URL. The snapshot has no foreign key to the saved address. Older booking rows retain their original values, with null for the new optional fields. Idempotent retries resolve the original booking before looking up the saved address.

Continue requesting foreground GPS only on the customer's explicit action. For a new address, map the mobile form's formatted address into `address_line`, send the edited GPS source when applicable, and display the returned Maps URL only when present. A saved-address picker can load list cards first and fetch details on selection. The authenticated booking detail remains the source for historical locations.

The migration enables row-level security on saved addresses and revokes public table privileges. The internal admin booking-location reader is available for a future authorized dashboard. The public API exposes no administrative location operations.
