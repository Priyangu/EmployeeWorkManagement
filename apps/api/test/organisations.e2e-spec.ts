import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import request from "supertest";
import * as argon2 from "argon2";
import type { AuthTokens } from "@ewm/shared-types";
import { UserRole } from "@ewm/shared-types";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import { AuthService } from "../src/modules/auth/auth.service";

// Phase 3 critical tenant-isolation test: a user from Organisation A must
// never read or modify Organisation B's data. These tests hit the real
// Postgres (DATABASE_URL from .env), like auth.e2e-spec.ts.
//
// Tokens are minted through AuthService.login directly (service-level) to
// keep tests independent of the /auth/login rate limiter; the one place we
// do drive login over HTTP is the suspended-org block, which needs exactly
// two requests and stays well under the 5/min limit.
describe("Organisations (e2e) â€” tenant isolation", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let authService: AuthService;

  const password = "correct-horse-battery-staple";
  const suffix = Date.now();

  const emails = {
    orgAAdmin: `orga-admin-${suffix}@ewm.test`,
    orgAEmployee: `orga-employee-${suffix}@ewm.test`,
    orgBAdmin: `orgb-admin-${suffix}@ewm.test`,
    superAdmin: `superadmin-${suffix}@ewm.test`,
    orgCAdmin: `orgc-admin-${suffix}@ewm.test`,
  };

  let orgA: { id: string; name: string };
  let orgB: { id: string; name: string };
  let createdOrgId: string;

  let orgAAdminTokens: AuthTokens;
  let orgAEmployeeTokens: AuthTokens;
  let orgBAdminTokens: AuthTokens;
  let superAdminTokens: AuthTokens;

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

    const passwordHash = await argon2.hash(password);

    orgA = await prisma.organisation.create({
      data: { name: "Org A", timeZone: "Pacific/Auckland", country: "NZ" },
    });
    orgB = await prisma.organisation.create({
      data: { name: "Org B", timeZone: "Pacific/Auckland", country: "NZ" },
    });

    async function createUser(
      email: string,
      role: UserRole,
      organisationId: string | null,
    ) {
      return prisma.user.create({
        data: {
          email,
          passwordHash,
          role,
          isActive: true,
          organisationId,
        },
      });
    }

    await createUser(emails.orgAAdmin, UserRole.ORG_ADMIN, orgA.id);
    await createUser(emails.orgAEmployee, UserRole.EMPLOYEE, orgA.id);
    await createUser(emails.orgBAdmin, UserRole.ORG_ADMIN, orgB.id);
    await createUser(emails.superAdmin, UserRole.SUPER_ADMIN, null);
    await createUser(emails.orgCAdmin, UserRole.ORG_ADMIN, null); // attached when Org C exists

    orgAAdminTokens = await authService.login(emails.orgAAdmin, password);
    orgAEmployeeTokens = await authService.login(emails.orgAEmployee, password);
    orgBAdminTokens = await authService.login(emails.orgBAdmin, password);
    superAdminTokens = await authService.login(emails.superAdmin, password);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { email: { in: Object.values(emails) } },
    });
    const orgIds = [orgA?.id, orgB?.id, createdOrgId].filter(
      (id) => id !== undefined,
    );
    if (orgIds.length > 0) {
      await prisma.organisation.deleteMany({ where: { id: { in: orgIds } } });
    }
    await app.close();
  });

  function auth(token: string) {
    const server = app.getHttpServer();
    return {
      get: (url: string) =>
        request(server).get(url).set("Authorization", `Bearer ${token}`),
      post: (url: string) =>
        request(server).post(url).set("Authorization", `Bearer ${token}`),
      patch: (url: string) =>
        request(server).patch(url).set("Authorization", `Bearer ${token}`),
    };
  }

  describe("GET /organisations/me", () => {
    it("returns the caller's own organisation", async () => {
      const res = await auth(orgAAdminTokens.accessToken)
        .get("/organisations/me")
        .expect(200);
      expect(res.body.id).toBe(orgA.id);
      expect(res.body.name).toBe("Org A");
    });

    it("returns Org B for the Org B admin â€” never Org A (isolation)", async () => {
      const res = await auth(orgBAdminTokens.accessToken)
        .get("/organisations/me")
        .expect(200);
      expect(res.body.id).toBe(orgB.id);
      expect(res.body.name).toBe("Org B");
    });

    it("rejects a SUPER_ADMIN with no organisation context with 403", async () => {
      await auth(superAdminTokens.accessToken)
        .get("/organisations/me")
        .expect(403);
    });

    it("rejects anonymous access with 401", async () => {
      await request(app.getHttpServer()).get("/organisations/me").expect(401);
    });
  });

  describe("PATCH /organisations/me", () => {
    it("lets an Org Admin rename only their own organisation", async () => {
      await auth(orgAAdminTokens.accessToken)
        .patch("/organisations/me")
        .send({ name: "Org A Renamed" })
        .expect(200);

      // Org B untouched â€” the patch resolved the tenant from Org A's token.
      const orgBRes = await auth(orgBAdminTokens.accessToken)
        .get("/organisations/me")
        .expect(200);
      expect(orgBRes.body.name).toBe("Org B");
    });

    it("forbids an EMPLOYEE from renaming the organisation (role-based 403)", async () => {
      await auth(orgAEmployeeTokens.accessToken)
        .patch("/organisations/me")
        .send({ name: "Hacked" })
        .expect(403);
    });
  });
  describe("Super Admin organisation management", () => {
    it("forbids a regular org admin from creating organisations", async () => {
      await auth(orgAAdminTokens.accessToken)
        .post("/organisations")
        .send({ name: "Sneaky Corp" })
        .expect(403);
    });

    it("lets a SUPER_ADMIN create an organisation", async () => {
      const res = await auth(superAdminTokens.accessToken)
        .post("/organisations")
        .send({ name: "Org C", country: "AU" })
        .expect(201);
      expect(res.body.name).toBe("Org C");
      expect(res.body.country).toBe("AU");
      expect(res.body.status).toBe("ACTIVE");
      createdOrgId = res.body.id;

      // Give Org C an admin so we can prove suspension blocks logins.
      await prisma.user.update({
        where: { email: emails.orgCAdmin },
        data: { organisationId: createdOrgId },
      });
    });

    it("lists organisations including the new one", async () => {
      const res = await auth(superAdminTokens.accessToken)
        .get("/organisations")
        .expect(200);
      const names = res.body.map((org: { name: string }) => org.name);
      expect(names).toContain("Org A Renamed");
      expect(names).toContain("Org C");
    });

    it("suspends an organisation, blocking its users from logging in", async () => {
      const res = await auth(superAdminTokens.accessToken)
        .post(`/organisations/${createdOrgId}/suspend`)
        .expect(200);
      expect(res.body.status).toBe("SUSPENDED");

      await request(app.getHttpServer())
        .post("/auth/login")
        .send({ email: emails.orgCAdmin, password })
        .expect(403);
    });

    it("reactivates a suspended organisation and restores login", async () => {
      await auth(superAdminTokens.accessToken)
        .post(`/organisations/${createdOrgId}/activate`)
        .expect(200);

      const loginRes = await request(app.getHttpServer())
        .post("/auth/login")
        .send({ email: emails.orgCAdmin, password })
        .expect(200);
      expect(loginRes.body.accessToken).toEqual(expect.any(String));
    });

    it("returns 404 for an unknown organisation id", async () => {
      await auth(superAdminTokens.accessToken)
        .get("/organisations/does-not-exist")
        .expect(404);
    });
  });
});
