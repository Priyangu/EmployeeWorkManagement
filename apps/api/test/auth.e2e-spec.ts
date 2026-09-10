import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import request from "supertest";
import * as argon2 from "argon2";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";

// These tests hit a real Postgres database (DATABASE_URL from .env / CI env)
// and exercise the full HTTP stack, unlike auth.service.spec.ts which mocks
// Prisma. Run `pnpm prisma:migrate` against a test database before running
// this file locally — see README.md.
describe("Auth (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const activePassword = "correct-horse-battery-staple";
  let activeUserEmail: string;
  let disabledUserEmail: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();

    prisma = moduleFixture.get(PrismaService);

    const suffix = Date.now();
    activeUserEmail = `active-${suffix}@ewm.test`;
    disabledUserEmail = `disabled-${suffix}@ewm.test`;

    const passwordHash = await argon2.hash(activePassword);
    await prisma.user.create({
      data: { email: activeUserEmail, passwordHash, role: "EMPLOYEE", isActive: true },
    });
    await prisma.user.create({
      data: { email: disabledUserEmail, passwordHash, role: "EMPLOYEE", isActive: false },
    });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { email: { in: [activeUserEmail, disabledUserEmail] } },
    });
    await app.close();
  });

  describe("POST /auth/login", () => {
    it("succeeds with correct credentials and returns tokens", async () => {
      const res = await request(app.getHttpServer())
        .post("/auth/login")
        .send({ email: activeUserEmail, password: activePassword })
        .expect(200);

      expect(res.body.accessToken).toEqual(expect.any(String));
      expect(res.body.refreshToken).toEqual(expect.any(String));
    });

    it("rejects an incorrect password", async () => {
      await request(app.getHttpServer())
        .post("/auth/login")
        .send({ email: activeUserEmail, password: "wrong-password" })
        .expect(401);
    });

    it("rejects a disabled user even with the correct password", async () => {
      await request(app.getHttpServer())
        .post("/auth/login")
        .send({ email: disabledUserEmail, password: activePassword })
        .expect(401);
    });

    it("rejects a malformed request body", async () => {
      await request(app.getHttpServer())
        .post("/auth/login")
        .send({ email: "not-an-email" })
        .expect(400);
    });

    // Throttle is configured for 5 requests/60s on this route (see
    // AuthController). The 6th attempt in the same window should be
    // rejected before it even reaches AuthService.
    it("rate limits repeated login attempts", async () => {
      const attempts = Array.from({ length: 6 }, () =>
        request(app.getHttpServer())
          .post("/auth/login")
          .send({ email: activeUserEmail, password: "wrong-password" }),
      );
      const results = await Promise.all(attempts);
      const statuses = results.map((r) => r.status);
      expect(statuses).toContain(429);
    });
  });

  describe("POST /auth/password/forgot", () => {
    it("returns 204 for both known and unknown emails (no user enumeration)", async () => {
      await request(app.getHttpServer())
        .post("/auth/password/forgot")
        .send({ email: activeUserEmail })
        .expect(204);

      await request(app.getHttpServer())
        .post("/auth/password/forgot")
        .send({ email: "definitely-not-registered@ewm.test" })
        .expect(204);
    });
  });

  describe("POST /auth/password/reset", () => {
    it("rejects an invalid token", async () => {
      await request(app.getHttpServer())
        .post("/auth/password/reset")
        .send({ token: "not-a-real-token", newPassword: "new-password-123" })
        .expect(400);
    });
  });
});
