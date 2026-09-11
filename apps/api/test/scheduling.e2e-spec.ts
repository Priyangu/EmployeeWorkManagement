// Phase 7 critical tests: create/list/reassign schedules, overlap WARNINGS
// (never hard errors), tenant isolation, and role-based write access.
// Mirrors the employees-teams suite style: real Postgres, tokens minted via
// AuthService so tests stay independent of the /auth/login rate limiter.
import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import request from "supertest";
import * as argon2 from "argon2";
import type { AuthTokens } from "@ewm/shared-types";
import { UserRole } from "@ewm/shared-types";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import { AuthService } from "../src/modules/auth/auth.service";

describe("Scheduling (e2e) — Phase 7", () => {
  jest.setTimeout(60000);
  let app: INestApplication;
  let prisma: PrismaService;
  let authService: AuthService;

  const password = "correct-horse-battery-staple";
  const suffix = Date.now();

  const emails = {
    orgAAdmin: `p7a-admin-${suffix}@ewm.test`,
    orgAManager: `p7a-manager-${suffix}@ewm.test`,
    orgAEmployee: `p7a-employee-${suffix}@ewm.test`,
    orgBAdmin: `p7b-admin-${suffix}@ewm.test`,
  };

  let orgAId: string;
  let orgBId: string;
  let adminTokens: AuthTokens;
  let managerTokens: AuthTokens;
  let employeeTokens: AuthTokens;
  let orgBAdminTokens: AuthTokens;

  let staffId: string;
  let projectId: string;
  let taskId: string;
  let scheduleId: string;

  function auth(token: string) {
    return {
      get: (url: string) =>
        request(app.getHttpServer()).get(url).set("Authorization", `Bearer ${token}`),
      post: (url: string) =>
        request(app.getHttpServer()).post(url).set("Authorization", `Bearer ${token}`),
      patch: (url: string) =>
        request(app.getHttpServer()).patch(url).set("Authorization", `Bearer ${token}`),
      delete: (url: string) =>
        request(app.getHttpServer()).delete(url).set("Authorization", `Bearer ${token}`),
    };
  }

  // Window under test: Monday 2026-09-14 → Monday 2026-09-21 (UTC).
  const weekFrom = "2026-09-14T00:00:00.000Z";
  const weekTo = "2026-09-21T00:00:00.000Z";

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
      data: { name: `P7 Org A ${suffix}`, country: "NZ" },
    });
    const orgB = await prisma.organisation.create({
      data: { name: `P7 Org B ${suffix}`, country: "NZ" },
    });
    orgAId = orgA.id;
    orgBId = orgB.id;

    const passwordHash = await argon2.hash(password);
    async function createUser(email: string, role: UserRole, organisationId: string) {
      return prisma.user.create({
        data: { email, passwordHash, role, isActive: true, organisationId },
      });
    }

    const [adminUser, managerUser] = await Promise.all([
      createUser(emails.orgAAdmin, UserRole.ORG_ADMIN, orgAId),
      createUser(emails.orgAManager, UserRole.MANAGER, orgAId),
      createUser(emails.orgAEmployee, UserRole.EMPLOYEE, orgAId),
      createUser(emails.orgBAdmin, UserRole.ORG_ADMIN, orgBId),
    ]);

    const adminEmployee = await prisma.employee.create({
      data: { organisationId: orgAId, userId: adminUser.id, name: "P7 Admin" },
    });
    const managerEmployee = await prisma.employee.create({
      data: { organisationId: orgAId, userId: managerUser.id, name: "P7 Manager" },
    });
    void managerEmployee;
    const staffMember = await prisma.employee.create({
      data: { organisationId: orgAId, name: "P7 Staff" },
    });
    staffId = staffMember.id;

    adminTokens = await authService.login(emails.orgAAdmin, password);
    managerTokens = await authService.login(emails.orgAManager, password);
    employeeTokens = await authService.login(emails.orgAEmployee, password);
    orgBAdminTokens = await authService.login(emails.orgBAdmin, password);

    const project = await prisma.project.create({
      data: { organisationId: orgAId, name: `P7 Project ${suffix}` },
    });
    projectId = project.id;
    void projectId;
    const task = await prisma.task.create({
      data: {
        organisationId: orgAId,
        projectId,
        title: `P7 Task ${suffix}`,
        createdById: adminEmployee.id,
      },
    });
    taskId = task.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it("creates a schedule block (201) with overlaps=false when clear", async () => {
    const res = await auth(adminTokens.accessToken)
      .post("/schedule")
      .send({
        taskId,
        employeeId: staffId,
        scheduledStart: "2026-09-14T09:00:00.000Z",
        scheduledEnd: "2026-09-14T12:00:00.000Z",
      })
      .expect(201);
    expect(res.body.organisationId).toBe(orgAId);
    expect(res.body.taskId).toBe(taskId);
    expect(res.body.employeeId).toBe(staffId);
    expect(res.body.overlaps).toBe(false);
    expect(res.body.conflictIds).toEqual([]);
    scheduleId = res.body.id;
  });

  it("lists the week's schedules with conflict flags", async () => {
    const res = await auth(adminTokens.accessToken)
      .get(`/schedule?from=${weekFrom}&to=${weekTo}`)
      .expect(200);
    const ids = res.body.map((s: { id: string }) => s.id);
    expect(ids).toContain(scheduleId);
  });

  it("warns (not a hard error) when a second block overlaps the same employee", async () => {
    const res = await auth(adminTokens.accessToken)
      .post("/schedule")
      .send({
        taskId,
        employeeId: staffId,
        scheduledStart: "2026-09-14T11:00:00.000Z",
        scheduledEnd: "2026-09-14T13:00:00.000Z",
      })
      .expect(201);
    expect(res.body.overlaps).toBe(true);
    expect(res.body.conflictIds).toContain(scheduleId);

    const list = await auth(adminTokens.accessToken)
      .get(`/schedule?from=${weekFrom}&to=${weekTo}`)
      .expect(200);
    const original = list.body.find((s: { id: string }) => s.id === scheduleId);
    expect(original.overlaps).toBe(true);
    expect(original.conflictIds).toContain(res.body.id);

    await auth(adminTokens.accessToken).delete(`/schedule/${res.body.id}`).expect(204);
  });

  it("lets a MANAGER move a block via PATCH (drag-reschedule)", async () => {
    const res = await auth(managerTokens.accessToken)
      .patch(`/schedule/${scheduleId}`)
      .send({
        scheduledStart: "2026-09-15T09:00:00.000Z",
        scheduledEnd: "2026-09-15T12:00:00.000Z",
      })
      .expect(200);
    expect(res.body.scheduledStart).toBe("2026-09-15T09:00:00.000Z");
    expect(res.body.overlaps).toBe(false);
  });

  it("rejects end-before-start with 400", async () => {
    await auth(adminTokens.accessToken)
      .post("/schedule")
      .send({
        taskId,
        employeeId: staffId,
        scheduledStart: "2026-09-16T12:00:00.000Z",
        scheduledEnd: "2026-09-16T09:00:00.000Z",
      })
      .expect(400);
  });

  it("rejects cross-org task/employee references with 404", async () => {
    const otherAdmin = await prisma.user.findUniqueOrThrow({
      where: { email: emails.orgBAdmin },
    });
    const otherEmployee = await prisma.employee.create({
      data: { organisationId: orgBId, userId: otherAdmin.id, name: "P7 Other" },
    });
    const otherProject = await prisma.project.create({
      data: { organisationId: orgBId, name: `P7 Other Proj ${suffix}` },
    });
    const otherTask = await prisma.task.create({
      data: {
        organisationId: orgBId,
        projectId: otherProject.id,
        title: `P7 Other Task ${suffix}`,
        createdById: otherEmployee.id,
      },
    });
    await auth(adminTokens.accessToken)
      .post("/schedule")
      .send({
        taskId: otherTask.id,
        employeeId: staffId,
        scheduledStart: "2026-09-16T09:00:00.000Z",
        scheduledEnd: "2026-09-16T10:00:00.000Z",
      })
      .expect(404);
    await auth(adminTokens.accessToken)
      .post("/schedule")
      .send({
        taskId,
        employeeId: otherEmployee.id,
        scheduledStart: "2026-09-16T09:00:00.000Z",
        scheduledEnd: "2026-09-16T10:00:00.000Z",
      })
      .expect(404);
  });

  it("keeps schedules tenant-scoped (Org B sees none of Org A's)", async () => {
    const resB = await auth(orgBAdminTokens.accessToken)
      .get(`/schedule?from=${weekFrom}&to=${weekTo}`)
      .expect(200);
    expect(resB.body).toEqual([]);
  });

  it("forbids an EMPLOYEE from creating schedules (role-based 403)", async () => {
    await auth(employeeTokens.accessToken)
      .post("/schedule")
      .send({
        taskId,
        employeeId: staffId,
        scheduledStart: "2026-09-17T09:00:00.000Z",
        scheduledEnd: "2026-09-17T10:00:00.000Z",
      })
      .expect(403);
  });

  it("deletes a block (204) and it disappears from the list", async () => {
    await auth(adminTokens.accessToken).delete(`/schedule/${scheduleId}`).expect(204);
    const res = await auth(adminTokens.accessToken)
      .get(`/schedule?from=${weekFrom}&to=${weekTo}`)
      .expect(200);
    expect(res.body.map((s: { id: string }) => s.id)).not.toContain(scheduleId);
  });
});
