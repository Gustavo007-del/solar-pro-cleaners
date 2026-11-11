# Customer authentication and Expo integration

The installation credential is the proof of possession. A phone number is contact information and can be shared by multiple customers. This phase does not verify phone ownership. Losing the installation credential prevents automatic recovery of the same account. A future verified recovery mechanism needs its own design.

## API contract

All paths below use the default `/api/v1/customers` prefix. Send JSON for requests with a body and `Authorization: Bearer <access_token>` for protected endpoints.

| Method and path | Authentication | Request body | Response |
| --- | --- | --- | --- |
| `POST /register` | New installation credential in body | `full_name`, `phone_number`, `installation_credential`, optional `alternate_phone_number` and `installation_label` | `201` authentication response |
| `POST /auth/login` | Registered installation credential in body | `installation_credential` | `200` authentication response |
| `POST /auth/refresh` | Current opaque refresh token in body | `refresh_token` | `200` authentication response with replacement tokens |
| `POST /auth/logout` | Bearer | No body | `200` with `{"status":"ok"}` |
| `POST /auth/logout-all` | Bearer | No body | `200` with `{"status":"ok"}` |
| `GET /me` | Bearer | No body | `200` profile object |
| `PATCH /me` | Bearer | At least one of `full_name`, `phone_number`, `alternate_phone_number` | `200` updated profile object |
| `GET /me/account` | Bearer | No body | `200` account object |

An **authentication response** is an object with `customer` (the profile) and `tokens`. The token object contains `access_token` (signed JWT string), `refresh_token` (opaque string), `token_type` (always `bearer`), `expires_in` (access lifetime in seconds), and `refresh_expires_at` (ISO 8601 timestamp). Customer responses carry `Cache-Control: no-store`.

A **profile** contains `id` (UUID string), `full_name`, `phone_number`, `alternate_phone_number` (string or null), `is_active` (boolean), `created_at`, and `updated_at` (ISO 8601 timestamps). The **account** response contains only `id`, `is_active`, `created_at`, and `updated_at`.

Names are trimmed, limited to 100 characters, and accept Malayalam and other Unicode letters. Indian mobile numbers normalize to `+91` followed by ten digits. The backend accepts the local ten-digit form and the `+91`, `0091`, and bare `91` prefixes. Spaces and hyphens may separate digits. Omit the alternate number or send JSON `null` during registration. On PATCH, omission preserves an existing field and `null` clears the alternate number. Unexpected fields fail validation.

Errors use `{"error":{"code":"…","message":"…","request_id":"…"}}`. Validation failures may also include an `error.details` array of safe `source` and `code` objects with a field path when available.

| Status | Meaning |
| --- | --- |
| `401` | Invalid, expired, or revoked authentication, or an inactive account or installation. The error is generic. |
| `409` | This exact installation credential was already registered. Use installation login with the same credential. The response contains no profile or tokens. |
| `422` | Request validation failed. Correct the body and retry. |
| `503` | Authentication or PostgreSQL is unavailable. |
| `500` | Unexpected server failure. Use the request ID when contacting support. |

## Expo integration

1. Generate 32 bytes using Expo Crypto's cryptographic random generator. Encode them as canonical unpadded base64url, which produces 43 ASCII characters. Save the credential in Expo SecureStore before submitting registration so a lost response can be recovered through installation login. [Expo Crypto](https://docs.expo.dev/versions/v55.0.0/sdk/crypto/) · [Expo SecureStore](https://docs.expo.dev/versions/v55.0.0/sdk/securestore/)
2. Map the existing form fields to the API request. Use the server-issued customer ID for authenticated API operations. Existing AsyncStorage profiles are local records and do not establish a server session. Keep installation credentials, access tokens, and refresh tokens in SecureStore. Keep any non-authentication application data separate.
3. On success, persist the access and refresh tokens as a single SecureStore record and replace the pair together on rotation. Restore the session from SecureStore on reopening. Use the registered installation credential with `/auth/login` when a session is missing or expired.
4. Use a single in-flight refresh for all concurrent requests. Once it succeeds, use the new access token and refresh token. If the refresh response is lost or its persistence fails, use installation login to recover. Resending a consumed token is treated as replay and revokes its token family. [RFC 9700 refresh token replay protection](https://www.rfc-editor.org/rfc/rfc9700.html#section-4.14.2)
5. On logout, call the relevant protected endpoint and clear the saved token pair. The installation credential remains a login credential. To require a deliberate sign-in after logout, remember that local user choice separately and skip automatic restoration. Logout-all revokes current sessions for the customer while retaining the registered installations.

## Security and persistence

- Access JWTs are short lived (15 minutes by default) and scoped to a customer session. The backend checks the signature, issuer, audience, expiry, token type, and live session on protected requests. Rotation, logout, and deactivation invalidate the affected access tokens through the session lookup. Configure a separate issuer, audience, and signing boundary for future admin authentication.
- A refresh family has an absolute lifetime of 30 days by default from login or registration. Rotation keeps that deadline. Transactional customer-row locks and a unique partial index allow one active session per family. Presenting a rotated token revokes its family before the server returns `401`. Revoked token digests must remain available at least until their family expires to support replay detection.
- The database stores separate domain-prefixed SHA-256 digests for high-entropy installation credentials and refresh tokens. Token responses are the intended exchange of raw credentials. The backend validates the format and byte length of client credentials, while random generation is the client's responsibility.
- The Alembic revision enables RLS and revokes default customer-table privileges for public Supabase roles. Use a dedicated trusted backend connection with access to these tables. If the backend runs under a distinct non-owner database role, provision the required table privileges and role-specific RLS access for that backend role. Keep customer tokens and database credentials outside Supabase's public Data API. [Supabase API security](https://supabase.com/docs/guides/api/securing-your-api)
- Route-level request logging excludes body and authorization values. Apply request-size and rate limits at the public ingress for registration, login, and refresh before deployment. Never capture credential-bearing payloads in proxy or monitoring logs.
- `AuthenticatedCustomer` exposes `customer_id` from the validated session for future ownership queries. The internal deactivation service revokes that customer's sessions and blocks further login and refresh. Database foreign keys restrict deletion, leaving account deletion and retention to a future authorized workflow.
