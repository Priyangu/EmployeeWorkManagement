import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import request from "supertest";
import * as argon2 from "argon2";
import type { AuthTokens } from "@ewm/shared-types";
import { UserRole } from "@ewm/shared-types";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import { AuthService } from "../src/modules/auth/auth.service";

// Phase 4 acceptance tests, hitting the real Postgres like the other e2e
// suites. Covers: full employee lifecycle (create → update → disable blocks
// login → enable restores login), working-hours persistence, manager
// assignment, tenant scoping of both lists, and team CRUD + membership.
//
// Tokens are minted through AuthService.login directly (service-level) to
// stay independent of the /auth/login HTTP rate limiter; the two places we
// do drive login over HTTP need exactly one request each.
describe("Employees & Teams (e2e) — Phase 4", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let authService: AuthService;

  const password = "correct-horse-battery-staple";
  const suffix = Date.now();

  const emails = {
    orgAAdmin: `p4a-admin-${suffix}@ewm.test`,
    orgAManager: `p4a-manager-${suffix}@ewm.test`,
    orgAEmployee: `p4a-employee-${suffix}@ewm.test`,
    orgBAdmin: `p4b-admin-${suffix}@ewm.test`,
    newHire: `p4a-newhire-${suffix}@ewm.test`,
  };

  let orgAId: string;
  let orgBId: string;
  let adminTokens: AuthTokens;
  let managerTokens: AuthTokens;
  let employeeTokens: AuthTokens;
  let orgBAdminTokens: AuthTokens;

  let teamId: string;
  let hireEmployeeId: string;

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
      data: { name: `P4 Org A ${suffix}`, country: "NZ" },
    });
    const orgB = await prisma.organisation.create({
      data: { name: `P4 Org B ${suffix}`, country: "NZ" },
    });
    orgAId = orgA.id;
    orgBId = orgB.id;

    const passwordHash = await argon2.hash(password);
    async function createUser(email: string, role: UserRole, organisationId: string) {
      return prisma.user.create({
        data: { email, passwordHash, role, isActive: true, organisationId },
      });
    }

    await createUser(emails.orgAAdmin, UserRole.ORG_ADMIN, orgAId);
    await createUser(emails.orgAManager, UserRole.MANAGER, orgAId);
    await createUser(emails.orgAEmployee, UserRole.EMPLOYEE, orgAId);
    await createUser(emails.orgBAdmin, UserRole.ORG_ADMIN, orgBId);

    adminTokens = await authService.login(emails.orgAAdmin, password);
    managerTokens = await authService.login(emails.orgAManager, password);
    employeeTokens = await authService.login(emails.orgAEmployee, password);
    orgBAdminTokens = await authService.login(emails.orgBAdmin, password);
  });

  afterAll(async () => {
    await app.close();
  });

  describe("teams", () => {
    it("lets an Org Admin create a team", async () => {
      const res = await auth(adminTokens.accessToken)
        .post("/teams")
        .send({ name: "Platform" })
        .expect(201);
      expect(res.body.name).toBe("Platform");
      expect(res.body.organisationId).toBe(orgAId);
      expect(res.body.memberCount).toBe(0);
      teamId = res.body.id;
    });

    it("rejects a duplicate team name in the same org", async () => {
      await auth(adminTokens.accessToken)
        .post("/teams")
        .send({ name: "Platform" })
        .expect(409);
    });

    it("allows the same team name in a different org", async () => {
      await auth(orgBAdminTokens.accessToken)
        .post("/teams")
        .send({ name: "Platform" })
        .expect(201);
    });

    it("lets a MANAGER create teams too", async () => {
      await auth(managerTokens.accessToken)
        .post("/teams")
        .send({ name: "Mobile" })
        .expect(201);
    });

    it("forbids an EMPLOYEE from creating teams (role-based 403)", async () => {
      await auth(employeeTokens.accessToken)
        .post("/teams")
        .send({ name: "Sneaky" })
        .expect(403);
    });

    it("lists teams tenant-scoped (Org B sees only its own)", async () => {
      const resB = await auth(orgBAdminTokens.accessToken).get("/teams").expect(200);
      expect(resB.body.map((t: { name: string }) => t.name)).toEqual(["Platform"]);
      const resA = await auth(adminTokens.accessToken).get("/teams").expect(200);
      expect(resA.body.map((t: { name: string }) => t.name).sort()).toEqual([
        "Mobile",
        "Platform",
      ]);
    });
  });

  describe("employees — lifecycle", () => {
    it("creates a login + profile together with working hours (Mode A)", async () => {
      const workingHours = { mon: { start: "09:00", end: "17:00" } };
      const res = await auth(adminTokens.accessToken)
        .post("/employees")
        .send({
          email: emails.newHire,
          password: "NewHire123!",
          role: "EMPLOYEE",
          name: "New Hire",
          phone: "021 123 456",
          teamId,
          timeZone: "Pacific/Auckland",
          workingHours,
        })
        .expect(201);
      expect(res.body.email).toBe(emails.newHire);
      expect(res.body.name).toBe("New Hire");
      expect(res.body.teamName).toBe("Platform");
      expect(res.body.workingHours).toEqual(workingHours);
      expect(res.body.employmentStatus).toBe("ACTIVE");
      expect(res.body.isActive).toBe(true);
      hireEmployeeId = res.body.id;
    });

    it("the new hire can log in", async () => {
      const res = await request(app.getHttpServer())
        .post("/auth/login")
        .send({ email: emails.newHire, password: "NewHire123!" })
        .expect(200);
      expect(res.body.accessToken).toEqual(expect.any(String));
    });

    it("rejects creating a second employee for the same email (409)", async () => {
      await auth(adminTokens.accessToken)
        .post("/employees")
        .send({ email: emails.newHire, password: "Other12345!", name: "Dupe" })
        .expect(409);
    });


    it("assigns a manager and persists working-hours updates", async () => {
      const mgr = await auth(adminTokens.accessToken)
        .post("/employees")
        .send({
          email: `p4a-lead-${suffix}@ewm.test`,
          password: "Lead12345!",
          role: "MANAGER",
          name: "Team Lead",
          teamId,
        })
        .expect(201);

      const updated = await auth(adminTokens.accessToken)
        .patch(`/employees/${hireEmployeeId}`)
        .send({
          managerId: mgr.body.id,
          workingHours: { mon: { start: "08:00", end: "16:00" } },
        })
        .expect(200);
      expect(updated.body.managerId).toBe(mgr.body.id);
      expect(updated.body.managerName).toBe("Team Lead");
      expect(updated.body.workingHours).toEqual({
        mon: { start: "08:00", end: "16:00" },
      });
    });

    it("rejects a self-manager assignment", async () => {
      await auth(adminTokens.accessToken)
        .patch(`/employees/${hireEmployeeId}`)
        .send({ managerId: hireEmployeeId })
        .expect(400);
    });

    it("disables the employee and blocks login (critical Phase 4 test)", async () => {
      const res = await auth(adminTokens.accessToken)
        .post(`/employees/${hireEmployeeId}/disable`)
        .expect(200);
      expect(res.body.employmentStatus).toBe("DISABLED");
      expect(res.body.isActive).toBe(false);

      await request(app.getHttpServer())
        .post("/auth/login")
        .send({ email: emails.newHire, password: "NewHire123!" })
        .expect(401);
    });

    it("re-enables the employee and restores login", async () => {
      const res = await auth(adminTokens.accessToken)
        .post(`/employees/${hireEmployeeId}/enable`)
        .expect(200);
      expect(res.body.employmentStatus).toBe("ACTIVE");
      expect(res.body.isActive).toBe(true);

      await request(app.getHttpServer())
        .post("/auth/login")
        .send({ email: emails.newHire, password: "NewHire123!" })
        .expect(200);
    });

    it("links a profile to an existing user without a login (Mode B)", async () => {
      const me = await prisma.user.findUniqueOrThrow({
        where: { email: emails.orgAEmployee },
      });
      const res = await auth(adminTokens.accessToken)
        .post("/employees")
        .send({ userId: me.id, name: "Existing Employee", teamId })
        .expect(201);
      expect(res.body.userId).toBe(me.id);
      expect(res.body.teamName).toBe("Platform");
    });

    it("rejects linking a user from another org (tenant isolation)", async () => {
      const other = await prisma.user.findUniqueOrThrow({
        where: { email: emails.orgBAdmin },
      });
      await auth(adminTokens.accessToken)
        .post("/employees")
        .send({ userId: other.id, name: "Cross-tenant link" })
        .expect(404);
    });

    it("lists employees tenant-scoped (Org B sees none of Org A's)", async () => {
      const resA = await auth(adminTokens.accessToken).get("/employees").expect(200);
      const emailsA = resA.body.map((e: { email: string }) => e.email);
      expect(emailsA).toContain(emails.newHire);

      const resB = await auth(orgBAdminTokens.accessToken).get("/employees").expect(200);
      const emailsB = resB.body.map((e: { email: string }) => e.email);
      expect(emailsB).not.toContain(emails.newHire);
      expect(emailsB).not.toContain(emails.orgAAdmin);
    });

    it("returns 404 when reading another org's employee id", async () => {
      await auth(orgBAdminTokens.accessToken)
        .get(`/employees/${hireEmployeeId}`)
        .expect(404);
    });

    it("forbids an EMPLOYEE from creating employees (role-based 403)", async () => {
      await auth(employeeTokens.accessToken)
        .post("/employees")
        .send({
          email: `p4a-nope-${suffix}@ewm.test`,
          password: "Nope12345!",
          name: "Nope",
        })
        .expect(403);
    });

    it("updates the team manager to an org employee", async () => {
      const res = await auth(adminTokens.accessToken)
        .patch(`/teams/${teamId}`)
        .send({ managerId: hireEmployeeId })
        .expect(200);
      expect(res.body.managerId).toBe(hireEmployeeId);
      expect(res.body.memberCount).toBeGreaterThanOrEqual(2);
    });
  });
});
