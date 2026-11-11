# Administrative authentication

Admin authentication has its own user and session tables, signing secret, issuer, audience, and `admin_access` token type. Every protected operation checks the live session and active account. The backend derives permissions from the current database role. Customer tokens cannot authorize admin routes, and admin tokens cannot authorize customer routes.

## Initial owner

Apply the administrative migration before provisioning. Inject `ADMIN_BOOTSTRAP_NAME`, `ADMIN_BOOTSTRAP_EMAIL`, and `ADMIN_BOOTSTRAP_PASSWORD` through a private operator environment. From the backend directory use:

```text
python -m app.bootstrap_owner
```

The command creates the first owner and records the operation in the audit log. Repeating it when an owner exists leaves the account unchanged. A database constraint permits only one owner and requires that account to be active. Remove the temporary bootstrap variables after provisioning. Bootstrap does not reset a password. Owner recovery requires a separate, controlled process.

Set `ADMIN_JWT_SIGNING_SECRET` separately from the customer key. It needs at least 32, 48, or 64 UTF-8 bytes for HS256, HS384, or HS512 respectively. Generate it with a cryptographic random generator. Leave it unset to keep admin authentication unavailable. Rotating the secret invalidates existing admin access and refresh credentials. Admin JWT lifetimes default to 10 minutes. Refresh families expire after seven days by default and retain the original deadline through rotation.

## Endpoints

Paths below are relative to `/api/v1/admin`. Protected requests use `Authorization: Bearer <access_token>`. JSON bodies reject unexpected fields.

| Method and path | Access | Input | Success |
| --- | --- | --- | --- |
| `POST /auth/login` | Public | `email`, `password`, optional `transport` (`token` by default, or `cookie`) | `200` authentication object |
| `POST /auth/refresh` | Refresh credential | JSON `refresh_token` in token mode, or the refresh cookie and no token body in cookie mode | `200` authentication object with rotated credentials |
| `POST /auth/logout` | Admin bearer | No body | `200` with `{"status":"ok"}`, current session revoked |
| `POST /auth/logout-all` | Admin bearer | No body | `200` with `{"status":"ok"}`, all sessions revoked |
| `POST /auth/change-password` | Admin bearer | `current_password`, `new_password` | `200` authentication object for a replacement session. All previous sessions are revoked. |
| `GET /me` | Admin bearer | No body | `200` profile with current permissions |
| `PATCH /me` | Admin bearer | `full_name` | `200` updated profile |
| `GET /users` | `admin.users.read` | Optional `page`, `page_size`, `search`, `role`, `is_active` query values | `200` page of user records |
| `POST /users` | `admin.users.create` | `full_name`, `email`, `password`, `role` (`admin` or `staff`) | `201` new user record |
| `GET /users/{admin_id}` | `admin.users.read` | Admin UUID | `200` user record |
| `PATCH /users/{admin_id}` | `admin.users.update` plus role or state permission when applicable | Non-empty subset of `full_name`, `email`, `role` (`admin` or `staff`), `is_active` | `200` updated user record |
| `POST /users/{admin_id}/deactivate` | `admin.users.deactivate` | Admin UUID, no body | `200` inactive user record. Repeated deactivation returns the current state. |

An **authentication object** has `admin` (profile) and `tokens` containing `access_token`, `refresh_token` (string in token mode, null in cookie mode), `token_type` (always `bearer`), `expires_in` (seconds), and `refresh_expires_at` (ISO 8601). User records include `id`, `full_name`, `email`, `role`, `is_active`, `last_login_at`, `created_at`, and `updated_at`. A profile adds `permissions` as a sorted string array. User pages contain `items`, `page`, `page_size`, and `total`.

Success and error responses use `Cache-Control: no-store`. The shared `error` envelope contains a code, message, and request ID. Invalid email/password combinations and invalid sessions return generic `401` responses. Insufficient permissions or a rejected browser origin return `403`. Duplicate administrative email and protected owner-state changes return `409`. Invalid inputs return `422`. Throttling returns `429` with `Retry-After`. Authentication without an admin signing key returns `503` once a valid request reaches credential processing.

## Permission matrix

The [admin operations contract](./admin-operations.md#authorization-and-errors) describes the additional booking, customer, and dashboard permissions introduced in Phase 7.

| Role | Permissions |
| --- | --- |
| Owner | All administrative permissions, including user administration, role management, operational permissions, and business configuration |
| Admin | `bookings.read`, `bookings.update`, `customers.read`, `services.read`, `services.manage`, `locations.read`, `locations.manage` |
| Staff | `bookings.read`, `services.read`, `locations.read` |

Use `AuthenticatedAdmin` for identity-only routes and `require_permission(Permission.…)` for role-gated routes. User-management writes recheck permissions while holding the actor's row lock. The ordinary API provisions admin and staff accounts only. The owner's role and active status are protected, including from self-deactivation. Email, role, or active-state changes revoke the target's sessions. Operational permission names prepare later feature routes.

## Next.js session transport

- **Browser cookie mode** uses `transport: "cookie"` during login and credentialed requests. Configure exact `ADMIN_BROWSER_ORIGINS` and include those origins in `ALLOWED_CORS_ORIGINS`. Use a same-site HTTPS deployment so `SameSite=Strict` can deliver the host-only cookie. Cookie-mode login, refresh, logout, and password change enforce the Origin allowlist. The refresh cookie is HttpOnly, scoped to the admin authentication path, and Secure by default. Keep the access token in memory.
- **Server-side token mode** returns the refresh token to the trusted Next.js server. Keep it in a server-side session store. If the dashboard uses its own browser session cookie, manage its security at the dashboard boundary. Keep refresh tokens out of browser localStorage.
- Serialize refresh requests and replace the previous credentials on success. A rotated refresh token is revoked. Its replay revokes the active descendant in that family. An access token tied to the old session becomes invalid when its refresh credential is rotated, revoked, or expired. If the response is lost after rotation, sign in again. Password change issues a new session in the original transport. [RFC 9700 replay protection](https://www.rfc-editor.org/rfc/rfc9700.html#section-4.14.2)

## Operational notes

Passwords use Argon2id with a 64 MiB memory cost, three iterations, and one lane. The configurable minimum defaults to 15 characters, and the maximum is 128. The backend applies the same policy during provisioning, account creation, and password changes. [Argon2-cffi password hashing](https://argon2-cffi.readthedocs.io/en/stable/howto.html)

The database shares short-lived login counters across workers. Defaults allow five attempts per source and email pair, 30 per source, and 20 per normalized account in a five-minute window. Caps reset automatically. Counter keys are HMAC digests. Configure trusted proxy handling so the source represents the client, and use ingress limits to absorb request floods. Schedule removal of expired throttle buckets and define retention for audit events. Retain rotated refresh digests at least until their family expires so replay detection continues to work.

Audit entries include the action, actor and resource IDs where known, timestamps, and role changes when relevant. Failed logins are recorded without email or raw IP. Audit and request logs exclude password and token values. The migration enables RLS and removes public table privileges. Access to the admin tables requires the trusted backend database role.
