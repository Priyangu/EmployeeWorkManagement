import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import request from "supertest";
import * as argon2 from "argon2";
import type { AuthTokens } from "@ewm/shared-types";
import { UserRole } from "@ewm/shared-types";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import { AuthService } from "../src/modules/auth/auth.service";

describe("Reports (e2e) — project report", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let authService: AuthService;
  let tokens: AuthTokens;
  let otherTokens: AuthTokens;
  let projectId: string;
  const suffix = Date.now();
  const password = "correct-horse-battery-staple";

  function get(token: string, path: string) {
    return request(app.getHttpServer()).get(path).set("Authorization", `Bearer ${token}`);
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = moduleFixture.get(PrismaService);
    authService = moduleFixture.get(AuthService);

    const org = await prisma.organisation.create({ data: { name: `P11 Org ${suffix}` } });
    const otherOrg = await prisma.organisation.create({ data: { name: `P11 Other ${suffix}` } });
    const passwordHash = await argon2.hash(password);
    const user = await prisma.user.create({ data: { email: `p11-admin-${suffix}@ewm.test`, passwordHash, role: UserRole.ORG_ADMIN, organisationId: org.id } });
    const otherUser = await prisma.user.create({ data: { email: `p11-other-${suffix}@ewm.test`, passwordHash, role: UserRole.ORG_ADMIN, organisationId: otherOrg.id } });
    const employee = await prisma.employee.create({ data: { organisationId: org.id, userId: user.id, name: "P11 Admin" } });
    tokens = await authService.login(user.email, password);
    otherTokens = await authService.login(otherUser.email, password);

    const project = await prisma.project.create({ data: { organisationId: org.id, name: "Reportable Project", budgetHours: 10 } });
    projectId = project.id;
    await prisma.task.create({ data: { organisationId: org.id, projectId, title: "Done", status: "COMPLETED", estimatedMinutes: 120, createdById: employee.id } });
    await prisma.task.create({ data: { organisationId: org.id, projectId, title: "Open", estimatedMinutes: 60, createdById: employee.id } });
    await prisma.timeEntry.create({ data: { organisationId: org.id, employeeId: employee.id, projectId, status: "COMPLETED", source: "MANUAL", startTime: new Date("2026-09-10T09:00:00.000Z"), endTime: new Date("2026-09-10T11:00:00.000Z"), durationSeconds: 7200 } });
  });

  afterAll(async () => { await app.close(); });

  it("returns project planned, actual, variance, and completion metrics", async () => {
    const response = await get(tokens.accessToken, `/reports/project?projectId=${projectId}&from=2026-09-01T00:00:00.000Z&to=2026-10-01T00:00:00.000Z`).expect(200);
    expect(response.body.projects).toEqual([expect.objectContaining({ projectName: "Reportable Project", plannedHours: 10, actualHours: 2, varianceHours: -8, completionPercent: 50 })]);
  });

  it("exports the same project metrics as CSV", async () => {
    const response = await get(tokens.accessToken, `/reports/project?projectId=${projectId}&from=2026-09-01T00:00:00.000Z&to=2026-10-01T00:00:00.000Z&format=csv`).expect(200);
    expect(response.headers["content-type"]).toContain("text/csv");
    expect(response.text).toContain("Project,Planned Hours,Actual Hours,Variance Hours,Completion Percent");
    expect(response.text).toContain('"Reportable Project","10","2","-8","50"');
  });

  it("keeps project reports tenant-scoped", async () => {
    await get(otherTokens.accessToken, `/reports/project?projectId=${projectId}`).expect(404);
  });
});
