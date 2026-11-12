# Solar Care Operations

The dashboard is an independent Next.js App Router application. It uses React, TypeScript, Tailwind CSS, shadcn/ui primitives, Lucide, Recharts, TanStack Query and Table, React Hook Form, and Zod. The package lock belongs to this project.

## Run and deploy

1. Run `npm ci` from this directory with Node.js 20.9 or newer. Copy `.env.example` to `.env.local`.
2. For local development, use `NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8000/api/v1` and `DASHBOARD_ORIGIN=http://localhost:3000`. `API_BASE_URL` overrides the upstream on the Next.js server. A host-only API URL gets the default `/api/v1` prefix. Use the full versioned URL when FastAPI has a custom prefix.
3. Configure local PostgreSQL, run `alembic upgrade head`, and provision an owner using the [backend runbook](../backend/docs/deployment.md) and [admin authentication contract](../backend/docs/admin-auth.md). For loopback HTTP development, set `ADMIN_COOKIE_SECURE=false` and set both `ADMIN_BROWSER_ORIGINS` and `ALLOWED_CORS_ORIGINS` to `["http://localhost:3000"]` on this development backend. From `backend`, start FastAPI with `python -m app.serve` in your Python 3.12 environment. With uv, use `uv run --python 3.12 --with-requirements requirements.txt python -m app.serve`.
4. Run `npm run dev` and open `http://localhost:3000/login`. Restart Next.js after editing `.env.local`. Production requires HTTPS for the dashboard and upstream. Keep `ADMIN_COOKIE_SECURE=true` on deployed backends and allowlist the deployed dashboard's exact HTTPS origin. Build with `npm run build` and serve with `npm start`.

The dashboard proxies selected FastAPI operations through the same browser origin. Login uses FastAPI cookie mode. The refresh cookie remains HttpOnly, SameSite=Strict, and scoped to `/api/v1/admin/auth`. Access tokens stay in browser memory, and browser tabs coordinate refreshes using Web Locks and BroadcastChannel when available. Writes require the configured Origin. FastAPI enforces session validity and permissions. The proxy uses the backend-visible source address for throttling. Configure trusted ingress separately if deploying with client-IP forwarding.

## Modules

- **Dashboard** uses business-timezone summaries, booking trends, status distribution, registration activity, confirmed visits, and currently assigned booking updates. Metrics and navigation follow the signed-in permissions.
- **Bookings and assignments** include reference and customer search, filters, pagination, status history, cancellation, internal notes, technician eligibility, and assignment history. Use **Record missing details** on a pending booking to save a date or location agreed with the customer. Once both are recorded, the booking can be confirmed and assigned.
- **Customers and technicians** include searchable directories, profiles, customer address and booking history, permitted account state changes, technician schedules, leave, and workload.
- **Reports** include booking volume and outcomes, service-filtered booking totals, customer registrations, and technician assignment counts. The booking chart uses the backend's booking-creation cohorts and their current status.
- **Administration** includes owner-controlled admin and staff accounts, self-profile updates, password change, and sign-out options.
- **Services, service areas, and business settings** use published read-only endpoints. Availability checks are advisory. Administrative catalogue and business write APIs, inactive catalogue listings, audit-log listing, notifications, an assignment activity feed, cross-service aggregate analytics, financial reporting, and exports require additional FastAPI support.

## Verification

Run `npm run typecheck` and `npm run build`. The integration runner starts Next.js and FastAPI with a new database in a disposable local PostgreSQL cluster. Set `TEST_POSTGRES_URL` to a loopback connection with database creation rights. From the backend directory, with its Python dependencies installed, run:

```text
python ../admin-dashboard/tests/run_integration.py
```

Use `--preview` to keep the local test servers open after the suite. The runner uses fixture accounts and removes its test database on exit.
