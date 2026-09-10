import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  ForbiddenException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as argon2 from "argon2";
import type { AuthTokens } from "@ewm/shared-types";
import { PrismaService } from "../../prisma/prisma.service";
import { EmailService } from "../../common/email/email.service";
import { generateOpaqueToken, hashOpaqueToken } from "./token.util";
import {
  ACCESS_TOKEN_TTL_SECONDS,
  REFRESH_TOKEN_TTL_MS,
  PASSWORD_RESET_TTL_MS,
  EMAIL_VERIFICATION_TTL_MS,
} from "./auth.constants";

export interface JwtPayload {
  sub: string; // user id
  email: string;
  role: string;
  organisationId: string | null;
}

// AuthTokens is defined in @ewm/shared-types so web/mobile can share the
// exact login/refresh response shape.

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly emailService: EmailService,
  ) {}

  async login(email: string, password: string): Promise<AuthTokens> {
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: { organisation: true },
    });

    // Same error for "no such user" and "wrong password" — never reveal
    // which one it was, that leaks which emails have accounts.
    if (!user) {
      throw new UnauthorizedException("Invalid email or password");
    }

    const passwordMatches = await argon2.verify(user.passwordHash, password);
    if (!passwordMatches) {
      throw new UnauthorizedException("Invalid email or password");
    }

    if (!user.isActive) {
      throw new UnauthorizedException("This account has been disabled");
    }

    // Users can also be blocked at the organisation level (Phase 3) — a
    // suspended tenant's employees must not get fresh sessions.
    this.assertOrganisationActive(user.organisation);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    return this.issueTokens(
      user.id,
      user.email,
      user.role,
      user.organisationId,
    );
  }

  async logout(refreshToken: string): Promise<void> {
    const tokenHash = hashOpaqueToken(refreshToken);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    // No error if the token was already invalid/revoked — logout is
    // idempotent from the caller's point of view.
  }

  async refresh(refreshToken: string): Promise<AuthTokens> {
    const tokenHash = hashOpaqueToken(refreshToken);
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: { include: { organisation: true } } },
    });

    if (
      !stored ||
      stored.revokedAt ||
      stored.expiresAt.getTime() < Date.now()
    ) {
      throw new UnauthorizedException("Invalid or expired refresh token");
    }

    if (!stored.user.isActive) {
      throw new UnauthorizedException("This account has been disabled");
    }

    this.assertOrganisationActive(stored.user.organisation);

    // Rotate: revoke the used refresh token and issue a fresh pair. This
    // means a stolen-and-reused refresh token is detectable (it'll already
    // be revoked when the legitimate client tries to use it next).
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    return this.issueTokens(
      stored.user.id,
      stored.user.email,
      stored.user.role,
      stored.user.organisationId,
    );
  }

  async forgotPassword(email: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email } });

    // Always behave the same way whether or not the email exists, so this
    // endpoint can't be used to enumerate registered accounts.
    if (!user) {
      return;
    }

    const { token, tokenHash } = generateOpaqueToken();
    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS),
      },
    });

    await this.emailService.sendMail({
      to: user.email,
      subject: "Reset your password",
      body: `Use this token to reset your password (valid 1 hour): ${token}`,
    });
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const tokenHash = hashOpaqueToken(token);
    const record = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash },
    });

    if (
      !record ||
      record.usedAt ||
      record.expiresAt.getTime() < Date.now()
    ) {
      throw new BadRequestException("Invalid or expired reset token");
    }

    const passwordHash = await argon2.hash(newPassword);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: record.userId },
        data: { passwordHash },
      }),
      this.prisma.passwordResetToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
      // Resetting a password invalidates every existing session — if
      // someone else had access to the account, this locks them out too.
      this.prisma.refreshToken.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
  }

  async sendEmailVerification(userId: string): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });

    const { token, tokenHash } = generateOpaqueToken();
    await this.prisma.emailVerificationToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt: new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS),
      },
    });

    await this.emailService.sendMail({
      to: user.email,
      subject: "Verify your email",
      body: `Use this token to verify your email (valid 24 hours): ${token}`,
    });
  }

  async verifyEmail(token: string): Promise<void> {
    const tokenHash = hashOpaqueToken(token);
    const record = await this.prisma.emailVerificationToken.findUnique({
      where: { tokenHash },
    });

    if (
      !record ||
      record.usedAt ||
      record.expiresAt.getTime() < Date.now()
    ) {
      throw new BadRequestException("Invalid or expired verification token");
    }

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: record.userId },
        data: { isEmailVerified: true },
      }),
      this.prisma.emailVerificationToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
    ]);
  }

  private assertOrganisationActive(
    organisation: { status: string } | null,
  ): void {
    // Compare against the literal rather than the Prisma-generated enum type:
    // Prisma's enums are nominal and don't structurally match the
    // shared-types enum, so keep the boundary here a plain string check.
    if (organisation && organisation.status !== "ACTIVE") {
      throw new ForbiddenException("This organisation has been suspended");
    }
  }

  private async issueTokens(
    userId: string,
    email: string,
    role: string,
    organisationId: string | null,
  ): Promise<AuthTokens> {
    const payload: JwtPayload = {
      sub: userId,
      email,
      role,
      organisationId,
    };
    const accessToken = await this.jwtService.signAsync(payload, {
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    });

    const { token: refreshToken, tokenHash } = generateOpaqueToken();
    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash,
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
      },
    });

    return {
      accessToken,
      refreshToken,
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    };
  }
}
