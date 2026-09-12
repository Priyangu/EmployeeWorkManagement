# Employee Work Management SaaS — Architecture & MVP Plan

*Design-phase deliverable per Section 41 of the brief. No implementation has started. This document is meant to be reviewed and approved before any code is written.*

---

## 0. Ambiguities & Assumptions (flagged per Section 32)

Before locking architecture, these decisions were made where the brief left room for interpretation. Flag any you want changed before we proceed to implementation:

| # | Ambiguity | Assumption made | Why |
|---|---|---|---|
| 1 | Backend language/framework not mandated | **Node.js + NestJS (TypeScript)** | Same language as web/mobile, strong DI/module system suited to a modular monolith, mature ecosystem on Render/Railway/Fly.io |
| 2 | Frontend framework not mandated | **Next.js (React, TypeScript)** | Pairs naturally with React Native for code/pattern sharing (e.g. shared types, validation schemas), good Vercel/Cloudflare Pages support |
| 3 | "Reports support CSV export" — sync or async | **Synchronous generation for MVP** (small orgs, ≤~50 employees) | Avoids needing a queue/worker in MVP per Section 26/35 guidance to avoid unnecessary infra |
| 4 | Scheduling "conflict prevention" — hard block or warn | **Warn, don't hard-block** (manager can override with confirmation) | Real-world scheduling has legitimate overlaps (on-call, travel buffers); hard blocking risks being wrong and annoying |
| 5 | Multi-tenant isolation strategy: separate DB per tenant vs shared DB with tenant_id | **Shared database, shared schema, `organisation_id` on every tenant-scoped row + row-level enforcement** | Lowest cost or SMB-scale MVP (Section 35 explicitly wants low-cost single DB); revisit if a large enterprise customer demands physical isolation |
| 6 | Timezone handling | **All timestamps stored in UTC; each Employee has an IANA `timeZone` field for display** | Standard practice, avoids DST bugs |
| 7 | "Employee" vs "User" — are all employees also login users? | **Every Employee has exactly one User account (1:1)**; Employee holds work-related attributes, User holds auth/session attributes | Keeps auth concerns separate from HR-ish data, matches Section 27's entity list which lists both |
| 8 | Does MVP need multi-currency? | **No — NZD only, currency stored as a config field for future-proofing** | Section 3 targets NZ SMBs initially |
| 9 | Real-time updates (e.g. live dashboard) | **Polling / refetch-on-focus for MVP, not WebSockets** | Avoids extra infra; websockets can be added later without schema changes |

---

## A. Product Architecture

```
┌─────────────────┐        ┌──────────────────┐
│   Mobile App     │        │    Web App        │
│ (Expo/React      │        │  (Next.js)        │
│  Native)         │        │  Admin/Manager UI │
└────────┬─────────┘        └────────┬──────────┘
         │            HTTPS/JSON     │
         └───────────────┬───────────┘
                          ▼
                ┌───────────────────┐
                │   API (NestJS)     │
                │  ─────────────────│
                │  Auth Guard        │
                │  Tenant Guard      │◄── every request resolves
                │  RBAC Guard        │     organisation_id + role
                └─────────┬──────────┘
                          │
        ┌─────────────────┼──────────────────┐
        ▼                 ▼                  ▼
 ┌─────────────┐   ┌─────────────┐   ┌──────────────┐
 │  Modules     │   │  Modules     │   │  Modules      │
 │ Org/Users    │   │ Tasks/Sched  │   │ Time/Timesheet│
 │ Employees    │   │ Projects     │   │ Attendance    │
 │ Teams        │   │ Notifications│   │ Reports       │
 └──────┬───────┘   └──────┬───────┘   └──────┬────────┘
        └──────────────────┼───────────────────┘
                            ▼
                  ┌───────────────────┐
                  │   PostgreSQL       │
                  │ (org_id on every   │
                  │  tenant-scoped row)│
                  └─────────┬──────────┘
                            │
          ┌─────────────────┼─────────────────┐
          ▼                 ▼                 ▼
  ┌───────────────┐ ┌───────────────┐ ┌────────────────┐
  │ Object Storage │ │ Email Provider│ │  Audit Log      │
  │ (attachments)  │ │ (Resend, etc.)│ │  (own table)    │
  └───────────────┘ └───────────────┘ └────────────────┘
```

