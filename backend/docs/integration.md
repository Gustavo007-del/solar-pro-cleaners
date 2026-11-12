# Frontend integration

Expo and Next.js call the FastAPI JSON API at `/api/v1`. PostgreSQL stays behind the backend. The API owns identity, access, availability, pricing and workflow decisions. The future technician client will use the same API host with its own identity boundary.

## API reference and environments

Use `/docs` and `/api/v1/openapi.json` on a development backend. OpenAPI includes operation parameters, input and output schemas, bearer schemes, and required admin permissions in `x-required-permissions`. Operation descriptions identify additional checks that depend on the requested action. To generate a schema from the checkout without exposing it over a deployed server, run this from the backend directory with the Python requirements installed.

```sh
python -c "import json; from app.main import app; print(json.dumps(app.openapi(), indent=2))" > openapi.json
```

| Client | Configuration |
| --- | --- |
| Expo customer app | Set `EXPO_PUBLIC_API_BASE_URL` to the full versioned base, such as `https://api.example.com/api/v1`. Pass relative paths like `/customers/me` to `resolveApiUrl`. Development can use a reachable LAN or emulator host. Preview and production require HTTPS. |
| Next.js browser calls | Set `NEXT_PUBLIC_API_BASE_URL` to the public versioned base. Add the exact dashboard origin to both `ALLOWED_CORS_ORIGINS` and `ADMIN_BROWSER_ORIGINS` for cookie refresh. Serve dashboard and API on same-site HTTPS origins. |
| Next.js server code | Use a server-only variable such as `API_BASE_URL` where the browser does not need it. Keep secrets out of `NEXT_PUBLIC_*` and `EXPO_PUBLIC_*`. |
| Future technician app | Use the same versioned API base and a separate technician session. See the [proposed technician contract](./technician-client.md). |

