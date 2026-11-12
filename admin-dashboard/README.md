# Solar Care Operations

The dashboard is an independent Next.js App Router application. It uses React, TypeScript, Tailwind CSS, shadcn/ui primitives, Lucide, Recharts, TanStack Query and Table, React Hook Form, and Zod. The package lock belongs to this project.

## Run and deploy

1. Run `npm ci` from this directory with Node.js 20.9 or newer. Copy `.env.example` to `.env.local`.
2. Set `NEXT_PUBLIC_API_BASE_URL` to the full versioned FastAPI base. `API_BASE_URL` can override it on the Next.js server. Set `DASHBOARD_ORIGIN` to the exact dashboard origin.
3. On FastAPI, add that origin to both `ADMIN_BROWSER_ORIGINS` and `ALLOWED_CORS_ORIGINS`. Configure database access, migrations, and owner provisioning using the [backend runbook](../backend/docs/deployment.md) and [admin authentication contract](../backend/docs/admin-auth.md).
4. Use `npm run dev` locally. For a separate HTTPS deployment, build with `npm run build` and serve with `npm start`. Production requires HTTPS for the dashboard and upstream. Keep `ADMIN_COOKIE_SECURE=true` on FastAPI in deployed environments. Use a disposable backend with `ADMIN_COOKIE_SECURE=false` only for loopback HTTP development.

The dashboard proxies selected FastAPI operations through the same browser origin. Login uses FastAPI cookie mode. The refresh cookie remains HttpOnly, SameSite=Strict, and scoped to `/api/v1/admin/auth`. Access tokens stay in browser memory, and browser tabs coordinate refreshes using Web Locks and BroadcastChannel when available. Writes require the configured Origin. FastAPI enforces session validity and permissions. The proxy uses the backend-visible source address for throttling. Configure trusted ingress separately if deploying with client-IP forwarding.

## Modules

- **Dashboard** uses business-timezone summaries, booking trends, status distribution, registration activity, confirmed visits, and currently assigned booking updates. Metrics and navigation follow the signed-in permissions.
- **Bookings and assignments** include reference and customer search, filters, pagination, details, status history, cancellation, internal notes, technician eligibility, assignment, reassignment, removal, and assignment history.
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