**Key architectural decisions:**
- **Modular monolith**: one deployable API service, internally organised into NestJS modules (Org, Employees, Teams, Projects, Tasks, Scheduling, TimeTracking, Timesheets, Attendance, Leave, Notifications, Reports, Audit). Each module owns its own tables and exposes a service interface to other modules — no reaching into another module's repository directly. This makes a future extraction into microservices possible without a rewrite, per Section 26.
- **Tenant isolation is enforced in three layers, not one**: (1) every Prisma/query-builder call is wrapped by a request-scoped tenant context that auto-injects `WHERE organisation_id = :orgId`; (2) a NestJS guard rejects any request where the resolved user's org doesn't match the resource being accessed; (3) integration tests specifically assert cross-tenant access fails (Section 33).
- **Notifications** are published as internal domain events (e.g. `task.assigned`, `timesheet.rejected`) to a single `NotificationService`, which currently only writes an in-app `Notification` row and sends email via the provider's API. This keeps the event-producer code identical when SMS/push are added later — only the `NotificationService` internals change.
- **File storage** is abstracted behind a small `StorageService` interface (`putObject`, `getSignedUrl`, `deleteObject`) so swapping Cloudflare R2 for S3 or Supabase Storage is a config change, not a code change.

---

## B. Database ERD (MVP entities)

```
Organisation ──1───∞ User ──1───1 Employee ──∞───1 Team
      │                                │
      │                                │
      │                                ∞
      │                          TaskAssignment ──∞──1 Task ──∞──1 Project ──∞──1 Organisation
      │                                                  │
      │                                                  ∞
      │                                            TaskSchedule
      │
      ├──∞ Project
      ├──∞ TaskCategory
      ├──∞ Team
      ├──∞ Subscription (1:1, current plan)
      └──∞ AuditLog

Task ──∞── TimeEntry ──∞──1 Employee
Task ──∞── Comment ──∞──1 User
Task ──∞── Attachment

Employee ──∞── Attendance
Employee ──∞── LeaveRequest
Employee ──∞── Timesheet ──∞── TimeEntry (aggregation, via date range + employee)
User ──∞── Notification
```

**Entity field summary (MVP only — no speculative columns):**

