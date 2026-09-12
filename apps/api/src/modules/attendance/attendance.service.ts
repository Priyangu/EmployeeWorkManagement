// Phase 9: Attendance — clock in/out tracking. One active (clockOut = null)
// record per employee at a time.
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { AttendanceResponse } from "@ewm/shared-types";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import type { RequestUser } from "../auth/strategies/jwt.strategy";
import type { ClockOutDto } from "./dto/attendance.dto";

const MANAGER_LEVEL_ROLES = new Set(["ORG_ADMIN", "MANAGER", "TEAM_LEAD"]);

type AttendanceRow = Prisma.AttendanceGetPayload<{
  include: { employee: { select: { name: true; workingHours: true } } };
}>;

@Injectable()
export class AttendanceService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly include = {
    employee: { select: { name: true, workingHours: true } },
  } as const;

  private async resolveTargetEmployee(
    organisationId: string,
    user: RequestUser,
    employeeId?: string,
  ) {
    if (!employeeId) {
      return this.resolveSelfEmployee(organisationId, user);
    }
    if (!MANAGER_LEVEL_ROLES.has(user.role)) {
      throw new ForbiddenException("Only managers can view others' attendance");
    }
    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, organisationId, deletedAt: null },
    });
    if (!employee) {
      throw new NotFoundException("Employee not found in this organisation");
    }
    return employee;
  }

  private async resolveSelfEmployee(organisationId: string, user: RequestUser) {
    const employee = await this.prisma.employee.findFirst({
      where: { userId: user.id, organisationId, deletedAt: null },
    });
    if (!employee) {
      throw new NotFoundException(
        "Your user account has no Employee profile in this organisation",
      );
    }
    return employee;
  }

  // Check expected start hour from workingHours JSON (e.g. {mon: {start: "09:00"}}).
  private getExpectedStartHour(emp: { workingHours: unknown }): number {
    const wh = emp.workingHours as { [day: string]: { start?: string } } | null;
    if (!wh || typeof wh !== "object") return 9;
    const day = wh["mon"] ?? Object.values(wh)[0];
    if (day?.start) {
      const [h] = day.start.split(":");
      return parseInt(h, 10) || 9;
    }
        return 9;
  }

  private toResponse(a: AttendanceRow): AttendanceResponse {
    return {
      id: a.id,
      organisationId: a.organisationId,
      employeeId: a.employeeId,
      employeeName: a.employee?.name ?? "—",
      clockIn: a.clockIn.toISOString(),
      clockOut: a.clockOut ? a.clockOut.toISOString() : null,
      breakMinutes: a.breakMinutes,
      isLate: a.isLate,
      isEarlyDeparture: a.isEarlyDeparture,
      createdAt: a.createdAt.toISOString(),
      updatedAt: a.updatedAt.toISOString(),
    };
  }

  // POST /attendance/clock-in
  async clockIn(
    organisationId: string,
    user: RequestUser,
    employeeId?: string,
  ): Promise<AttendanceResponse> {
    const target = await this.resolveTargetEmployee(organisationId, user, employeeId);

    const active = await this.prisma.attendance.findFirst({
      where: { organisationId, employeeId: target.id, clockOut: null },
    });
    if (active) {
      throw new ConflictException("You are already clocked in — clock out first");
    }

    const now = new Date();
    const expectedHour = this.getExpectedStartHour(target);
    const isLate = now.getUTCHours() > expectedHour;

    const record = await this.prisma.attendance.create({
      data: {
        organisationId,
        employeeId: target.id,
        clockIn: now,
        isLate,
      },
      include: this.include,
    });

    return this.toResponse(record);
  }

  // POST /attendance/clock-out
  async clockOut(
    organisationId: string,
    user: RequestUser,
    employeeId?: string,
    dto?: ClockOutDto,
  ): Promise<AttendanceResponse> {
    const target = await this.resolveTargetEmployee(organisationId, user, employeeId);

    const active = await this.prisma.attendance.findFirst({
      where: { organisationId, employeeId: target.id, clockOut: null },
      include: this.include,
    });
    if (!active) {
      throw new BadRequestException("You have no active clock-in to clock out");
    }

    const now = new Date();
    const isEarlyDeparture = now.getUTCHours() < 17;

    const updated = await this.prisma.attendance.update({
      where: { id: active.id },
      data: {
        clockOut: now,
        ...(dto?.breakMinutes ? { breakMinutes: dto.breakMinutes } : {}),
        isEarlyDeparture,
      },
      include: this.include,
    });

    return this.toResponse(updated);
  }

  // GET /attendance?employeeId=&from=&to=
  async list(
    organisationId: string,
    user: RequestUser,
    query: { employeeId?: string; from?: string; to?: string },
  ): Promise<AttendanceResponse[]> {
    const where: Prisma.AttendanceWhereInput = { organisationId };

    if (query.employeeId) {
      if (!MANAGER_LEVEL_ROLES.has(user.role)) {
        const self = await this.resolveSelfEmployee(organisationId, user);
        if (query.employeeId !== self.id) {
          throw new ForbiddenException("You may only view your own attendance");
        }
      }
      where.employeeId = query.employeeId;
    } else if (!MANAGER_LEVEL_ROLES.has(user.role)) {
      const self = await this.resolveSelfEmployee(organisationId, user);
      where.employeeId = self.id;
    }

    if (query.from || query.to) {
      where.AND = {
        ...(query.from ? { clockIn: { gte: new Date(query.from) } } : {}),
        ...(query.to ? { clockIn: { lte: new Date(query.to) } } : {}),
      };
    }

    const rows = await this.prisma.attendance.findMany({
      where,
      orderBy: { clockIn: "desc" },
      include: this.include,
    });

    return rows.map((a) => this.toResponse(a));
  }
}

