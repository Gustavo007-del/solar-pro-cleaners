# Service catalogue and business configuration

Phase 3 provides public read endpoints and an operator-only JSON seed command. The migration creates the tables without inserting business information, prices, coverage, or schedules. The Expo app can keep using its existing local content until the mobile integration phase.

## Public API contract

Paths below are relative to `/api/v1`. These GET endpoints use no customer token. Date and time values use ISO 8601. Paginated responses contain `items`, `page`, `page_size`, and `total`. Page defaults to 1, page size defaults to 20 and accepts up to 100.

| Endpoint | Inputs | Response |
| --- | --- | --- |
| `GET /services` | `page`, `page_size`, optional case-insensitive `search` across name and slug | Page of active services ordered by `display_order`, then `slug`. Items contain `id` (UUID), `name`, `slug`, `short_description`, `benefits` (array of strings), and `display_order`. |
| `GET /services/{service_id}` | UUID path parameter | Service summary fields plus `description`. Inactive and unknown services return `404`. |
| `GET /services/{service_id}/pricing` | UUID path parameter | Current `pricing_type`, `currency`, and configured amounts among `base_price`, `price_per_panel`, and `minimum_charge`. Amounts are decimal JSON strings. An active service without applicable pricing returns `200` with JSON `null`. Inactive and unknown services return `404`. |
| `GET /service-areas` | `page`, `page_size` | Page of active areas ordered by name and UUID. Items contain `id`, `name`, `match_type`, `postal_code`, `locality`, `city`, `district`, `state`, and `description`. Optional fields may be null. |
| `GET /service-areas/check` | `postal_code`, `locality`, `city`, `district`, `state`. Provide at least one of the first four. | `covered` is true for a configured match and null when confirmation is needed. Also returns `reason` (`matched`, `conflicting_pin`, or `no_confident_match`), `matched_area_id` (UUID or null), and `message`. |
| `GET /business` | None | `business_name`, `short_description`, `description`, `primary_phone`, `alternate_phone`, `support_email`, `website_url`, `whatsapp_number`, `business_address`, `city`, `district`, `state`, `postal_code`, `logo_url`, `privacy_policy_url`, `terms_url`, and `timezone`. Unconfigured optional fields are null. |
| `GET /business/operating-hours` | None | `timezone` and `days`. Each day contains `day_of_week` (0 Monday through 6 Sunday), `is_open`, `opening_time`, and `closing_time`. Times are local, without a UTC offset. A closed day has null times. |
| `GET /business/closures` | `page`, `page_size` | Paginated active closures from the current business-local date onward, with `timezone`. Each item contains only `closure_date`. |
| `GET /availability` | `service_id` (UUID), `requested_date` (YYYY-MM-DD in business time), and the same location inputs as the coverage check | `requested_date`, `timezone`, `service_active`, nested `coverage`, `business_operating`, `blocked_by_closure`, `manual_confirmation_required`, `reason`, and `message`. |

Business endpoints return `404` when an active profile is unavailable. Missing weekday rows indicate unconfigured hours. Invalid query input returns `422` using the shared error envelope. Database errors use the shared redacted responses. Availability treats unknown and inactive service UUIDs alike.

## Pricing and availability rules

- Fixed pricing requires `base_price`. Per-panel pricing requires `price_per_panel`. Both may have a configured `minimum_charge`. Custom quotations expose only their type and currency. Amounts are nonnegative, have up to two decimal places, and use PostgreSQL `NUMERIC(12, 2)`. The default currency is INR.
- Pricing windows start inclusively and end exclusively. Null boundaries are open-ended. When active periods overlap, the most recently started applicable row wins. An unbounded start has the lowest priority. Each service can have only one pricing row per start instant, including a null start. The public endpoint evaluates pricing at the current UTC instant.
- Coverage tries exact PIN, then locality, city, and district. Locality and city matches require the configured state and any configured district. Locality matches also require city. Text matching ignores case and normalizes Unicode and spacing. If a supplied PIN matches an active entry but conflicts with its configured address details, the result requires confirmation. A missing match is inconclusive. Coverage is based on configured addresses and PIN codes.
- An active closure overrides weekly hours. Omitted hours remain unknown. Availability reasons are `service_unavailable`, `past_date`, `closure`, `closed`, `confirmation_required`, and `candidate`, in that precedence order. A candidate means the coverage and operating configuration match. Both candidate and uncertain results require business confirmation. The evaluator reserves no appointment or capacity.

## Controlled initialization

Use PostgreSQL 15 or later for the pricing uniqueness rule. The migration enables RLS on all six tables and removes direct public grants. The seed operation requires a trusted connection with the required writes. A distinct non-owner backend role needs explicit privileges and RLS access. Keep that role out of the client app. [Supabase API security](https://supabase.com/docs/guides/api/securing-your-api)

Copy `business-config.example.json` to an operator-managed file such as `business-config.local.json`. The example is intentionally empty. Maintain separate owner-approved files and credentials for development and production. With the migration applied, the operator command from the backend directory is:

```text
python -m app.seed_business --file business-config.local.json
```

| JSON key | Record fields |
| --- | --- |
| `services` | Required `name`, lowercase hyphenated `slug`, `short_description`, and `description`. Optional `benefits`, `display_order`, and `is_active`. |
| `prices` | Required `service_slug` and `pricing_type`. Supply the applicable amount fields as decimal strings. Optional `currency`, `is_active`, `effective_from`, and `effective_until`. Timestamps require a UTC offset when supplied. |
| `service_areas` | Required `name` and `match_type`. Supply `postal_code` for `pin`, `locality` plus `city` and `state` for `locality`, `city` and `state` for `city`, or `district` and `state` for `district`. A district can further qualify city and locality coverage. Optional `description` and `is_active`. |
| `business` | A singleton object or null. The fields match the public business response, with optional `is_active`. Creating a profile requires `business_name`. Timezone defaults to `Asia/Kolkata`. Contact numbers use international format with a leading plus. Public links use HTTPS. |
| `operating_hours` | `day_of_week` and `is_open`. Open days require `opening_time` and `closing_time` on the same day. Closed days omit the times or set them to null. |
| `closures` | `closure_date`, optional internal `reason`, and optional `is_active`. No holidays are assumed. |

The seed is transactional and insert-only. It skips existing service slugs, price starts for a service, normalized coverage keys, the business profile, weekdays, and closure dates. Repeating the same file leaves existing rows intact. Changing a value under an existing key does not update that row. New pricing entries may take precedence according to the effective-period rule above.

## Future Expo, booking, and admin integration

- Home can combine the service catalogue, configured benefits, business profile, and active service areas. Contact and legal screens can use the public business fields. Booking can read applicable pricing and submit its address fields to the coverage and availability endpoints. Keep money as decimal strings when consuming the API.
- Booking services should re-evaluate active service, pricing, and location at submission time. Snapshot the applicable service and pricing fields in a future booking record so historical display survives catalogue changes.
- Protected admin writes can reuse the seed input validators and coverage-key normalization. Recompute the coverage key when editing match fields. Deactivate services and pricing rows where they may be referenced by booking history. Availability, payments, and booking confirmation remain separate operations.
