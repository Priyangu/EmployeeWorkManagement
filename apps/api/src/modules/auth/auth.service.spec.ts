import { Test, TestingModule } from "@nestjs/testing";
import {
  UnauthorizedException,
  BadRequestException,
  ForbiddenException,
} from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import * as argon2 from "argon2";
import { AuthService } from "./auth.service";
import { PrismaService } from "../../prisma/prisma.service";
import { EmailService } from "../../common/email/email.service";
import { hashOpaqueToken } from "./token.util";

// PrismaService is mocked entirely here — these are unit tests for
// AuthService's decision logic, not integration tests against a real
// database. See docs/architecture.md Phase 2 for the e2e tests that
// exercise this against a live Postgres instance.
describe("AuthService", () => {
  let service: AuthService;
  let prisma: {
    user: Record<string, jest.Mock>;
    refreshToken: Record<string, jest.Mock>;
    passwordResetToken: Record<string, jest.Mock>;
    emailVerificationToken: Record<string, jest.Mock>;
    $transaction: jest.Mock;
  };
  let emailService: { sendMail: jest.Mock };

  const activeUser = {
    id: "user-1",
    email: "manager@example.com",
    passwordHash: "",
    role: "MANAGER",
    isActive: true,
    isEmailVerified: false,
    organisationId: "org-1",
  };

  beforeAll(async () => {
    activeUser.passwordHash = await argon2.hash("correct-horse-battery-staple");
  });

  beforeEach(async () => {
    prisma = {
      user: {
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        update: jest.fn(),
      },
      refreshToken: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      passwordResetToken: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      emailVerificationToken: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn((ops) => Promise.all(ops)),
    };

    emailService = { sendMail: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: "test-secret" })],
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: EmailService, useValue: emailService },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  describe("login", () => {
    it("issues tokens for correct credentials", async () => {
      prisma.user.findUnique.mockResolvedValue(activeUser);
      prisma.user.update.mockResolvedValue(activeUser);
      prisma.refreshToken.create.mockResolvedValue({});

      const result = await service.login(
        activeUser.email,
        "correct-horse-battery-staple",
      );

      expect(result.accessToken).toEqual(expect.any(String));
      expect(result.refreshToken).toHaveLength(64);
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: activeUser.id } }),
      );
    });

    it("rejects a wrong password", async () => {
      prisma.user.findUnique.mockResolvedValue(activeUser);

      await expect(
        service.login(activeUser.email, "wrong-password"),
      ).rejects.toThrow(UnauthorizedException);
    });

    it("rejects an unknown email with the same error as a wrong password", async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.login("nobody@example.com", "whatever"),
      ).rejects.toThrow(UnauthorizedException);
    });

    it("rejects a disabled user even with the correct password", async () => {
      prisma.user.findUnique.mockResolvedValue({ ...activeUser, isActive: false });

      await expect(
        service.login(activeUser.email, "correct-horse-battery-staple"),
      ).rejects.toThrow("This account has been disabled");
    });

    it("rejects a login when the user's organisation is suspended", async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...activeUser,
        organisation: { status: "SUSPENDED" },
      });

      await expect(
        service.login(activeUser.email, "correct-horse-battery-staple"),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe("refresh", () => {
    it("rejects an unknown or already-revoked refresh token", async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(null);
      await expect(service.refresh("not-a-real-token")).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it("rejects an expired refresh token", async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: "rt-1",
        tokenHash: hashOpaqueToken("expired-token"),
        expiresAt: new Date(Date.now() - 1000),
        revokedAt: null,
        user: activeUser,
      });
      await expect(service.refresh("expired-token")).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it("revokes the used token and issues a new pair on success", async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: "rt-1",
        tokenHash: hashOpaqueToken("good-token"),
        expiresAt: new Date(Date.now() + 100_000),
        revokedAt: null,
        user: activeUser,
      });
      prisma.refreshToken.update.mockResolvedValue({});
      prisma.refreshToken.create.mockResolvedValue({});

      const result = await service.refresh("good-token");

      expect(prisma.refreshToken.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "rt-1" },
          data: expect.objectContaining({ revokedAt: expect.any(Date) }),
        }),
      );
      expect(result.accessToken).toEqual(expect.any(String));
    });
  });

  describe("forgotPassword", () => {
    it("does nothing observable for an unknown email (no user enumeration)", async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await service.forgotPassword("nobody@example.com");
      expect(prisma.passwordResetToken.create).not.toHaveBeenCalled();
      expect(emailService.sendMail).not.toHaveBeenCalled();
    });

    it("creates a reset token and emails it for a known user", async () => {
      prisma.user.findUnique.mockResolvedValue(activeUser);
      prisma.passwordResetToken.create.mockResolvedValue({});

      await service.forgotPassword(activeUser.email);

      expect(prisma.passwordResetToken.create).toHaveBeenCalled();
      expect(emailService.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({ to: activeUser.email }),
      );
    });
  });

  describe("resetPassword", () => {
    it("rejects an invalid or already-used token", async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue(null);
      await expect(
        service.resetPassword("bad-token", "new-password-123"),
      ).rejects.toThrow(BadRequestException);
    });

    it("rejects an expired token", async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue({
        id: "prt-1",
        userId: activeUser.id,
        usedAt: null,
        expiresAt: new Date(Date.now() - 1000),
      });
      await expect(
        service.resetPassword("expired-token", "new-password-123"),
      ).rejects.toThrow(BadRequestException);
    });

    it("updates the password and revokes existing sessions on success", async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue({
        id: "prt-1",
        userId: activeUser.id,
        usedAt: null,
        expiresAt: new Date(Date.now() + 100_000),
      });

      await service.resetPassword("good-token", "new-password-123");

      expect(prisma.$transaction).toHaveBeenCalled();
      const opsPassed = prisma.$transaction.mock.calls[0][0];
      expect(opsPassed).toHaveLength(3); // update password, mark token used, revoke sessions
    });
  });
});
