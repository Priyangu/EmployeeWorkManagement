import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import request from "supertest";
import * as argon2 from "argon2";
import type { AuthTokens } from "@ewm/shared-types";
import { UserRole } from "@ewm/shared-types";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import { AuthService } from "../src/modules/auth/auth.service";

describe("Dashboard (e2e) — today overview", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let authService: AuthService;
  let adminTokens: AuthTokens;
  let otherOrgTokens: AuthTokens;
  let adminEmployeeId: string;
  let workerEmployeeId: string;

  const suffix = Date.now();
  const password = "correct-horse-battery-staple";

  function auth(token: string) {
    return request(app.getHttpServer()).get("/dashboard/today").set("Authorization", `Bearer ${token}`);
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = moduleFixture.get(PrismaService);
    authService = moduleFixture.get(AuthService);

    const org = await prisma.organisation.create({ data: { name: `P10 Org ${suffix}` } });
    const otherOrg = await prisma.organisation.create({ data: { name: `P10 Other ${suffix}` } });
    const passwordHash = await argon2.hash(password);
    const admin = await prisma.user.create({ data: { email: `p10-admin-${suffix}@ewm.test`, passwordHash, role: UserRole.ORG_ADMIN, organisationId: org.id } });
    const worker = await prisma.user.create({ data: { email: `p10-worker-${suffix}@ewm.test`, passwordHash, role: UserRole.EMPLOYEE, organisationId: org.id } });
    const otherAdmin = await prisma.user.create({ data: { email: `p10-other-${suffix}@ewm.test`, passwordHash, role: UserRole.ORG_ADMIN, organisationId: otherOrg.id } });
    const adminEmployee = await prisma.employee.create({ data: { organisationId: org.id, userId: admin.id, name: "P10 Admin" } });
    const workerEmployee = await prisma.employee.create({ data: { organisationId: org.id, userId: worker.id, name: "P10 Worker" } });
    adminEmployeeId = adminEmployee.id;
    workerEmployeeId = workerEmployee.id;
    adminTokens = await authService.login(admin.email, password);
    otherOrgTokens = await authService.login(otherAdmin.email, password);

    const project = await prisma.project.create({ data: { organisationId: org.id, name: `P10 Project ${suffix}` } });
    const completedTask = await prisma.task.create({ data: { organisationId: org.id, projectId: project.id, title: "Completed today", status: "COMPLETED", createdById: adminEmployeeId } });
    await prisma.task.create({ data: { organisationId: org.id, projectId: project.id, title: "Overdue", dueDate: new Date(Date.now() - 24 * 60 * 60 * 1000), createdById: adminEmployeeId } });
    await prisma.task.create({ data: { organisationId: org.id, projectId: project.id, title: "Active", status: "IN_PROGRESS", createdById: adminEmployeeId } });
    const now = new Date();
    await prisma.taskSchedule.create({ data: { organisationId: org.id, taskId: completedTask.id, employeeId: workerEmployeeId, scheduledStart: new Date(now.getTime() - 30 * 60 * 1000), scheduledEnd: new Date(now.getTime() + 30 * 60 * 1000) } });
    await prisma.attendance.create({ data: { organisationId: org.id, employeeId: workerEmployeeId, clockIn: now } });
    await prisma.timeEntry.create({ data: { organisationId: org.id, employeeId: adminEmployeeId, status: "RUNNING", source: "TIMER", startTime: now } });
  });

  afterAll(async () => { await app.close(); });

  it("returns tenant-scoped today metrics from underlying records", async () => {
    const response = await auth(adminTokens.accessToken).expect(200);
    expect(response.body).toEqual(expect.objectContaining({
      employeesWorking: 2,
      tasksScheduled: 1,
      tasksCompleted: 1,
      overdueTasks: 1,
      activeTasks: 1,
    }));
  });

  it("does not expose another organisation's metrics", async () => {
    const response = await auth(otherOrgTokens.accessToken).expect(200);
    expect(response.body).toEqual(expect.objectContaining({
      employeesWorking: 0,
      tasksScheduled: 0,
      tasksCompleted: 0,
      overdueTasks: 0,
      activeTasks: 0,
    }));
  });
});
