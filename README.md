# Employee Work Management

A multi-tenant SaaS platform for employee task management, scheduling, time
tracking, and planned-vs-actual work intelligence. See
[`docs/architecture.md`](docs/architecture.md) for the full architecture,
ERD, API spec, and milestone plan.

## Status

**Phase 3 — Organisation & Tenant Isolation Core.** `Organisation` entity with
tenant-scoped `User`s, a `TenantGuard` that resolves the organisation from the
JWT on every protected route, an `Auth → Tenant → Roles` guard chain, Super
Admin organisation create/list/update/suspend/activate, and a working web
login page. Suspended organisations' users are blocked from logging in, and the
critical cross-tenant isolation test is enforced in CI.

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

Open http://localhost:3000 — it should show a green health-check response
from the API, with a link to the Phase 3 login page at http://localhost:3000/login.
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

Phase 3 — Organisation & Tenant Isolation Core (multi-tenant data model,
tenant guard, RBAC guard, Super Admin org management). See
`docs/architecture.md` Section F for the full phase breakdown.
