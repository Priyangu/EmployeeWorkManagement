// Phase 9 CRITICAL business test: an APPROVED timesheet is immutable — it
// cannot be silently modified (re-created/overwritten, re-submitted or
// re-approved), and the only post-approval change path is /correct, which
// creates a NEW auditable version (version+1, parentTimesheetId set) while the
// original row is left untouched. Also exercises the employee self-service
// path (an EMPLOYEE creates/submits their own timesheet), manager approval,
// and tenant isolation. Style mirrors the Phase 8 time-tracking suite: real
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

describe("Timesheets (e2e) — Phase 9 critical immutability", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let authService: AuthService;

  const password = "correct-horse-battery-staple";
  const suffix = Date.now();

  const emails = {
    orgAAdmin: `p9a-admin-${suffix}@ewm.test`,
    orgAWorker: `p9a-worker-${suffix}@ewm.test`,
    orgBAdmin: `p9b-admin-${suffix}@ewm.test`,
  };

  let orgAId: string;
  let orgBId: string;
  let adminTokens: AuthTokens;
  let workerTokens: AuthTokens;
  let orgBAdminTokens: AuthTokens;

  let adminProfileId: string;
  let workerProfileId: string;

  // Monday 00:00 UTC of the week the fixture time entry lives in. 2026-09-14
  // is a Monday, so no offset maths is needed.
  const weekStart = "2026-09-14T00:00:00.000Z";
  let timesheetId: string;

  function auth(token: string) {
    return {
      get: (url: string) =>
        request(app.getHttpServer()).get(url).set("Authorization", `Bearer ${token}`),
      post: (url: string) =>
        request(app.getHttpServer()).post(url).set("Authorization", `Bearer ${token}`),
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
      data: { name: `P9 Org A ${suffix}`, country: "NZ" },
    });
    const orgB = await prisma.organisation.create({
      data: { name: `P9 Org B ${suffix}`, country: "NZ" },
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

    const adminProfile = await prisma.employee.create({
      data: { organisationId: orgAId, userId: adminUser.id, name: "P9 Admin" },
    });
    adminProfileId = adminProfile.id;
    const workerProfile = await prisma.employee.create({
      data: { organisationId: orgAId, userId: workerUser.id, name: "P9 Worker" },
    });
    workerProfileId = workerProfile.id;
    await prisma.employee.create({
      data: { organisationId: orgBId, userId: orgBAdminUser.id, name: "P9 Other" },
    });

    adminTokens = await authService.login(emails.orgAAdmin, password);
    workerTokens = await authService.login(emails.orgAWorker, password);
    orgBAdminTokens = await authService.login(emails.orgBAdmin, password);

    // A COMPLETED manual entry for the worker inside the target week, so the
    // timesheet aggregation has something to sum: 09:00–11:30 = 150 minutes.
    await prisma.timeEntry.create({
      data: {
        organisationId: orgAId,
        employeeId: workerProfileId,
        status: "COMPLETED",
        source: "MANUAL",
        startTime: new Date("2026-09-14T09:00:00.000Z"),
        endTime: new Date("2026-09-14T11:30:00.000Z"),
        durationSeconds: 9000,
      },
    });
  });

  afterAll(async () => {
    await app.close();
  });
  // ── Employee self-service (regression: create was once manager-only) ──────

  it("lets an EMPLOYEE create their own timesheet from completed entries", async () => {
    const res = await auth(workerTokens.accessToken)
      .post("/timesheets")
      .send({ periodStart: weekStart })
      .expect(201);
    expect(res.body.status).toBe("DRAFT");
    expect(res.body.employeeId).toBe(workerProfileId);
    expect(res.body.employeeName).toBe("P9 Worker");
    expect(res.body.totalMinutes).toBe(150);
    expect(res.body.version).toBe(1);
    timesheetId = res.body.id;
  });

  it("aggregates completed time by daily, weekly, and monthly periods", async () => {
    const query = "periodFrom=2026-09-14T00:00:00.000Z&periodTo=2026-10-01T00:00:00.000Z&employeeId=" + workerProfileId;

    const daily = await auth(workerTokens.accessToken)
      .get(`/timesheets/summary?granularity=daily&${query}`)
      .expect(200);
    expect(daily.body).toEqual([
      expect.objectContaining({
        employeeId: workerProfileId,
        periodStart: "2026-09-14T00:00:00.000Z",
        totalMinutes: 150,
      }),
    ]);

    const weekly = await auth(workerTokens.accessToken)
      .get(`/timesheets/summary?granularity=weekly&${query}`)
      .expect(200);
    expect(weekly.body).toEqual([
      expect.objectContaining({
        periodStart: "2026-09-14T00:00:00.000Z",
        periodEnd: "2026-09-20T23:59:59.999Z",
        totalMinutes: 150,
      }),
    ]);

    const monthly = await auth(workerTokens.accessToken)
      .get(`/timesheets/summary?granularity=monthly&${query}`)
      .expect(200);
    expect(monthly.body).toEqual([
      expect.objectContaining({
        periodStart: "2026-09-01T00:00:00.000Z",
        periodEnd: "2026-09-30T23:59:59.999Z",
        totalMinutes: 150,
      }),
    ]);
  });

  it("forbids an EMPLOYEE from creating a timesheet for someone else (403)", async () => {
    await auth(workerTokens.accessToken)
      .post("/timesheets")
      .send({ employeeId: adminProfileId, periodStart: weekStart })
      .expect(403);
  });

  it("lets a manager create a timesheet on an employee's behalf", async () => {
    // A different employee has no timesheet for this week yet.
    const bare = await prisma.employee.create({
      data: { organisationId: orgAId, name: "P9 Bare" },
    });
    const res = await auth(adminTokens.accessToken)
      .post("/timesheets")
      .send({ employeeId: bare.id, periodStart: weekStart })
      .expect(201);
    expect(res.body.employeeId).toBe(bare.id);
    expect(res.body.status).toBe("DRAFT");
  });

  // ── Lifecycle: submit → approve ───────────────────────────────────────────

  it("submits then has a manager approve the timesheet", async () => {
    const submitted = await auth(workerTokens.accessToken)
      .post(`/timesheets/${timesheetId}/submit`)
      .expect(200);
    expect(submitted.body.status).toBe("SUBMITTED");

    const approved = await auth(adminTokens.accessToken)
      .post(`/timesheets/${timesheetId}/approve`)
      .expect(200);
    expect(approved.body.status).toBe("APPROVED");
    expect(approved.body.approvedById).toEqual(expect.any(String));
    expect(approved.body.approvedAt).toEqual(expect.any(String));
  });

  // ── CRITICAL: APPROVED is immutable — direct mutation is rejected ─────────

  it("REJECTS silently overwriting an APPROVED timesheet (critical 409)", async () => {
    // Re-running the aggregation for the same week must NOT refresh/replace
    // the approved snapshot — it must fail and push the caller to /correct.
    await auth(workerTokens.accessToken)
      .post("/timesheets")
      .send({ periodStart: weekStart })
      .expect(409);
  });

  it("REJECTS re-submitting an APPROVED timesheet (409)", async () => {
    await auth(workerTokens.accessToken)
      .post(`/timesheets/${timesheetId}/submit`)
      .expect(409);
  });

  it("REJECTS re-approving an APPROVED timesheet (409)", async () => {
    await auth(adminTokens.accessToken)
      .post(`/timesheets/${timesheetId}/approve`)
      .expect(409);
  });

  it("only accepts a correction, creating a NEW version while leaving the original untouched", async () => {
    const before = await prisma.timesheet.findUniqueOrThrow({ where: { id: timesheetId } });

    const corr = await auth(adminTokens.accessToken)
      .post(`/timesheets/${timesheetId}/correct`)
      .expect(201);
    expect(corr.body.id).not.toBe(timesheetId);
    expect(corr.body.status).toBe("DRAFT");
    expect(corr.body.version).toBe(2);
    expect(corr.body.parentTimesheetId).toBe(timesheetId);
    expect(corr.body.employeeId).toBe(workerProfileId);

    // The original row is unchanged — nothing mutated in place.
    const after = await prisma.timesheet.findUniqueOrThrow({ where: { id: timesheetId } });
    expect(after.status).toBe("APPROVED");
    expect(after.totalMinutes).toBe(before.totalMinutes);
    expect(after.approvedAt?.toISOString()).toBe(before.approvedAt?.toISOString());
    expect(after.version).toBe(before.version);

    // The correction is auditable: a timesheet.correct row against the original.
    const logs = await prisma.auditLog.findMany({
      where: { organisationId: orgAId, entityType: "Timesheet", entityId: timesheetId },
      orderBy: { createdAt: "desc" as const },
    });
    expect(logs.some((l) => l.action === "timesheet.correct")).toBe(true);
  });

  it("rejects correcting a timesheet that is not APPROVED (409)", async () => {
    const draft = await prisma.timesheet.findFirstOrThrow({
      where: { organisationId: orgAId, parentTimesheetId: timesheetId },
    });
    await auth(adminTokens.accessToken)
      .post(`/timesheets/${draft.id}/correct`)
      .expect(409);
  });

  // ── Tenant isolation ───────────────────────────────────────────────────────

  it("keeps timesheets tenant-scoped (Org B sees none and cannot approve Org A's)", async () => {
    const list = await auth(orgBAdminTokens.accessToken).get("/timesheets").expect(200);
    expect(list.body).toEqual([]);

    await auth(orgBAdminTokens.accessToken)
      .post(`/timesheets/${timesheetId}/approve`)
      .expect(404);
  });


});
