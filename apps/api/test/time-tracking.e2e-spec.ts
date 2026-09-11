// Phase 8 critical tests: starting a timer while another is already running
// for the same employee is REJECTED (409), and every edit writes an AuditLog
// row. Also covers the full timer lifecycle (start/pause/resume/stop), manual
// entries, privacy-scoped reads, manager-for-employee actions with audited
// edits, and tenant isolation. Style mirrors the scheduling suite: real
// Postgres, tokens minted via AuthService (bypasses the login rate limiter).
import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import request from "supertest";
import * as argon2 from "argon2";
import type { AuthTokens } from "@ewm/shared-types";
import { UserRole } from "@ewm/shared-types";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import { AuthService } from "../src/modules/auth/auth.service";

describe("Time tracking (e2e) — Phase 8", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let authService: AuthService;

  const password = "correct-horse-battery-staple";
  const suffix = Date.now();

  const emails = {
    orgAAdmin: `p8a-admin-${suffix}@ewm.test`,
    orgAWorker: `p8a-worker-${suffix}@ewm.test`,
    orgBAdmin: `p8b-admin-${suffix}@ewm.test`,
  };

  let orgAId: string;
  let orgBId: string;
  let adminTokens: AuthTokens;
  let workerTokens: AuthTokens;
  let orgBAdminTokens: AuthTokens;

  let adminProfileId: string;
  let workerProfileId: string;
  let bareEmployeeId: string;
  let taskId: string;
  let timerEntryId: string;

  function auth(token: string) {
    return {
      get: (url: string) =>
        request(app.getHttpServer()).get(url).set("Authorization", `Bearer ${token}`),
      post: (url: string) =>
        request(app.getHttpServer()).post(url).set("Authorization", `Bearer ${token}`),
      patch: (url: string) =>
        request(app.getHttpServer()).patch(url).set("Authorization", `Bearer ${token}`),
    };
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    prisma = moduleFixture.get(PrismaService);
    authService = moduleFixture.get(AuthService);

    const orgA = await prisma.organisation.create({
      data: { name: `P8 Org A ${suffix}`, country: "NZ" },
    });
    const orgB = await prisma.organisation.create({
      data: { name: `P8 Org B ${suffix}`, country: "NZ" },
    });
    orgAId = orgA.id;
    orgBId = orgB.id;

    const passwordHash = await argon2.hash(password);
    async function createUser(email: string, role: UserRole, organisationId: string) {
      return prisma.user.create({
        data: { email, passwordHash, role, isActive: true, organisationId },
      });
    }

    const [adminUser, workerUser, orgBAdminUser] = await Promise.all([
      createUser(emails.orgAAdmin, UserRole.ORG_ADMIN, orgAId),
      createUser(emails.orgAWorker, UserRole.EMPLOYEE, orgAId),
      createUser(emails.orgBAdmin, UserRole.ORG_ADMIN, orgBId),
    ]);

    // Workers need Employee profiles to own timers; the admin needs one so it
    // can create tasks (createdById) and act on others' entries.
    const adminProfile = await prisma.employee.create({
      data: { organisationId: orgAId, userId: adminUser.id, name: "P8 Admin" },
    });
    adminProfileId = adminProfile.id;
    const workerProfile = await prisma.employee.create({
      data: { organisationId: orgAId, userId: workerUser.id, name: "P8 Worker" },
    });
    workerProfileId = workerProfile.id;
    // A bare employee (no login) the manager acts on — manager-for-employee flow.
    const bare = await prisma.employee.create({
      data: { organisationId: orgAId, name: "P8 Bare" },
    });
    bareEmployeeId = bare.id;
    await prisma.employee.create({
      data: { organisationId: orgBId, userId: orgBAdminUser.id, name: "P8 Other" },
    });

    adminTokens = await authService.login(emails.orgAAdmin, password);
    workerTokens = await authService.login(emails.orgAWorker, password);
    orgBAdminTokens = await authService.login(emails.orgBAdmin, password);

    const project = await prisma.project.create({
      data: { organisationId: orgAId, name: `P8 Project ${suffix}` },
    });
    const task = await prisma.task.create({
      data: {
        organisationId: orgAId,
        projectId: project.id,
        title: `P8 Task ${suffix}`,
        createdById: adminProfileId,
      },
    });
    taskId = task.id;
  });

  afterAll(async () => {
    await app.close();
  });

  // ── Timer lifecycle ───────────────────────────────────────────────────────
  it("starts a timer for the signed-in worker (RUNNING, source TIMER)", async () => {
    const res = await auth(workerTokens.accessToken)
      .post("/time-entries/start")
      .send({ taskId, notes: "working on it" })
      .expect(201);
    expect(res.body.status).toBe("RUNNING");
    expect(res.body.source).toBe("TIMER");
    expect(res.body.employeeId).toBe(workerProfileId);
    expect(res.body.taskId).toBe(taskId);
    expect(res.body.endTime).toBeNull();
    expect(res.body.durationSeconds).toBeNull();
    timerEntryId = res.body.id;
  });

  it("REJECTS starting a second timer while one is active (critical 409)", async () => {
    // Self-restart…
    await auth(workerTokens.accessToken).post("/time-entries/start").send({}).expect(409);
    // …and a manager attempting to start one for the same employee.
    await auth(adminTokens.accessToken)
      .post("/time-entries/start")
      .send({ employeeId: workerProfileId })
      .expect(409);
  });

  it("returns the open timer from /time-entries/active", async () => {
    const res = await auth(workerTokens.accessToken).get("/time-entries/active").expect(200);
    expect(res.body.id).toBe(timerEntryId);
    expect(res.body.status).toBe("RUNNING");
  });

  it("pauses and resumes the timer (PAUSED → RUNNING)", async () => {
    const paused = await auth(workerTokens.accessToken)
      .post(`/time-entries/${timerEntryId}/pause`)
      .expect(200);
    expect(paused.body.status).toBe("PAUSED");

    // No second timer while paused either.
    await auth(workerTokens.accessToken).post("/time-entries/start").send({}).expect(409);

    const resumed = await auth(workerTokens.accessToken)
      .post(`/time-entries/${timerEntryId}/resume`)
      .expect(200);
    expect(resumed.body.status).toBe("RUNNING");
  });

  // ── Manager-for-employee + ownership rules ────────────────────────────────
  it("lets a manager start a timer for an employee without a login", async () => {
    const res = await auth(adminTokens.accessToken)
      .post("/time-entries/start")
      .send({ employeeId: bareEmployeeId })
      .expect(201);
    expect(res.body.employeeId).toBe(bareEmployeeId);
    expect(res.body.employeeName).toBe("P8 Bare");
  });

  it("forbids an EMPLOYEE from acting on someone else's timer (403)", async () => {
    await auth(workerTokens.accessToken)
      .post("/time-entries/start")
      .send({ employeeId: adminProfileId })
      .expect(403);
  });

  it("stops the worker's timer (COMPLETED with duration)", async () => {
    const res = await auth(workerTokens.accessToken)
      .post(`/time-entries/${timerEntryId}/stop`)
      .send({ notes: "done for now" })
      .expect(200);
    expect(res.body.status).toBe("COMPLETED");
    expect(res.body.endTime).toEqual(expect.any(String));
    expect(res.body.durationSeconds).toBeGreaterThanOrEqual(0);
    expect(res.body.notes).toBe("done for now");

    // After stopping, the worker's slate is clear (no active entry).
    // The /time-entries/active endpoint returns null when nothing is running
    // (Nest serialises null as an empty body), so we assert on the array list
    // path here to always have something iterable.
    const list = await auth(workerTokens.accessToken)
      .get("/time-entries?status=RUNNING")
      .expect(200);
    expect(Array.isArray(list.body)).toBe(true);
    expect(list.body.length).toBe(0);
  });

  it("stops the bare employee's timer, then rejects stopping it again (400)", async () => {
    const active = await auth(adminTokens.accessToken)
      .get(`/time-entries/active?employeeId=${bareEmployeeId}`)
      .expect(200);
    const stopped = await auth(adminTokens.accessToken)
      .post(`/time-entries/${active.body.id}/stop`)
      .send({})
      .expect(200);
    expect(stopped.body.status).toBe("COMPLETED");
    await auth(adminTokens.accessToken)
      .post(`/time-entries/${active.body.id}/stop`)
      .send({})
      .expect(400);
  });

  // ── Manual entries ─────────────────────────────────────────────────────────
  it("logs a manual entry with derived duration (source MANUAL)", async () => {
    const startTime = "2026-09-14T09:00:00.000Z";
    const endTime = "2026-09-14T11:30:00.000Z";
    const res = await auth(adminTokens.accessToken)
      .post("/time-entries/manual")
      .send({ taskId, employeeId: bareEmployeeId, startTime, endTime, notes: "forgot to clock" })
      .expect(201);
    expect(res.body.source).toBe("MANUAL");
    expect(res.body.status).toBe("COMPLETED");
    expect(res.body.durationSeconds).toBe(9000);
    expect(res.body.employeeId).toBe(bareEmployeeId);
  });

  it("rejects a manual entry whose end is before its start (400)", async () => {
    await auth(adminTokens.accessToken)
      .post("/time-entries/manual")
      .send({
        taskId,
        startTime: "2026-09-14T12:00:00.000Z",
        endTime: "2026-09-14T09:00:00.000Z",
      })
      .expect(400);
  });

  it("forbids an EMPLOYEE from logging time for someone else (403)", async () => {
    await auth(workerTokens.accessToken)
      .post("/time-entries/manual")
      .send({
        taskId,
        employeeId: adminProfileId,
        startTime: "2026-09-14T09:00:00.000Z",
        endTime: "2026-09-14T10:00:00.000Z",
      })
      .expect(403);
  });

  // ── Privacy-scoped reads ───────────────────────────────────────────────────
  it("shows an EMPLOYEE only its own entries, managers the whole org", async () => {
    const workerView = await auth(workerTokens.accessToken).get("/time-entries").expect(200);
    expect(workerView.body.length).toBeGreaterThanOrEqual(1);
    workerView.body.forEach((e: { employeeId: string }) =>
      expect(e.employeeId).toBe(workerProfileId),
    );

    const adminView = await auth(adminTokens.accessToken).get("/time-entries").expect(200);
    const seen = new Set(adminView.body.map((e: { employeeId: string }) => e.employeeId));
    expect(seen.has(workerProfileId)).toBe(true);
    expect(seen.has(bareEmployeeId)).toBe(true);
  });

  // ── Audited edits (Phase 8 critical) ───────────────────────────────────────
  it("lets an employee edit its own entry without a reason", async () => {
    const res = await auth(workerTokens.accessToken)
      .patch(`/time-entries/${timerEntryId}`)
      .send({ notes: "self correction" })
      .expect(200);
    expect(res.body.notes).toBe("self correction");
  });

  it("REJECTS a manager editing someone else's entry without a reason (400)", async () => {
    await auth(adminTokens.accessToken)
      .patch(`/time-entries/${timerEntryId}`)
      .send({ notes: "no explanation" })
      .expect(400);
  });

  it("lets a manager edit with a reason AND stamps editedBy + AuditLog row", async () => {
    const res = await auth(adminTokens.accessToken)
      .patch(`/time-entries/${timerEntryId}`)
      .send({ notes: "corrected by manager", reason: "employee typo in notes" })
      .expect(200);
    expect(res.body.notes).toBe("corrected by manager");
    expect(res.body.editedAt).toEqual(expect.any(String));

    // editedById is stamped on the row itself (the admin User's id), while the
    // AuditLog row carries the old/new snapshots plus the reason.
    const adminUser = await prisma.user.findUniqueOrThrow({
      where: { email: emails.orgAAdmin },
    });
    const entry = await prisma.timeEntry.findUniqueOrThrow({
      where: { id: timerEntryId },
    });
    expect(entry.editedById).toBe(adminUser.id);
    expect(entry.editedAt).not.toBeNull();

    const logs = await prisma.auditLog.findMany({
      where: { organisationId: orgAId, entityType: "TimeEntry", entityId: timerEntryId },
      orderBy: { createdAt: "desc" as const },
    });
    expect(logs.length).toBeGreaterThanOrEqual(1);
    const log = logs[0];
    const newValue = log.newValueJson as { reason?: string; notes?: string };
    const oldValue = log.oldValueJson as { notes?: string };
    expect(newValue.reason).toBe("employee typo in notes");
    expect(newValue.notes).toBe("corrected by manager");
    expect(log.action).toBe("time_entry.update");
    expect(oldValue.notes).toBe("self correction");
  });

  // ── Tenant isolation ───────────────────────────────────────────────────────
  it("keeps time entries tenant-scoped (Org B sees none of Org A's)", async () => {
    const resB = await auth(orgBAdminTokens.accessToken).get("/time-entries").expect(200);
    expect(resB.body).toEqual([]);
    await auth(orgBAdminTokens.accessToken)
      .get(`/time-entries/${timerEntryId}`)
      .expect(404);
  });
});

