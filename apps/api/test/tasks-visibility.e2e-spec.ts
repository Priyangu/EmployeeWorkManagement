import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import request from "supertest";
import * as argon2 from "argon2";
import type { AuthTokens } from "@ewm/shared-types";
import { UserRole } from "@ewm/shared-types";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import { AuthService } from "../src/modules/auth/auth.service";

describe("Task visibility (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let authService: AuthService;
  let workerTokens: AuthTokens;
  let workerOtherTokens: AuthTokens;
  let ownTaskId: string;
  let otherTaskId: string;
  const suffix = Date.now();
  const password = "correct-horse-battery-staple";

  function get(token: string, path: string) { return request(app.getHttpServer()).get(path).set("Authorization", `Bearer ${token}`); }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = moduleFixture.get(PrismaService);
    authService = moduleFixture.get(AuthService);
    const org = await prisma.organisation.create({ data: { name: `Task visibility ${suffix}` } });
    const passwordHash = await argon2.hash(password);
    const worker = await prisma.user.create({ data: { email: `task-worker-${suffix}@ewm.test`, passwordHash, role: UserRole.EMPLOYEE, organisationId: org.id } });
    const other = await prisma.user.create({ data: { email: `task-other-${suffix}@ewm.test`, passwordHash, role: UserRole.EMPLOYEE, organisationId: org.id } });
    const workerEmployee = await prisma.employee.create({ data: { organisationId: org.id, userId: worker.id, name: "Task Worker" } });
    const otherEmployee = await prisma.employee.create({ data: { organisationId: org.id, userId: other.id, name: "Task Other" } });
    workerTokens = await authService.login(worker.email, password);
    workerOtherTokens = await authService.login(other.email, password);
    const project = await prisma.project.create({ data: { organisationId: org.id, name: "Visibility Project" } });
    const ownTask = await prisma.task.create({ data: { organisationId: org.id, projectId: project.id, title: "Own task", assigneeId: workerEmployee.id, createdById: workerEmployee.id } });
    const otherTask = await prisma.task.create({ data: { organisationId: org.id, projectId: project.id, title: "Other task", assigneeId: otherEmployee.id, createdById: workerEmployee.id } });
    ownTaskId = ownTask.id;
    otherTaskId = otherTask.id;
  });

  afterAll(async () => { await app.close(); });

  it("returns only the employee's assigned tasks and blocks other task details", async () => {
    const list = await get(workerTokens.accessToken, "/tasks").expect(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].id).toBe(ownTaskId);
    await get(workerTokens.accessToken, `/tasks/${otherTaskId}`).expect(403);
    const otherList = await get(workerOtherTokens.accessToken, "/tasks").expect(200);
    expect(otherList.body).toHaveLength(1);
    expect(otherList.body[0].id).toBe(otherTaskId);
  });
});
