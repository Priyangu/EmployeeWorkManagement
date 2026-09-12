import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import request from "supertest";
import * as argon2 from "argon2";
import type { AuthTokens } from "@ewm/shared-types";
import { UserRole } from "@ewm/shared-types";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import { AuthService } from "../src/modules/auth/auth.service";

describe("Notifications (e2e) — Phase 11 events", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let authService: AuthService;
  let adminTokens: AuthTokens;
  let workerTokens: AuthTokens;
  let adminEmployeeId: string;
  let workerEmployeeId: string;
  let taskId: string;
  let timesheetId: string;
  const suffix = Date.now();
  const password = "correct-horse-battery-staple";

  function auth(token: string) {
    return {
      get: (path: string) => request(app.getHttpServer()).get(path).set("Authorization", `Bearer ${token}`),
      post: (path: string) => request(app.getHttpServer()).post(path).set("Authorization", `Bearer ${token}`),
    };
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = moduleFixture.get(PrismaService);
    authService = moduleFixture.get(AuthService);

    const organisation = await prisma.organisation.create({ data: { name: `P11 Notifications ${suffix}` } });
    const passwordHash = await argon2.hash(password);
    const admin = await prisma.user.create({ data: { email: `p11-notify-admin-${suffix}@ewm.test`, passwordHash, role: UserRole.ORG_ADMIN, organisationId: organisation.id } });
    const worker = await prisma.user.create({ data: { email: `p11-notify-worker-${suffix}@ewm.test`, passwordHash, role: UserRole.EMPLOYEE, organisationId: organisation.id } });
    const adminEmployee = await prisma.employee.create({ data: { organisationId: organisation.id, userId: admin.id, name: "Notify Admin" } });
    const workerEmployee = await prisma.employee.create({ data: { organisationId: organisation.id, userId: worker.id, name: "Notify Worker" } });
    adminEmployeeId = adminEmployee.id;
    workerEmployeeId = workerEmployee.id;
    adminTokens = await authService.login(admin.email, password);
    workerTokens = await authService.login(worker.email, password);

    const project = await prisma.project.create({ data: { organisationId: organisation.id, name: "Notification Project" } });
    const task = await prisma.task.create({ data: { organisationId: organisation.id, projectId: project.id, title: "Notify task", createdById: adminEmployeeId } });
    taskId = task.id;
    const timesheet = await prisma.timesheet.create({ data: { organisationId: organisation.id, employeeId: workerEmployeeId, periodStart: new Date("2026-09-07T00:00:00.000Z"), periodEnd: new Date("2026-09-13T23:59:59.999Z"), status: "SUBMITTED", totalMinutes: 60 } });
    timesheetId = timesheet.id;
  });

  afterAll(async () => { await app.close(); });

  it("notifies an employee when a task is assigned", async () => {
    await auth(adminTokens.accessToken).post(`/tasks/${taskId}/assign`).send({ employeeId: workerEmployeeId }).expect(200);
    const response = await auth(workerTokens.accessToken).get("/notifications").expect(200);
    expect(response.body).toEqual(expect.arrayContaining([expect.objectContaining({ type: "TASK_ASSIGNED", isRead: false, payload: expect.objectContaining({ taskId }) })]));
  });

  it("notifies an employee when their timesheet is approved", async () => {
    await auth(adminTokens.accessToken).post(`/timesheets/${timesheetId}/approve`).expect(200);
    const response = await auth(workerTokens.accessToken).get("/notifications").expect(200);
    const notification = response.body.find((item: { type: string; payload: { timesheetId?: string } }) => item.type === "TIMESHEET_APPROVED" && item.payload.timesheetId === timesheetId);
    expect(notification).toEqual(expect.objectContaining({ isRead: false }));
    await auth(workerTokens.accessToken).post(`/notifications/${notification.id}/read`).expect(201);
    const reread = await auth(workerTokens.accessToken).get("/notifications").expect(200);
    expect(reread.body.find((item: { id: string }) => item.id === notification.id).isRead).toBe(true);
  });
});
