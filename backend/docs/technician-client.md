# Future technician client contract

This contract is reserved for the future technician app. The current API exposes technician and assignment management to admins. The existing internal workflow is ready to be called once a dedicated technician authentication boundary is implemented.

## Identity and access

Use `/api/v1/technician` on the same API host. Issue technician-scoped bearer tokens with an independent signing configuration, issuer, audience and session store. Derive the technician ID from the active session on every request. Customer tokens and admin tokens have their own validation boundaries. The technician credential and enrollment mechanism will be specified with technician authentication.

Revoke sessions when an account is disabled. Check current account state and scope all assignment reads and writes by both the authenticated technician and assignment ID. Return the same 404 for unknown, foreign and inactive assignments. Return 401 for invalid or revoked sessions. Technician app credentials belong in native secure storage.

## Proposed routes and schemas

All paths below are relative to `/api/v1/technician`. Fields are required unless marked optional or nullable.

| Proposed method and path | Request | Success response |
| --- | --- | --- |
| `POST /auth/login` | Dedicated technician login request, to be defined with enrollment | `{ technician: TechnicianProfile, tokens: TechnicianTokens }` |
| `POST /auth/refresh` | `{ refresh_token: string }` | The same authentication shape with rotated tokens |
| `POST /auth/logout` | Technician bearer | `{ status: "ok" }` |
| `GET /me` | Technician bearer | `TechnicianProfile` |
| `GET /assignments` | `page`, `page_size` | Standard page of `TechnicianJob`, sorted by service date then assignment ID |
| `GET /assignments/{assignment_id}` | Technician bearer | `TechnicianJob` |
| `POST /assignments/{assignment_id}/accept` | No body | `AssignmentActionResult` |
| `POST /assignments/{assignment_id}/reject` | Optional `{ note: string }` | `AssignmentActionResult` |
| `POST /assignments/{assignment_id}/start` | No body | `AssignmentActionResult` |
| `POST /assignments/{assignment_id}/complete` | Optional `{ note: string }` | `AssignmentActionResult` |
| `PUT /assignments/{assignment_id}/notes` | `{ note: string }` | 204 |

- `TechnicianProfile` contains `id` (UUID), `full_name`, `primary_phone` and `employment_status` (the [technician employment enum](./technicians.md#technician-profiles)).
- `TechnicianTokens` contains `access_token`, `refresh_token`, `token_type: "bearer"`, `expires_in` (seconds) and `refresh_expires_at` (ISO 8601 timestamp).
- `TechnicianJob` uses the existing projection. It contains `id` (assignment UUID), `booking_id`, `booking_reference`, `service_date`, `service_name`, `assignment_status`, `customer_name`, `customer_phone`, `address` and nullable `customer_instructions`. The address uses the booking address snapshot with optional numeric coordinates and a Maps URL. Recipient name and phone are suppressed in that nested object. Keep administrative notes, audit data and other customer account information private.
- `AssignmentActionResult` contains `id` (assignment UUID) and `assignment_status` (the resulting enum). A terminal transition removes the job from active reads, so the action response carries its result directly. Notes replace the current operational note and must contain 1–2,000 characters after trimming.

## Transitions and service reuse

| Action | Allowed assignment state | Result |
| --- | --- | --- |
| Accept | `assigned` | `accepted`. Booking stays assigned. |
| Reject | `assigned`, `accepted` | `rejected`. Booking returns to confirmed. |
| Start | `accepted` | `in_progress`. Booking moves to in progress. |
| Complete | `in_progress` | `completed`. Booking completes. |
| Replace note | `assigned`, `accepted`, `in_progress` | Saves the note without moving the workflow. |

Reuse `list_technician_jobs`, `read_technician_job`, `transition_technician_assignment` and `save_technician_job_note` from `app/modules/technicians/workflow.py`. The transition service locks the booking and technician, checks ownership and state, and updates the booking timeline in the same transaction. Invalid transitions and booking/assignment conflicts return 409. The existing service supports `reassignment_required` with a reason. That exception path remains internal to the workflow until a client action is agreed.
