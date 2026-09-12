import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import * as argon2 from "argon2";
import type {
  EmployeeResponse,
  EmploymentStatus,
  WorkingHours,
} from "@ewm/shared-types";
import { UserRole } from "@ewm/shared-types";
import type { Prisma } from "@prisma/client";
import { Prisma as PrismaRuntime } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import type { RequestUser } from "../auth/strategies/jwt.strategy";
import type { CreateEmployeeDto } from "./dto/create-employee.dto";
import type { UpdateEmployeeDto } from "./dto/update-employee.dto";

// Every query is keyed by the organisationId that came from the JWT (via
// TenantGuard) — callers can never pass an arbitrary organisationId, so
// cross-tenant reads/writes are structurally impossible. Linked team/manager
// references are always re-validated against the same org.
@Injectable()
export class EmployeesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(organisationId: string, actor: RequestUser): Promise<EmployeeResponse[]> {
    const visibility = await this.employeeVisibility(organisationId, actor);
    const employees = await this.prisma.employee.findMany({
      where: { organisationId, deletedAt: null, ...visibility },
      orderBy: { createdAt: "asc" },
      include: { user: true, team: true, manager: true },
    });
    return employees.map((e) => this.toResponse(e));
  }

  async getById(organisationId: string, id: string, actor: RequestUser): Promise<EmployeeResponse> {
    const employee = await this.findInOrgOrThrow(organisationId, id);
    const visibility = await this.employeeVisibility(organisationId, actor);
    if (visibility.id && visibility.id !== employee.id) throw new ForbiddenException("You may not view this employee");
    return this.toResponse(employee);
  }

  private async employeeVisibility(organisationId: string, actor: RequestUser): Promise<Prisma.EmployeeWhereInput> {
    if (actor.role === UserRole.ORG_ADMIN) return {};
    const self = await this.prisma.employee.findFirst({ where: { organisationId, userId: actor.id, deletedAt: null }, select: { id: true, teamId: true } });
    if (!self) return { id: "00000000-0000-0000-0000-000000000000" };
    if (actor.role === UserRole.EMPLOYEE) return { id: self.id };
    if (actor.role === UserRole.MANAGER) return { user: { role: { in: [UserRole.EMPLOYEE, UserRole.TEAM_LEAD] } } };
    if (actor.role === UserRole.TEAM_LEAD) return self.teamId ? { teamId: self.teamId } : { id: self.id };
    return { id: self.id };
  }

  async create(
    organisationId: string,
    dto: CreateEmployeeDto,
    actor: RequestUser,
  ): Promise<EmployeeResponse> {
    const hasUserId = !!dto.userId;
    const hasCredentials = !!dto.email || !!dto.password;
    if (hasUserId && hasCredentials) {
      throw new BadRequestException(
        "Provide either userId or email/password, not both",
      );
    }
    if (!hasUserId && !hasCredentials) {
      throw new BadRequestException(
        "Provide either userId or email/password to create an employee",
      );
    }

    // RBAC: who is allowed to create which roles. A MANAGER can create
    // TEAM_LEADs and EMPLOYEEs but not other MANAGERs; a TEAM_LEAD can only
    // create EMPLOYEEs. ORG_ADMIN is unrestricted (except SUPER_ADMIN, which
    // is blocked in createWithUser).
    if (dto.role && dto.role !== UserRole.EMPLOYEE && !this.canCreateRole(actor.role, dto.role)) {
      throw new ForbiddenException(
        `Your role (${actor.role}) is not allowed to create a ${dto.role}`,
      );
    }

    // Validate cross-references against this org before writing anything.
    // Order matters: reference checks first (404s), then the duplicate-email
    // check (409) so a create-then-add flow doesn't produce misleading errors
    // when both problems exist at once.
    if (dto.teamId) {
      await this.findTeamInOrgOrThrow(organisationId, dto.teamId);
    }
    if (dto.managerId) {
      await this.assertCanBeManager(organisationId, dto.managerId);
    }

    // Reject duplicate emails up-front (409): the unique constraint alone
    // would leave a half-written orphan (user without profile) because it
    // fires inside the transaction after user creation.
    if (dto.email && !dto.userId) {
      const existingUser = await this.prisma.user.findUnique({
        where: { email: dto.email },
      });
      if (existingUser) {
        throw new ConflictException("A user with this email already exists");
      }
    }

    if (dto.userId) {
      return this.createByLink(organisationId, dto);
    }
    return this.createWithUser(organisationId, dto);
  }

  // ── Mode B: link to an existing user in the same org ──────────────────
  private async createByLink(
    organisationId: string,
    dto: CreateEmployeeDto,
  ): Promise<EmployeeResponse> {
    const user = await this.prisma.user.findFirst({
      where: { id: dto.userId!, organisationId },
      include: { employee: true },
    });
    if (!user) {
      throw new NotFoundException("User not found in this organisation");
    }
    if (user.employee) {
      throw new ConflictException("User is already linked to an employee");
    }
    if (!user.isActive) {
      throw new BadRequestException("Cannot link a disabled user account");
    }

    const employeeData: Prisma.EmployeeUncheckedCreateInput = {
      organisationId,
      userId: user.id,
      name: dto.name,
      ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
      ...(dto.teamId ? { teamId: dto.teamId } : {}),
      ...(dto.managerId ? { managerId: dto.managerId } : {}),
      ...(dto.timeZone ? { timeZone: dto.timeZone } : {}),
      ...(dto.workingHours !== undefined
        ? { workingHours: dto.workingHours as Prisma.InputJsonValue }
        : {}),
    };

    const employee = await this.prisma.employee.create({
      data: employeeData,
      include: { user: true, team: true, manager: true },
    });
    return this.toResponse(employee);
  }

  // ── Mode A: create login + profile together, atomically ───────────────
  private async createWithUser(
    organisationId: string,
    dto: CreateEmployeeDto,
  ): Promise<EmployeeResponse> {
    if (!dto.email || !dto.password) {
      throw new BadRequestException("email and password are both required");
    }
    const role = dto.role ?? UserRole.EMPLOYEE;
    if (role === UserRole.SUPER_ADMIN) {
      throw new BadRequestException(
        "Employees cannot be created with the SUPER_ADMIN role",
      );
    }

    const passwordHash = await argon2.hash(dto.password);
    const email = dto.email;
    const created = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email,
          passwordHash,
          role,
          isEmailVerified: false,
          organisationId,
        },
      });
      return tx.employee.create({
        data: {
          organisationId,
          userId: user.id,
          name: dto.name,
          ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
          ...(dto.teamId ? { teamId: dto.teamId } : {}),
          ...(dto.managerId ? { managerId: dto.managerId } : {}),
          ...(dto.timeZone ? { timeZone: dto.timeZone } : {}),
          ...(dto.workingHours !== undefined
            ? {
                workingHours:
                  dto.workingHours as Prisma.InputJsonValue,
              }
            : {}),
        } satisfies Prisma.EmployeeUncheckedCreateInput,
        include: { user: true, team: true, manager: true },
      });
    });
    return this.toResponse(created);
  }

  async update(
    organisationId: string,
    id: string,
    dto: UpdateEmployeeDto,
  ): Promise<EmployeeResponse> {
    const existing = await this.findInOrgOrThrow(organisationId, id);

    if (dto.teamId !== undefined && dto.teamId !== null) {
      await this.findTeamInOrgOrThrow(organisationId, dto.teamId);
    }
    if (dto.managerId !== undefined && dto.managerId !== null) {
      if (dto.managerId === id) {
        throw new BadRequestException("An employee cannot manage themselves");
      }
      await this.assertCanBeManager(organisationId, dto.managerId);
      await this.assertNoManagerCycle(organisationId, id, dto.managerId);
    }

    const updateData: Prisma.EmployeeUncheckedUpdateInput = {
      ...(dto.name !== undefined ? { name: dto.name } : {}),
      ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
      ...(dto.teamId !== undefined ? { teamId: dto.teamId } : {}),
      ...(dto.managerId !== undefined ? { managerId: dto.managerId } : {}),
      ...(dto.timeZone !== undefined ? { timeZone: dto.timeZone } : {}),
      ...(dto.workingHours !== undefined
        ? {
            workingHours:
              dto.workingHours === null
                ? PrismaRuntime.JsonNull
                : (dto.workingHours as Prisma.InputJsonValue),
          }
        : {}),
    };

    const employee = await this.prisma.employee.update({
      where: { id: existing.id },
      data: updateData,
      include: { user: true, team: true, manager: true },
    });
    return this.toResponse(employee);
  }

  // Disable blocks login (User.isActive=false + revoke live sessions);
  // enable restores it. employmentStatus is the HR record, isActive the gate.
  async setEmploymentStatus(
    organisationId: string,
    id: string,
    status: EmploymentStatus,
  ): Promise<EmployeeResponse> {
    const existing = await this.findInOrgOrThrow(organisationId, id);

    await this.prisma.$transaction(async (tx) => {
      await tx.employee.update({
        where: { id: existing.id },
        data: { employmentStatus: status },
      });
      if (existing.userId) {
        const isActive = status === "ACTIVE";
        await tx.user.update({
          where: { id: existing.userId },
          data: { isActive },
        });
        if (!isActive) {
          // Kill live sessions so disable takes effect immediately.
          await tx.refreshToken.updateMany({
            where: { userId: existing.userId, revokedAt: null },
            data: { revokedAt: new Date() },
          });
        }
      }
    });

    // Re-read to include the synced isActive flag in the response.
    const fresh = await this.prisma.employee.findUniqueOrThrow({
      where: { id: existing.id },
      include: { user: true, team: true, manager: true },
    });
    return this.toResponse(fresh);
  }

  private async findInOrgOrThrow(organisationId: string, id: string) {
    const employee = await this.prisma.employee.findFirst({
      where: { id, organisationId, deletedAt: null },
      include: { user: true, team: true, manager: true },
    });
    if (!employee) {
      throw new NotFoundException("Employee not found");
    }
    return employee;
  }

  private async findTeamInOrgOrThrow(organisationId: string, id: string) {
    const team = await this.prisma.team.findFirst({
      where: { id, organisationId, deletedAt: null },
    });
    if (!team) {
      throw new NotFoundException("Team not found in this organisation");
    }
    return team;
  }

  // Walk the manager chain up from the proposed manager; if we reach the
  // employee being updated, assigning it would create a cycle.
  private async assertNoManagerCycle(
    organisationId: string,
    employeeId: string,
    proposedManagerId: string,
  ): Promise<void> {
    let cursor: string | null = proposedManagerId;
    for (let depth = 0; depth < 50 && cursor; depth++) {
      if (cursor === employeeId) {
        throw new BadRequestException(
          "Assigning this manager would create a reporting cycle",
        );
      }
      const next = await this.prisma.employee.findFirst({
        where: { id: cursor, organisationId, deletedAt: null },
        select: { managerId: true },
      });
      cursor = next?.managerId ?? null;
    }
  }

  // A manager link is only valid when the target actually holds a management
  // role in this org — an EMPLOYEE-profile cannot be assigned as someone's
  // manager (prevents UI filtering being bypassed via a raw API call).
  private async assertCanBeManager(organisationId: string, managerId: string) {
    const manager = await this.findInOrgOrThrow(organisationId, managerId);
    const role = manager.user?.role;
    if (!this.isManagerRole(role)) {
      throw new BadRequestException(
        "Only ORG_ADMIN, MANAGER or TEAM_LEAD employees can be assigned as a manager",
      );
    }
  }

  // Role ladder for creation: ORG_ADMIN may create anything; MANAGER may
  // create TEAM_LEAD + EMPLOYEE; TEAM_LEAD only EMPLOYEE. EMPLOYEE has no
  // creation rights (but the controller blocks it before reaching here).
  private canCreateRole(actorRole: string, targetRole: string): boolean {
    if (actorRole === UserRole.ORG_ADMIN) return true;
    if (actorRole === UserRole.MANAGER) {
      return targetRole === UserRole.TEAM_LEAD || targetRole === UserRole.EMPLOYEE;
    }
    if (actorRole === UserRole.TEAM_LEAD) {
      return targetRole === UserRole.EMPLOYEE;
    }
    return false;
  }

  // Who counts as an assignable manager/reporting line.
  private isManagerRole(role: string | null | undefined): boolean {
    return (
      role === UserRole.ORG_ADMIN ||
      role === UserRole.MANAGER ||
      role === UserRole.TEAM_LEAD
    );
  }

  private toResponse(employee: {
    id: string;
    organisationId: string;
    userId: string | null;
    user?: { email: string; role: string; isActive: boolean } | null;
    name: string;
    phone: string | null;
    teamId: string | null;
    team?: { name: string } | null;
    managerId: string | null;
    manager?: { name: string } | null;
    timeZone: string;
    workingHours: unknown;
    employmentStatus: string;
    createdAt: Date;
    updatedAt: Date;
  }): EmployeeResponse {
    return {
      id: employee.id,
      organisationId: employee.organisationId,
      userId: employee.userId,
      email: employee.user?.email ?? null,
      role: employee.user?.role ?? null,
      name: employee.name,
      phone: employee.phone,
      teamId: employee.teamId,
      teamName: employee.team?.name ?? null,
      managerId: employee.managerId,
      managerName: employee.manager?.name ?? null,
      timeZone: employee.timeZone,
      workingHours: (employee.workingHours as WorkingHours | null) ?? null,
      employmentStatus: employee.employmentStatus as EmploymentStatus,
      isActive: employee.user?.isActive ?? null,
      createdAt: employee.createdAt.toISOString(),
      updatedAt: employee.updatedAt.toISOString(),
    };
  }
}
