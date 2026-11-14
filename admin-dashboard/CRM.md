# Solar Care landing page and CRM

The dashboard serves the public landing page at `/`, and administrators sign in at `/login`. The landing page uses the existing business contact API, service-area catalogue, and public privacy policy. Set `NEXT_PUBLIC_TERMS_URL` to your approved HTTPS terms page to publish that footer link. The hero photograph is an illustration of the service generated with the built-in image tool.

| Dashboard route | Purpose |
| --- | --- |
| `/crm`, `/crm/analytics` | Overview and charts |
| `/crm/leads`, `/crm/leads/new`, `/crm/leads/[id]` | Directory, creation, and lead workspace |
| `/crm/follow-ups`, `/crm/calls` | Follow-ups and call history |
| `/crm/import`, `/crm/sources` | File import and source configuration |

All CRM APIs are under `/api/v1/admin/crm`.

| Path | Methods |
| --- | --- |
| `/overview`, `/staff`, `/events`, `/follow-ups` | GET |
| `/sources`, `/leads` | GET, POST |
| `/leads/{lead_id}` | GET, PUT |
| `/leads/{lead_id}/customer-matches` | GET |
| `/leads/{lead_id}/status`, `/notes`, `/interactions`, `/follow-ups`, `/convert` | POST, with the same lead prefix |
| `/leads/bulk` | POST |
| `/follow-ups/{follow_up_id}/{action}` | POST for complete, cancel, or reschedule |
| `/import/{action}` | POST for preview or confirm |

The browser maps CSV/XLSX columns locally and submits batches of up to 100 mapped rows for server validation. Filtered CSV export uses authenticated lead pages, is limited to 5,000 records, and escapes formula-like cell values. Staff can access leads assigned to them. Owners and admins can manage assignments, sources, imports, bulk changes, and conversion.

Conversion matches an active customer by phone and can link a booking or create a pending booking through the shared booking rules. Customers without a match register through the existing app flow. The CRM records who made each conversion.

Apply Alembic revision `20261113_0011` before deploying the new API and dashboard. It adds `crm_sources`, `crm_leads`, `crm_events`, and `crm_follow_ups`. Existing customer and booking tables require no schema change. Sign in again if an existing dashboard session has cached the previous permissions.