- **Organisation**: id, name, timeZone, country (default NZ), createdAt, updatedAt, deletedAt
- **Subscription**: id, organisationId, tier, status (trial/active/suspended/cancelled/payment_failed), seatCount, trialEndsAt, currentPeriodEnd
- **User**: id, organisationId, email (unique per org), passwordHash, role (SUPER_ADMIN/ORG_ADMIN/MANAGER/EMPLOYEE), lastLoginAt, isActive, createdAt, updatedAt
- **Employee**: id, organisationId, userId (1:1), name, phone, teamId (nullable), managerId (self-ref, nullable), timeZone, workingHoursJson, employmentStatus (active/disabled), createdAt, updatedAt
- **Team**: id, organisationId, name, managerId (Employee ref)
- **Project**: id, organisationId, name, description, customer, startDate, endDate, status (planned/active/on_hold/completed/cancelled), budgetHours, budgetAmount, projectManagerId
- **TaskCategory**: id, organisationId, name
- **Task**: id, organisationId, projectId, taskCategoryId, title, description, priority (low/normal/high/urgent), status (not_started/scheduled/in_progress/paused/completed/cancelled/blocked), estimatedMinutes, dueDate, actualMinutes (derived/cached from TimeEntry sum), createdById, createdAt, updatedAt
- **TaskAssignment**: id, taskId, employeeId, assignedAt, assignedById — *(kept separate from Task so a task's assignment history/reassignment is auditable and, later, multi-assignee is possible without a schema change)*
- **TaskSchedule**: id, taskId, employeeId, scheduledStart, scheduledEnd
- **TimeEntry**: id, organisationId, employeeId, taskId, projectId (denormalised for reporting speed), startTime, endTime, durationMinutes, source (timer/manual/imported), notes, editedById (nullable), editedAt (nullable)
- **Timesheet**: id, organisationId, employeeId, periodStart, periodEnd, status (draft/submitted/approved/rejected), approvedById, approvedAt, rejectionReason
- **Attendance**: id, organisationId, employeeId, clockIn, clockOut, breakMinutes, isLate, isEarlyDeparture
- **LeaveRequest**: id, organisationId, employeeId, type (annual/sick/other), startDate, endDate, status (pending/approved/rejected), approvedById
- **Notification**: id, organisationId, userId, type, payloadJson, isRead, createdAt
- **Comment**: id, taskId, userId, body, createdAt
- **Attachment**: id, taskId, storageKey, fileName, mimeType, uploadedById, createdAt
- **AuditLog**: id, organisationId, userId, action, entityType, entityId, oldValueJson, newValueJson, createdAt

All tables: UUID PK, `organisationId` indexed FK (except Organisation/AuditLog which is org-scoped itself), `createdAt`/`updatedAt`, soft delete (`deletedAt`) on Organisation, User, Employee, Project, Task only (records people actively rely on referential history for — not blanket-applied "for theoretical flexibility" per Section 27).

---

## C. API Specification (MVP endpoints)

```
Auth
  POST   /auth/login
  POST   /auth/logout
  POST   /auth/password/forgot
  POST   /auth/password/reset
  POST   /auth/email/verify

Organisation (Org Admin / Super Admin)
  GET    /organisations/me
  PATCH  /organisations/me
  GET    /organisations/me/working-hours
  PUT    /organisations/me/working-hours

Employees
  GET    /employees
  POST   /employees
  GET    /employees/:id
  PATCH  /employees/:id
  POST   /employees/:id/disable

Teams
  GET    /teams
  POST   /teams
  PATCH  /teams/:id

Projects
  GET    /projects
  POST   /projects
  GET    /projects/:id
  PATCH  /projects/:id

Task Categories
  GET    /task-categories
  POST   /task-categories

Tasks
  GET    /tasks                 (filters: employeeId, projectId, status, dueDate range)
  POST   /tasks
  GET    /tasks/:id
  PATCH  /tasks/:id
  POST   /tasks/:id/assign
  POST   /tasks/:id/start
  POST   /tasks/:id/pause
  POST   /tasks/:id/resume
  POST   /tasks/:id/complete
  POST   /tasks/:id/comments
  GET    /tasks/:id/comments
  POST   /tasks/:id/attachments

Scheduling
  GET    /schedule?from=&to=&employeeId=      (calendar view)
  POST   /schedule                             (create TaskSchedule entry)
  PATCH  /schedule/:id                         (drag/reassign/reschedule)

Time Tracking
  GET    /time-entries
  POST   /time-entries              (manual entry)
  PATCH  /time-entries/:id          (audited edit)

Timesheets
  GET    /timesheets
  POST   /timesheets/:id/submit
  POST   /timesheets/:id/approve
  POST   /timesheets/:id/reject

Attendance
  POST   /attendance/clock-in
  POST   /attendance/clock-out
  GET    /attendance?employeeId=&from=&to=

Leave
  GET    /leave-requests
  POST   /leave-requests
  POST   /leave-requests/:id/approve
  POST   /leave-requests/:id/reject

Notifications
  GET    /notifications
  POST   /notifications/:id/read

Dashboard
  GET    /dashboard/today
  GET    /dashboard/team-workload
  GET    /dashboard/project-performance

Reports
  GET    /reports/employee?employeeId=&from=&to=
  GET    /reports/project?projectId=&from=&to=
  GET    /reports/team?teamId=&from=&to=
  GET    /reports/time?groupBy=day|week|month
  (each supports &format=csv)
```

Every endpoint requires a valid session/JWT, is scoped by the guard chain (Auth → Tenant → RBAC), validates input via DTOs (class-validator), and returns RFC7807-style error bodies. Mutating endpoints on Employee/Task/Timesheet/Leave write an AuditLog row.

---

## D. Repository Structure

```
employee-work-saas/
├── apps/
│   ├── api/                     # NestJS modular monolith
│   │   ├── src/
│   │   │   ├── modules/
│   │   │   │   ├── auth/
│   │   │   │   ├── organisations/
│   │   │   │   ├── employees/
│   │   │   │   ├── teams/
│   │   │   │   ├── projects/
│   │   │   │   ├── tasks/
│   │   │   │   ├── scheduling/
│   │   │   │   ├── time-tracking/
│   │   │   │   ├── timesheets/
│   │   │   │   ├── attendance/
│   │   │   │   ├── leave/
│   │   │   │   ├── notifications/
│   │   │   │   ├── dashboard/
│   │   │   │   ├── reports/
│   │   │   │   └── audit/
│   │   │   ├── common/
│   │   │   │   ├── guards/        # AuthGuard, TenantGuard, RolesGuard
│   │   │   │   ├── decorators/
│   │   │   │   ├── interceptors/
│   │   │   │   └── filters/
│   │   │   ├── prisma/            # schema.prisma, migrations
│   │   │   └── main.ts
│   │   └── test/
│   ├── web/                      # Next.js (Admin/Manager/Org Admin UI)
│   │   ├── app/
│   │   │   ├── dashboard/
│   │   │   ├── employees/
│   │   │   ├── projects/
│   │   │   ├── tasks/
│   │   │   ├── schedule/
│   │   │   ├── timesheets/
│   │   │   ├── reports/
│   │   │   └── settings/
│   │   └── components/
│   └── mobile/                   # Expo/React Native (Employee app)
│       ├── app/
│       │   ├── (auth)/login
│       │   ├── (tabs)/home
│       │   ├── (tabs)/tasks
│       │   ├── task/[id]
│       │   ├── timer/
│       │   ├── timesheet/
│       │   ├── leave/
│       │   └── profile/
│       └── components/
├── packages/
│   ├── shared-types/              # DTOs / zod schemas shared web+mobile+api
│   └── config/                    # eslint, tsconfig base
├── docs/
│   ├── architecture.md
│   ├── api-spec.md
│   └── adr/                       # architecture decision records
├── .github/workflows/             # CI: lint, test, migration check
└── docker-compose.yml             # local Postgres
```

A monorepo (npm/pnpm workspaces or Turborepo) keeps the shared DTO/validation types consistent across API, web, and mobile — reducing drift bugs, and matching Section 26/35's "one repository" guidance for lowest cost.

---

## E. Technology Selection

| Layer | Choice | Reasoning / trade-offs |
|---|---|---|
| Web frontend | **Next.js + TypeScript, Tailwind CSS** | Server components reduce client bundle for admin-heavy screens; large ecosystem; deploys free/cheap on Vercel or Cloudflare Pages. Trade-off: more opinionated than plain Vite/React, but saves routing/SSR boilerplate. |
| Mobile | **Expo (React Native) + TypeScript** | Single codebase for iOS/Android as required (Section 21); Expo Go enables fast local testing without native build tooling; can share `packages/shared-types` with web. Trade-off vs Flutter: RN keeps one language (TS) across the whole stack, easier hiring/maintenance for a small team; Flutter would need Dart and a second type system. |
| Backend | **NestJS + TypeScript** | Built-in DI, module boundaries, and Guard/Interceptor primitives map directly onto the tenant-isolation and RBAC requirements (Section 5/7); mature testing tooling. Trade-off vs a lighter framework (Fastify alone, Express): more structure upfront, but this project's module count (14 modules) benefits from enforced boundaries rather than an unopinionated router. |
| ORM | **Prisma** | Type-safe queries reduce a whole class of tenant-leak bugs (query builder knows the shape); migration tooling built in; works well with the "wrap every query in tenant context" pattern via Prisma Client extensions. |
| Database | **PostgreSQL** (Neon or Supabase for dev, small managed instance for pilot) | Explicitly recommended in the brief (Section 27); relational model fits the entity relationships cleanly; JSON columns available for the few flexible fields (workingHours, notification payload) without needing a document DB. |
| Auth | **Custom email/password with Argon2id hashing + short-lived JWT access token + rotating refresh token**, structured so an OAuth/OIDC strategy (e.g. via `@nestjs/passport`) can be added as an additional strategy later | Section 7 explicitly wants OAuth/SSO deferred but not architecturally blocked; Passport's strategy pattern makes this a genuinely additive change later, not a rewrite. |
| File storage | **Cloudflare R2** (dev) → same S3-compatible API in production | S3-compatible API means the `StorageService` abstraction never has to change if you later move to AWS S3; R2 has no egress fees, useful for a cost-conscious SMB SaaS. |
| Email | **Resend** (dev/pilot) | Good developer experience, generous free tier, simple templating; swappable behind a `NotificationService` interface. |
| Background jobs | **None in MVP** (deferred) | Report generation and notification dispatch are synchronous/inline for MVP scale; a queue (e.g. BullMQ + Redis) is a clean additive step when volume requires it — avoids the infra Section 35 explicitly says to avoid until needed. |
| Testing | **Jest** (unit + integration, API and web), **Supertest** (API endpoint tests), **Playwright** (E2E web), **Detox or Maestro** (mobile E2E, added once mobile UI stabilises) | Standard, well-supported combination across the whole TS stack; Playwright/Jest both run cleanly in GitHub Actions. |
| CI/CD | **GitHub Actions** | Free tier is sufficient at this stage (Section 35); runs lint, unit/integration tests, and `prisma migrate diff` checks on every PR. |
| Hosting (dev/pilot) | Web → **Vercel**; API → **Render** or **Fly.io**; DB → **Neon**; per Section 35 | Matches the brief's explicit low-cost recommendation; all have straightforward paid tiers to graduate into for a pilot without a re-platform. |
| Error tracking | **Sentry** (free tier) | Covers both API and web/mobile clients from one dashboard. |

---

## F. MVP Implementation Plan (Milestones)

Each milestone is sized to be reviewable independently and shippable to a staging environment.

### Phase 1 — Project Foundation
- **Objective**: Monorepo scaffolded, CI running, local Docker Postgres, empty NestJS + Next.js + Expo apps talking to each other via a health check.
- **Files/components**: repo skeleton above, `docker-compose.yml`, `.github/workflows/ci.yml`, base `tsconfig`/eslint configs.
- **API changes**: `GET /health`.
- **DB changes**: none (empty Prisma schema + migration baseline).
- **Tests**: CI pipeline itself is the test (lint + build all three apps).
- **Acceptance criteria**: PR triggers lint+build; `docker compose up` gives a working local Postgres; all three apps boot locally.

### Phase 2 — Authentication
- **Objective**: Email/password auth, session/JWT issuance, password reset, email verification, rate limiting on auth endpoints.
- **Files/components**: `modules/auth/*`, `common/guards/AuthGuard`.
- **API changes**: `/auth/login`, `/auth/logout`, `/auth/password/forgot`, `/auth/password/reset`, `/auth/email/verify`.
- **DB changes**: `User` table, password hash column, refresh token table.
- **Tests**: unit tests for hashing/token logic; integration tests for login success/failure, rate-limit trigger, expired token rejection.
- **Acceptance criteria**: a seeded user can log in and receive a working session; wrong password fails; disabled user cannot log in.

### Phase 3 — Organisation & Tenant Isolation Core
- **Objective**: Organisation entity, tenant-context middleware, RBAC guard, Super Admin org create/suspend.
- **Files/components**: `modules/organisations/*`, `common/guards/TenantGuard`, `common/guards/RolesGuard`.
- **API changes**: `/organisations/me` (GET/PATCH), Super Admin org CRUD.
- **DB changes**: `Organisation` table; `organisationId` FK added to `User`.
- **Tests**: **critical tenant-isolation test** — user from Org A cannot fetch/modify Org B's `/organisations/me` or any resource; role-based 403s for non-admins.
- **Acceptance criteria**: cross-tenant access attempts return 403/404, never data.

### Phase 4 — Employees & Teams
- **Objective**: Org Admin can add/edit/disable employees, assign to teams, set working hours.
- **Files/components**: `modules/employees/*`, `modules/teams/*`.
- **API changes**: `/employees`, `/employees/:id`, `/employees/:id/disable`, `/teams`.
- **DB changes**: `Employee`, `Team` tables.
- **Tests**: disabled employee cannot authenticate (ties back to Auth module); employee list is tenant-scoped.
- **Acceptance criteria**: full employee lifecycle works end-to-end in web UI.

### Phase 5 — Projects
- **Objective**: Managers create/manage projects with budget hours/amount and status.
- **Files/components**: `modules/projects/*`.
- **API changes**: `/projects`, `/projects/:id`.
- **DB changes**: `Project` table.
- **Tests**: status transitions validated; only Manager/Org Admin roles can create.
- **Acceptance criteria**: project list + detail view functional on web.

### Phase 6 — Tasks
- **Objective**: Full task CRUD, categories, assignment, comments, attachments, status lifecycle including start/pause/resume/complete.
- **Files/components**: `modules/tasks/*`, `modules/task-categories/*`.
- **API changes**: `/tasks*`, `/tasks/:id/{assign,start,pause,resume,complete}`, `/tasks/:id/comments`, `/tasks/:id/attachments`.
- **DB changes**: `Task`, `TaskCategory`, `TaskAssignment`, `Comment`, `Attachment` tables.
- **Tests**: **critical business test** — a completed task cannot transition back to in_progress via `/start`; invalid status transitions rejected.
- **Acceptance criteria**: a task can be created, assigned, started, paused, resumed, and completed via API and reflected in web UI.

### Phase 7 — Scheduling
- **Objective**: Calendar view of scheduled work per employee; drag/reassign/reschedule; conflict warnings.
- **Files/components**: `modules/scheduling/*`, web calendar component.
- **API changes**: `/schedule` (GET/POST), `/schedule/:id` (PATCH).
- **DB changes**: `TaskSchedule` table.
- **Tests**: overlapping schedule for same employee returns a warning flag (not a hard error) in the API response.
- **Acceptance criteria**: manager can view and drag-reschedule a week's work for a team.

### Phase 8 — Time Tracking
- **Objective**: Start/pause/resume/stop timer (mobile + web), manual entry, audited edits.
- **Files/components**: `modules/time-tracking/*`, mobile Timer screen.
- **API changes**: `/time-entries*`.
- **DB changes**: `TimeEntry` table.
- **Tests**: **critical business test** — starting a timer while another is already running for the same employee is rejected; editing a time entry writes an AuditLog row.
- **Acceptance criteria**: employee can track time via mobile timer; entries show correct duration and source.

### Phase 9 — Timesheets & Attendance & Leave
- **Objective**: Weekly/daily/monthly timesheet aggregation, submit/approve/reject flow with immutability after approval; clock in/out; leave request/approval.
- **Files/components**: `modules/timesheets/*`, `modules/attendance/*`, `modules/leave/*`.
- **API changes**: `/timesheets*`, `/attendance/*`, `/leave-requests*`.
- **DB changes**: `Timesheet`, `Attendance`, `LeaveRequest` tables.
- **Tests**: **critical business test** — an approved timesheet cannot be silently modified; any correction after approval creates a new auditable record rather than mutating in place.
- **Acceptance criteria**: employee submits a week's timesheet, manager approves it, further edits are blocked without an explicit correction flow.

### Phase 10 — Dashboard
- **Objective**: Today's overview, team workload, project performance widgets.
- **Files/components**: `modules/dashboard/*`, web dashboard page.
- **API changes**: `/dashboard/today`, `/dashboard/team-workload`, `/dashboard/project-performance`.
- **DB changes**: none (aggregation queries over existing tables).
- **Tests**: dashboard numbers match underlying task/time data in fixture-based integration tests.
- **Acceptance criteria**: dashboard loads in under ~1s for a seeded 20-employee org.

### Phase 11 — Reports & Notifications
- **Objective**: Employee/project/team/time reports with CSV export; notification generation for the required events.
- **Files/components**: `modules/reports/*`, `modules/notifications/*`.
- **API changes**: `/reports/*` (with `?format=csv`), `/notifications*`.
- **DB changes**: `Notification` table.
- **Tests**: CSV output matches on-screen totals; notification created on task assignment/timesheet decision.
- **Acceptance criteria**: manager can export a project report as CSV; employee sees an in-app notification when assigned a task.

### Phase 10-11 — Role-Based Visibility & Access Control ✅ Done
- **Objective**: Enforce server-side that each role sees and can act on only the data it should. Implemented across employees, tasks, and teams modules, with role-conditional web and mobile navigation.
- **API changes**: `PATCH /employees/:id/emergency-contact` (ORG_ADMIN); SUPER_ADMIN `POST /organisations` accepts `admin{}` to provision first ORG_ADMIN atomically.
- **DB changes**: `Employee` gains `emergencyContactName`, `emergencyContactRelationship`, `emergencyContactPhone`, `emergencyContactEmail`.
- **Visibility rules enforced in service layer**:
  - **EMPLOYEE**: sees only their own employee record; sees only tasks assigned to them.
  - **TEAM_LEAD**: sees employees in their own team; sees org tasks; can reassign tasks to team members only.
  - **MANAGER**: sees employees and team leads; sees org tasks; can assign TeamLead/employee to tasks; can add/remove employees including TeamLead.
  - **ORG_ADMIN**: unrestricted tenant visibility; sees managers list; manages emergency contacts.
  - **SUPER_ADMIN**: tenant-only dashboard; sees all ORG_ADMINs; creates tenants with first admin provisioning.
- **Strict TEAM_LEAD mutation restriction**: `assertTeamLeadMutationAccess` in employees service enforces that TEAM_LEAD can only update/disable/enable employees within their own team.
- **Web UI**: role-conditional navigation; dashboard shows role-specific views; employees page has edit modal with team/manager/role/emergency-contact; tasks page allows manager assignment.
- **Mobile UI**: tab layout conditional on role (management roles see Tasks tab); home screen role-specific views matching web; new manage-tasks tab for managers to create/assign tasks.
- **Tests**: employee/team regression tests (20/20); task visibility e2e test; timesheets immutability e2e test; API and web build validation.

### Phase 12 — Mobile Application Completion ✅ Done
- **Objective**: All MVP mobile screens per Section 21 (Login, Home, Today's Tasks, Task Details, Timer, Timesheet, Notifications, Profile, Leave, Calendar) wired to the API, with basic offline queuing for time entries.
- **Status**: Complete. Mobile app has login, home (assigned tasks), timer (start/pause/resume/stop), timesheet, notifications, leave, profile, and calendar tabs. Role-based visibility enforced via API. Refresh-token rotation wired in mobile API client.

### Phase 15 — Platform Administration & Tenant Provisioning ✅ Done
- **Objective**: SUPER_ADMIN platform dashboard for managing tenants and provisioning each tenant's first ORG_ADMIN account atomically.
- **API changes**: `POST /organisations` accepts `admin{name,email,password}` to atomically create organisation + ORG_ADMIN user + employee in one transaction; `GET /employees/platform-admins` for SUPER_ADMIN to list all ORG_ADMINs.
- **DB changes**: none new.
- **Acceptance criteria met**: SUPER_ADMIN can view tenant list, create a company with its first admin in one operation, and suspend/activate the tenant without exposing tenant work data.

### Phase 13 — Testing Hardening
- **Objective**: Close gaps in unit/integration/E2E coverage; run the full critical-test checklist from Section 33 explicitly.
- **Acceptance criteria**: all five critical business tests and the tenant-isolation test pass in CI, with coverage reported.

### Phase 14 — Deployment
- **Objective**: Stand up dev/test/prod environments per Section 35's low-cost recommendation, with backups configured before any real customer data is stored.
- **Acceptance criteria**: a deploy from `main` reaches staging automatically via GitHub Actions; production requires manual approval.

---

## G. Risks

**Security**
- Tenant-isolation bugs are the single highest-severity risk in a multi-tenant SaaS; mitigated by the three-layer enforcement in Section A plus mandatory automated tests in every phase touching data access, not just Phase 13.
- Session/token theft — mitigated by short-lived access tokens, httpOnly refresh cookies (web), secure storage (mobile), and rate limiting on auth endpoints.

**Privacy**
- Employee data is sensitive; scope creep toward "surveillance" features (Section 38 explicitly warns against this) is a real risk once GPS/geofencing is requested — needs an explicit opt-in/disclosure gate before any location feature ships, not just a technical toggle.
- NZ Privacy Act 2020 obligations (purpose limitation, data retention limits) should be reviewed with legal counsel before commercial launch, particularly around how long time/attendance data is retained.

**Scalability**
- Shared-schema multi-tenancy scales well to hundreds of SMB tenants but will need read-replica or partitioning consideration if a small number of very large tenants join — not a Phase 1–14 concern, but worth an early index/query-pattern review.
- Cached `actualMinutes` on Task must be kept consistent with the underlying TimeEntry sums; a drift bug here would quietly corrupt the Planned-vs-Actual feature that's the product's key differentiator (Section 37).

**Product**
- "Do not over-specialise" (Section 3) vs. individual industries wanting tailored fields is a permanent tension — mitigated by keeping Task/Project schemas generic and pushing anything industry-specific into a later configurable-fields layer rather than one-off columns.
- Timesheet approval immutability (Section 15) must be designed correctly the first time — retrofitting audit-safe correction flows onto already-mutable data is painful.

**Technical**
- Free-tier hosting (Neon/Render free plans) can sleep or reclaim inactive projects — acceptable for dev, explicitly not for any real customer data per Section 35; needs a clear go/no-go gate before onboarding a real pilot customer.
- Offline mobile time-entry sync (Section 21) has real edge cases (clock skew, duplicate submission on retry) — scope this carefully in Phase 12 rather than treating it as trivial.

**Commercial**
- Subscription tiers/pricing must stay data-driven (Section 25 explicitly says don't hard-code pricing) — a `Subscription`/plan-config table from day one avoids a painful migration later.
- Trial-to-paid conversion and churn tracking (Section 38) need event instrumentation built in from Phase 3 onward, not bolted on later, or the historical data needed to measure it won't exist.

---

## H. Post-Phase Backlog (Deferred Work)

Work explicitly deferred until Phases 1–15 are complete. Captured here so it is
not lost; re-scope each item into a milestone when the time comes.

### Phase 9 follow-ups — Timesheets, Attendance & Leave
- **Attendance timezone correctness.** `isLate` / `isEarlyDeparture` are derived
  by comparing `now.getUTCHours()` against a hardcoded 17:00 (early departure) or
  an hour parsed straight from the employee's `workingHours` JSON — no
  organisation or employee timezone offset is applied. This is only correct for
  UTC-based orgs; it will misclassify lateness in NZ (UTC+12/+13) and everywhere
  else. Decide where the timezone lives (assumption #6 already puts an IANA
  `timeZone` on `Employee`; `Organisation` may also need one) and apply it when
  computing expected start/finish. Kept UTC-only for the MVP.
- **International / multi-timezone support.** Generalise the above beyond a
  single NZ-friendly timezone once there is customer demand — per-org timezone
  configuration, DST-safe comparisons, and timezone-aware weekly timesheet
  boundaries (Monday/Sunday are currently computed in UTC).
- **Phase 9 web UI.** No web pages exist yet for timesheets, attendance or leave
  (API-first, consistent with how Phases 5–6 shipped). Confirm whether this is
  intentionally deferred or an oversight; if deferred, track the three UI
  surfaces here.
- **Attendance & leave critical-test coverage.** The Phase 9 critical
  immutability test is covered (`apps/api/test/timesheets.e2e-spec.ts`). Still to
  add before the Phase 13 hardening checklist: one-active-clock-in-per-employee
  enforcement, and leave approve/reject authorization + tenant isolation.

### Cross-cutting follow-ups
- **Web auth hardening (Phases 2–3).** The web client stores the refresh token in
  `localStorage` but never uses it — there is no 401 → `/auth/refresh` retry, so a
  session effectively ends when the 15-minute access token expires. Logout also
  only clears local storage and does not call `POST /auth/logout`, leaving the
  server-side refresh-token row unrevoked. Move the refresh token to an httpOnly
  cookie and wire up rotation + server-side revocation before real customer data.


## Next Step

Phases 1-12, Phase 10-11 (RBAC), and Phase 15 (platform admin & tenant provisioning) are complete. The remaining work is:

1. **Phase 13 — Testing Hardening**: Close remaining test gaps (attendance one-active-clock-in enforcement, leave approve/reject authorization + tenant isolation). Run the full critical-test checklist.
2. **Phase 14 — Deployment**: Stand up dev/test/prod environments with CI/CD and backups.

See Section H above for the full deferred-work backlog (timezone support, internationalisation, web auth hardening).
