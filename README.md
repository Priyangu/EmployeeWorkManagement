# Employee Work Management

A multi-tenant SaaS platform for employee task management, scheduling, time
tracking, and planned-vs-actual work intelligence. See
[`docs/architecture.md`](docs/architecture.md) for the full architecture,
ERD, API spec, and milestone plan.

## Status

**Phase 5 & 6 — Projects, Task Categories & Tasks.** The Project module supports full CRUD, a validated status lifecycle (PLANNED → ACTIVE → ON_HOLD → COMPLETED/CANCELLED with terminal-state freeze, so a finished project can never be silently reopened), date/budget fields, project-manager assignment to an org employee, and customer/status filtering. Task Categories are a lightweight per-organisation dropdown list with duplicate detection. The Tasks module adds create/update/assign with an auditable assignment history, a workflow-transition gateway (`/start`, `/pause`, `/resume`, `/complete` — terminal COMPLETED/CANCELLED tasks are locked), comments, and attachment metadata, all behind the Auth → Tenant → Roles guard chain with assignee-or-writer enforcement on workflow actions. All endpoints are tenant-scoped by construction.

**Phase 7 — Scheduling.** The Scheduling module adds `GET /schedule` (week-window listing with `employeeId` filter), `POST /schedule`, `PATCH /schedule/:id` (move/reassign for drag-reschedule), and `DELETE /schedule/:id`, all tenant-scoped behind the Auth → Tenant → Roles chain (reads open to any org member, writes restricted to ORG_ADMIN/MANAGER/TEAM_LEAD). Overlaps for the same employee surface as `overlaps` + `conflictIds` warning flags, never hard errors. The web `/schedule` page renders a no-dependency week grid (rows = employees, columns = Mon–Sun) with Move/Remove controls and a create form converting local time to UTC ISO-8601.

| Phase | Milestone | Status |
|---|---|---|
| 1–3 | Monorepo scaffold, auth, organisations & tenant isolation | ✅ Done (web login + dashboard) |
| 4 | Employees & Teams (lifecycle, disable/enable, tenant isolation) | ✅ Done (API + web) |
| 5–6 | Projects, task categories & tasks (RBAC, status workflow) | ✅ Done (API) |
| 7 | Scheduling (TaskSchedule, overlap warnings, week view) | ✅ Done (API + web) |
| 8 | Time tracking (timer, manual entry, audited edits) | ✅ Done (API + web + mobile) |
| 9–13 | Timesheets/attendance/leave, dashboard, reports & notifications, mobile completion, testing hardening | ⬜ Planned |

See `docs/architecture.md` Section F for the full phase breakdown.

## Structure

```
apps/
  api/      NestJS modular monolith (REST API)
  web/      Next.js (admin/manager/org-admin UI)
  mobile/   Expo/React Native (employee app)
packages/
  shared-types/  DTOs/enums shared by all three apps
  config/        Shared tsconfig base
docs/
  architecture.md   Architecture, ERD, API spec, milestones, risks
  adr/              Architecture decision records (added as decisions are made)
```

## Prerequisites

- Node.js 20+
- pnpm 9+ (`npm install -g pnpm`)
- Docker (for local Postgres)
- Expo Go app on a physical device, or an iOS/Android emulator, for mobile testing

## Getting started

```bash
# 1. Install all workspace dependencies
pnpm install

# 2. Start local Postgres
pnpm db:up

# 3. Copy env files
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
cp apps/mobile/.env.example apps/mobile/.env

# 4. Generate the Prisma client and apply migrations (first time only:
#    this also creates the initial migration files under
#    apps/api/prisma/migrations/, which you should commit)
pnpm --filter @ewm/api prisma:generate
pnpm --filter @ewm/api prisma:migrate

# 5. Seed a few test users (prints the shared password to the console)
pnpm --filter @ewm/api prisma:seed

# 6. Run each app in its own terminal
pnpm dev:api      # http://localhost:3001
pnpm dev:web      # http://localhost:3000
pnpm dev:mobile   # opens Expo dev tools / QR code for Expo Go
```

Open http://localhost:3000 — there is a Phase 1 health-check landing page at
`/`, a working login at `/login`, a placeholder dashboard at `/dashboard`,
Phase 4 admin pages for **employees** (`/employees`) and **teams**
(`/teams`), a Phase 7 scheduling week view at `/schedule`, and a Phase 8
time tracking page at `/time-tracking` once signed in. Projects and Tasks
are API-first for now; web UI for those lands when the corresponding
screens are built.

On mobile, the login screen shows "API connectivity: OK" once
Expo Go can reach the API (use your machine's LAN IP in
`apps/mobile/.env`, not `localhost`, when testing on a physical device).

### Smoke-testing auth & tenant isolation
After seeding, confirm login works end to end:

```bash
curl -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"manager@ewm.test","password":"Password123!"}'
```

You should get back `{ "accessToken": "...", "refreshToken": "...", "expiresIn": 900 }`.
Trying `disabled@ewm.test` with the same password should return a 401.

Seeded accounts (password `Password123!` unless noted):

| Email | Role | Organisation |
|---|---|---|
| `superadmin@ewm.test` | SUPER_ADMIN (platform, no org) | — |
| `admin@ewm.test` | ORG_ADMIN | Acme Ltd |
| `manager@ewm.test` | MANAGER | Acme Ltd |
| `teamlead@ewm.test` | TEAM_LEAD | Acme Ltd |
| `employee@ewm.test` | EMPLOYEE | Acme Ltd |
| `disabled@ewm.test` | EMPLOYEE (inactive) | Acme Ltd |
| `orgadmin@globex.test` | ORG_ADMIN | Globex Corp |

Tenant-isolation smoke test: log in as `orgadmin@globex.test` and `GET
/organisations/me` — you get Globex Corp, never Acme Ltd. Organisations are
managed by the SUPER_ADMIN via `/organisations` (create / suspend / activate);
suspending an organisation blocks its users from logging in (403).

## Scripts (run from repo root)

| Command | What it does |
|---|---|
| `pnpm dev:api` / `dev:web` / `dev:mobile` | Run one app in dev mode |
| `pnpm build` | Build all apps/packages |
| `pnpm lint` | Lint all apps/packages |
| `pnpm test` | Run all unit/e2e tests |
| `pnpm db:up` / `db:down` | Start/stop local Postgres via Docker Compose |

API-specific (run with `pnpm --filter @ewm/api <script>`):

| Command | What it does |
|---|---|
| `prisma:generate` | Regenerate the Prisma client after a schema change |
| `prisma:migrate` | Create + apply a new migration in dev |
| `prisma:migrate:deploy` | Apply existing migrations (used in CI/production) |
| `prisma:seed` | Re-run the seed script |

## Next milestone

Phase 9 — Timesheets & Attendance & Leave: weekly/daily/monthly timesheet
aggregation, submit/approve/reject flow with immutability after approval;
clock in/out; leave request/approval. See `docs/architecture.md` Section F
for the full phase breakdown.