See [backend deployment and TLS configuration](./deployment.md), [Expo environment variables](https://docs.expo.dev/guides/environment-variables/) and [Next.js environment variables](https://nextjs.org/docs/app/guides/environment-variables/).

## Customer app

The Expo app reads and writes customer profiles, saved addresses and bookings through this API. Historical records from a local-only build remain separate. A local reference does not identify a server booking.

| Screen or task | Routes relative to /api/v1 |
| --- | --- |
| Registration and session restore | `POST /customers/register`, `POST /customers/auth/login`, `POST /customers/auth/refresh` |
| Profile, account state and sign-out | `GET/PATCH /customers/me`, `GET /customers/me/account`, `POST /customers/auth/logout`, `POST /customers/auth/logout-all` |
| Home and catalogue | `GET /services`, `GET /services/{service_id}`, `GET /services/{service_id}/pricing` |
| Contact and business information | `GET /contact-us`, `GET /privacy-policy`, `GET /business`, `GET /business/operating-hours`, `GET /business/closures` |
| Service coverage and dates | `GET /service-areas`, `GET /service-areas/check`, `POST /locations/check-coverage`, `GET /availability` |
| Saved addresses | `GET/POST /customers/me/addresses`, `GET/PATCH/DELETE /customers/me/addresses/{address_id}`, `PUT /customers/me/addresses/{address_id}/default` |
| Booking and progress | `POST /bookings`, `GET /bookings/my`, `GET /bookings/{booking_id}`, `POST /bookings/{booking_id}/cancel` |

For registration, send `full_name`, `phone_number`, optional `alternate_phone_number`, and `installation_credential`. Generate the credential with 32 cryptographically random bytes encoded as 43 unpadded base64url characters. Store it in SecureStore before submitting. The response is `{ customer, tokens }`. Persist the rotating token pair together in SecureStore, and use one in-flight refresh per session. A lost registration response can be recovered using the same installation credential at login. If a refresh response is lost, use installation login. Reusing a rotated refresh token revokes its family. [Detailed customer session contract](./customer-auth.md) · [Expo SecureStore](https://docs.expo.dev/versions/v55.0.0/sdk/securestore/)

Send the access token as `Authorization: Bearer <access_token>`. On a protected 401, coordinate a single refresh and retry once with the new access token. Treat a failed refresh as a session recovery or sign-in flow. For a deliberate logout, clear the token pair and skip auto-restoration until sign-in is requested. The phone number is contact information, and recovery depends on the installation credential.

For bookings, send the service ID and panel quantity when required. The business-local requested date and location are optional. For a location, send either an address or an owned saved-address ID. Show absent dates and locations as awaiting confirmation. Generate an `Idempotency-Key` per intended submission and reuse it with the same body after a timeout. The server computes price and preserves service, contact, any supplied address and price snapshots. A successful initial submission returns 201. A matching replay returns 200 with the original booking. Use the returned ID for details and `history` for the timeline. Display the status enum through the app's locale dictionary and use `status_label` as a fallback.

The status set is `pending`, `confirmed`, `assigned`, `in_progress`, `completed`, and `cancelled`. Customer cancellation is available while pending. Administrative transitions and assignment changes follow the server rules and update history. [Booking payload examples and status rules](./bookings.md) · [Addresses, Maps URLs and coverage](./locations.md) · [Catalogue and business configuration](./business-configuration.md)

## Next.js dashboard

Log in at `POST /admin/auth/login` with email, password and `transport: "cookie"`. Send `credentials: "include"` for login, refresh and cookie-mode logout calls. Keep the access token in memory. The refresh cookie is Secure, HttpOnly and SameSite=Strict, scoped to the admin auth path. Refresh with a bodyless `POST /admin/auth/refresh`. Use a single in-flight refresh and coordinate refreshes across tabs if they share the cookie. After an ambiguous or rejected refresh, sign in again. Read the current role and permissions at `GET /admin/me`. Use permissions to control displayed actions, and handle 403 from the backend. [Admin authentication and account management](./admin-auth.md)

- Use `/admin/dashboard/summary` for counts and `/admin/dashboard/bookings-analytics?interval=day` for charts. Analytics accepts day, week or month. The reporting window uses the business timezone.
- Use `/admin/bookings` for search and filters, booking details, status changes, cancellation and notes. Assignment history is under `/admin/bookings/{booking_id}/assignments`. Private notes stay within admin permissions.
- Use `/admin/customers` for customer searches, details, address and booking history, and authorized account changes.
- Use `/admin/technicians` for profiles, schedule, leave, workload and assignment history. Fetch `GET /admin/bookings/{booking_id}/eligible-technicians?mode=assign` for a new assignment or `mode=reassign` for a replacement. Results are a preview. The write can return a conflict if availability or booking state changes. Refresh the picker after a conflict.

See [booking, customer and dashboard operations](./admin-operations.md) and [technician and assignment operations](./technicians.md) for the route and permission tables.

## Response conventions

- UUIDs are strings. Calendar dates are `YYYY-MM-DD` in business context. Timestamps are ISO 8601 with a timezone offset. Optional resource fields can be null.
- Booking and saved-address detail coordinates are JSON numbers or null. Older deployments returned decimal strings. During a rolling upgrade, accept both and normalize once. Request coordinates still accept numbers or decimal strings. Monetary values retain decimal strings or null and should use decimal-safe formatting. A GPS coordinate pair yields a free Google Maps URL.
- Collections take `page` and `page_size` (default 20, maximum 100) and return `items`, `total`, `page`, `page_size`, `total_pages`, `has_next` and `has_previous`. The first page of `GET /bookings/my` also returns the customer's `status_counts` across all statuses. Later pages return null for that field. Fixed-size operating hours and bounded dashboard series use their domain-specific response shapes. Use the supported filters and sort values shown in OpenAPI.
- API errors use `error.code`, `error.message` and `error.request_id`. Validation may include safe field paths such as `address.latitude`. Use the code for application decisions. Display the message where appropriate and retain the request ID for support.

```json
{
  "error": {
    "code": "validation_error",
    "message": "Check the required fields and the format of your request.",
    "request_id": "9d247653b6864a9dbac11134be8e9f1e",
    "details": [{"source": "body", "code": "required", "field": "phone_number"}]
  }
}
```

| Status | Client handling |
| --- | --- |
| 401 | Recover the session or request sign-in. |
| 403 | Show permission or browser-origin failure. |
| 404 | The resource is missing, inactive, or outside the caller's ownership scope. |
| 409 | Show the specific business error, such as duplicate registration, invalid transition or unavailable technician. Reload the relevant resource if state changed. |
| 413 / 422 | Reduce the payload or correct the indicated input. Coverage may also be returned as an advisory result in a successful response. |
| 429 | Wait for `Retry-After` in seconds before retrying. |
| 500 / 503 | Show a temporary failure and retain the request ID when available. Replay writes only under their documented retry rules. Ingress failures may have a platform response body. |
