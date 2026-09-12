# Employee Work Management

A multi-tenant SaaS platform for employee task management, scheduling, time
tracking, and planned-vs-actual work intelligence. See
[`docs/architecture.md`](docs/architecture.md) for the full architecture,
ERD, API spec, and milestone plan.

## Status

**Phases 1-12, Phase 10-11 (RBAC), and Phase 15 complete** — the API, web, and mobile apps are all functional with full role-based access control and SUPER_ADMIN platform administration.

**Phase 10-11 — Role-Based Visibility & Access Control.** Server-side visibility filters enforce that each role sees only its own data: EMPLOYEE sees only their own employee record and assigned tasks; TEAM_LEAD sees their team's employees and org tasks (can reassign within team); MANAGER sees employees/team leads and org tasks (can assign TeamLead/employee, add/remove employees); ORG_ADMIN has unrestricted tenant visibility; SUPER_ADMIN gets a tenant-only dashboard with ORG_ADMIN provisioning. Web and mobile navigation are both role-conditional.

**Phase 15 — Platform Administration & Tenant Provisioning.** SUPER_ADMIN can create a tenant with its first ORG_ADMIN account atomically (`POST /organisations` with `admin{name,email,password}`), view all ORG_ADMINs across the platform, and suspend/activate tenants.

| Phase | Milestone | Status |
|---|---|---|
| 1-3 | Monorepo scaffold, auth, organisations & tenant isolation | ✅ Done (web login + dashboard) |
| 4 | Employees & Teams (lifecycle, disable/enable, tenant isolation) | ✅ Done (API + web) |
| 5-6 | Projects, task categories & tasks (RBAC, status workflow) | ✅ Done (API + web) |
| 7 | Scheduling (TaskSchedule, overlap warnings, week view) | ✅ Done (API + web) |
| 8 | Time tracking (timer, manual entry, audited edits) | ✅ Done (API + web + mobile) |
| 9 | Timesheets, attendance & leave (approval immutability) | ✅ Done (API + web) |
| 10-11 | Role-based visibility & access control | ✅ Done (API + web + mobile) |
| 12 | Application dashboards & reports/notifications | ✅ Done (web + mobile) |
| 15 | Platform admin & tenant provisioning | ✅ Done (API) |

**Remaining work:**
- Phase 13 — Testing Hardening (attendance/leave critical tests, full checklist)
- Phase 14 — Deployment (dev/test/prod environments, CI/CD, backups)
- Section H backlog: timezone support, internationalisation, web auth hardening

See `docs/architecture.md` Sections F and H for details.

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

Open http://localhost:3000 — there is a health-check landing page at `/`, a
working login at `/login`, a dashboard at `/dashboard`, and authenticated pages
for **employees** (`/employees`), **teams** (`/teams`), **schedule**
(`/schedule`), **time tracking** (`/time-tracking`), **timesheets**
(`/timesheets`), **attendance** (`/attendance`), **leave** (`/leave`),
**tasks** (`/tasks`), and **notifications** (`/notifications`).

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

Close the four remaining Phase 10-11 gaps (mobile role-specific tabs,
strict team-lead mutation restrictions, SUPER_ADMIN tenant + ORG_ADMIN
provisioning, org-admin emergency contact flow), then proceed to Phase 15
(platform administration), Phase 13 (testing hardening), and Phase 14
(deployment). See `docs/architecture.md` for details.
