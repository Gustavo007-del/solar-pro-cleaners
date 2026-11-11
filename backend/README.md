# Solar Care API

The Python backend lives beside the existing Expo app. It provides installation-based customer authentication, public business information, booking management, admin operations, and technician assignments. See the [production deployment runbook](./docs/deployment.md) for staging, production, migrations, ingress, and recovery.

## Architecture

| Path | Responsibility |
| --- | --- |
| `app/main.py` | Application factory, lifespan, middleware, and OpenAPI configuration |
| `app/core/` | Settings, SQLAlchemy engine and sessions, safe error responses, and structured logging |
| `app/api/` | Shared dependencies and versioned router |
| `app/modules/` | System and customer APIs, catalogue, pricing, service areas, business profile and schedule, availability, and future feature routers |
| `app/models/` | Shared declarative metadata, opt-in UUID and timestamp mixins, and model imports for migrations |
| `app/schemas/` | Reusable error and pagination schemas |
| `alembic/` | Migration environment, revision template, and versioned migrations |

As a feature grows, keep its routes, schemas, models, service logic, and any repository together in its module. Routes validate requests and serialize public schemas. Services own business rules and transaction boundaries. Repositories handle queries when that separation adds value. Keep shared infrastructure in `core` and register each new ORM model in `app/models/registry.py` for migration discovery.

## Configuration and API

`requirements.txt` defines the supported dependency ranges for Python 3.12 or 3.13. `.env.example` documents the server configuration. Backend settings read `backend/.env` and accept overrides from process environment variables. Staging and production require PostgreSQL with TLS, trusted hosts, and independent customer, admin and rate-limit secrets. Interactive API documentation is available in development.

- `GET /health` and `GET /api/v1/health` report process liveness.
- `GET /health/ready` and `GET /api/v1/health/ready` check PostgreSQL readiness.
- `/` links to the Privacy Policy and Contact Us pages. JSON is available at `/api/v1/privacy-policy` and `/api/v1/contact-us`.
- `GET /api/v1/info` returns the public API name and version.
- Development documentation is available at `/docs`, `/redoc`, and `/api/v1/openapi.json`.

Errors use an `error` envelope with a stable code, a safe message, and a generated request ID. Validation errors include safe source categories. Logs use UTC timestamps, request IDs, static route templates, status codes, and timing. Apply the same redaction policy to any separate ingress or hosting logs.

## Supabase and migrations

Set the database URL using the connection details for a dedicated PostgreSQL role. Use a direct connection where network connectivity permits or Supabase's session pooler for IPv4 connectivity. These modes use a bounded SQLAlchemy pool per worker. Size the pool and overflow against the total database connection budget across workers and replicas. Transaction-pooler mode uses `NullPool` and disables Psycopg automatic prepared statements. Supply a separate direct or session-pooled migration URL for that mode. Production defaults to TLS with `sslmode=require`. Configure the trusted CA and `sslmode=verify-full` for certificate and hostname verification. [Supabase connection modes](https://supabase.com/docs/guides/database/connecting-to-postgres)

Inject `DatabaseSession` into database-backed routes. A write service should use an explicit `session.begin()` transaction. The request dependency closes the session and releases its connection. [SQLAlchemy session transactions](https://docs.sqlalchemy.org/en/20/orm/session_transaction.html)

Alembic uses the same settings and `Base.metadata`. The revisions define customer accounts, installations, refresh sessions, business configuration, and bookings with address, price, and status history records. Autogeneration excludes unmanaged database tables. Intentional table drops need an explicit revision. Application startup initializes connection management and leaves schema changes to Alembic. [Alembic autogeneration](https://alembic.sqlalchemy.org/en/latest/autogenerate.html)

## Future clients

The [admin authentication and dashboard contract](./docs/admin-auth.md) documents the independent administrative trust boundary, owner provisioning, permissions, and browser session transport.
The [admin operations API](./docs/admin-operations.md) covers protected booking and customer management, private notes, and dashboard reporting.
The [technician and assignment contract](./docs/technicians.md) covers technician profiles, availability, leave, booking assignments, workload, and the future technician application boundary.

The [locations API and Expo integration contract](./docs/locations.md) covers customer-owned saved addresses, default selection, coverage checks, and booking address snapshots.

The Expo app currently uses local profiles and bookings. The customer API contract explains how to move credentials into SecureStore when connecting it. Future booking queries must scope data to the authenticated customer ID supplied by the backend dependency. Admin authentication will use a separate trust boundary.
