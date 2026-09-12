// Phase 9: Timesheets. Weekly aggregation of COMPLETED time entries, with a
// submit/approve/reject lifecycle. CRITICAL RULE: once APPROVED, a timesheet
// is immutable — edits after approval require a correction (POST /:id/correct)
// that creates a new version linked to the original via parentTimesheetId.
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type {
  TimesheetResponse,
  TimesheetStatus,
  TimesheetSummaryGranularity,
  TimesheetSummaryResponse,
} from "@ewm/shared-types";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import type { RequestUser } from "../auth/strategies/jwt.strategy";
import type {
  CreateTimesheetDto,
  RejectTimesheetDto,
} from "./dto/timesheets.dto";
import { NotificationsService } from "../notifications/notifications.service";

const MANAGER_LEVEL_ROLES = new Set(["ORG_ADMIN", "MANAGER", "TEAM_LEAD"]);

type TimesheetRow = Prisma.TimesheetGetPayload<{
  include: { employee: { select: { name: true } }; approvedBy: { select: { email: true } } };
}>;

@Injectable()
export class TimesheetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

    private readonly include = {
    employee: { select: { name: true } },
    approvedBy: { select: { email: true } },
  } as const;

  // Resolve whose timesheet we're acting on (manager overrides, else self).
  private async resolveTargetEmployee(
    organisationId: string,
    user: RequestUser,
    employeeId?: string,
  ) {
    if (!employeeId) {
      return this.resolveSelfEmployee(organisationId, user);
    }
    if (!MANAGER_LEVEL_ROLES.has(user.role)) {
      throw new ForbiddenException("Only managers can create timesheets for others");
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
        "Your user account has no Employee profile in this organisation"
      );
    }
    return employee;
  }

  // Load a timesheet and enforce scoping/ownership.
  private async loadForActor(
    organisationId: string,
    user: RequestUser,
    id: string,
  ): Promise<TimesheetRow> {
    const ts = await this.prisma.timesheet.findFirst({
      where: { id, organisationId },
      include: this.include,
    });
    if (!ts) {
      throw new NotFoundException("Timesheet not found");
    }
    if (!MANAGER_LEVEL_ROLES.has(user.role)) {
      const self = await this.resolveSelfEmployee(organisationId, user);
      if (ts.employeeId !== self.id) {
        throw new ForbiddenException("You may only access your own timesheets");
      }
    }
    return ts;
  }

  // Monday 00:00 UTC of the week containing `date`.
  private toMonday(date: Date): Date {
    const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    const offset = (d.getUTCDay() + 6) % 7; // 0 = Monday
    d.setUTCDate(d.getUTCDate() - offset);
    return d;
  }

  // Sunday 23:59:59.999 UTC of the same week.
  private toSunday(monday: Date): Date {
    return new Date(monday.getTime() + 7 * 24 * 3600 * 1000 - 1);
  }

  private toResponse(ts: TimesheetRow): TimesheetResponse {
    return {
      id: ts.id,
      organisationId: ts.organisationId,
      employeeId: ts.employeeId,
      employeeName: ts.employee?.name ?? "—",
      periodStart: ts.periodStart.toISOString(),
      periodEnd: ts.periodEnd.toISOString(),
      status: ts.status as TimesheetStatus,
      totalMinutes: ts.totalMinutes,
      approvedById: ts.approvedById,
      approvedByName: ts.approvedBy?.email ?? null,
      approvedAt: ts.approvedAt ? ts.approvedAt.toISOString() : null,
      rejectionReason: ts.rejectionReason,
      version: ts.version,
      parentTimesheetId: ts.parentTimesheetId,
      createdAt: ts.createdAt.toISOString(),
            updatedAt: ts.updatedAt.toISOString(),
    };
  }

  // ── List ───────────────────────────────────────────────────────────────────

  // GET /timesheets?employeeId=&status=&periodFrom=&periodTo=
  async list(
    organisationId: string,
    user: RequestUser,
    query: {
      employeeId?: string;
      status?: TimesheetStatus;
      periodFrom?: string;
      periodTo?: string;
    },
  ): Promise<TimesheetResponse[]> {
    const where: Prisma.TimesheetWhereInput = { organisationId };

    if (query.employeeId) {
      if (!MANAGER_LEVEL_ROLES.has(user.role)) {
        const self = await this.resolveSelfEmployee(organisationId, user);
        if (query.employeeId !== self.id) {
          throw new ForbiddenException("You may only view your own timesheets");
        }
      }
      where.employeeId = query.employeeId;
    } else if (!MANAGER_LEVEL_ROLES.has(user.role)) {
      const self = await this.resolveSelfEmployee(organisationId, user);
      where.employeeId = self.id;
    }

    if (query.status) {
      where.status = query.status;
    }

    if (query.periodFrom || query.periodTo) {
      where.AND = {
        ...(query.periodFrom ? { periodStart: { gte: new Date(query.periodFrom) } } : {}),
        ...(query.periodTo ? { periodEnd: { lte: new Date(query.periodTo) } } : {}),
      };
    }

    const rows = await this.prisma.timesheet.findMany({
      where,
      orderBy: { periodStart: "desc" },
      include: this.include,
    });

    return rows.map((ts) => this.toResponse(ts));
  }

  // GET /timesheets/summary — aggregate completed time entries into calendar
  // buckets without creating mutable timesheet snapshots.
  async summary(
    organisationId: string,
    user: RequestUser,
    query: {
      granularity: TimesheetSummaryGranularity;
      periodFrom: string;
      periodTo: string;
      employeeId?: string;
    },
  ): Promise<TimesheetSummaryResponse[]> {
    const periodFrom = new Date(query.periodFrom);
    const periodTo = new Date(query.periodTo);
    if (periodFrom >= periodTo) {
      throw new ConflictException("periodFrom must be before periodTo");
    }

    let employeeId = query.employeeId;
    let employeeName: string | undefined;
    if (!MANAGER_LEVEL_ROLES.has(user.role)) {
      const self = await this.resolveSelfEmployee(organisationId, user);
      if (employeeId && employeeId !== self.id) {
        throw new ForbiddenException("You may only view your own timesheet summary");
      }
      employeeId = self.id;
      employeeName = self.name;
    } else if (employeeId) {
      const employee = await this.prisma.employee.findFirst({
        where: { id: employeeId, organisationId, deletedAt: null },
        select: { name: true },
      });
      if (!employee) {
        throw new NotFoundException("Employee not found in this organisation");
      }
      employeeName = employee.name;
    }

    const entries = await this.prisma.timeEntry.findMany({
      where: {
        organisationId,
        ...(employeeId ? { employeeId } : {}),
        status: "COMPLETED",
        startTime: { lt: periodTo },
        endTime: { gt: periodFrom },
      },
      include: { employee: { select: { name: true } } },
      orderBy: { startTime: "asc" },
    });

    const buckets = new Map<string, TimesheetSummaryResponse>();
    for (const entry of entries) {
      if (!entry.endTime || entry.endTime <= periodFrom || entry.startTime >= periodTo) {
        continue;
      }

      const bucketStart = this.summaryBucketStart(entry.startTime, query.granularity);
      const key = `${entry.employeeId}:${bucketStart.toISOString()}`;
      const bucketEnd = this.summaryBucketEnd(bucketStart, query.granularity);
      const clippedStart = entry.startTime < periodFrom ? periodFrom : entry.startTime;
      const clippedEnd = entry.endTime > periodTo ? periodTo : entry.endTime;
      const minutes = Math.max(
        0,
        Math.round((clippedEnd.getTime() - clippedStart.getTime()) / 60000),
      );
      const existing = buckets.get(key);
      if (existing) {
        existing.totalMinutes += minutes;
      } else {
        buckets.set(key, {
          employeeId: entry.employeeId,
          employeeName: employeeName ?? entry.employee.name,
          periodStart: bucketStart.toISOString(),
          periodEnd: bucketEnd.toISOString(),
          totalMinutes: minutes,
        });
      }
    }

    return [...buckets.values()].sort(
      (a, b) =>
        a.periodStart.localeCompare(b.periodStart) ||
        a.employeeName.localeCompare(b.employeeName),
    );
  }

  private summaryBucketStart(
    date: Date,
    granularity: TimesheetSummaryGranularity,
  ): Date {
    const start = new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
    );
    if (granularity === "weekly") {
      start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
    } else if (granularity === "monthly") {
      start.setUTCDate(1);
    }
    return start;
  }

  private summaryBucketEnd(
    start: Date,
    granularity: TimesheetSummaryGranularity,
  ): Date {
    const end = new Date(start);
    if (granularity === "daily") end.setUTCDate(end.getUTCDate() + 1);
    if (granularity === "weekly") end.setUTCDate(end.getUTCDate() + 7);
    if (granularity === "monthly") end.setUTCMonth(end.getUTCMonth() + 1);
    end.setTime(end.getTime() - 1);
    return end;
  }

  // ── Create ─────────────────────────────────────────────────────────────────

  // POST /timesheets — aggregate COMPLETED time entries for the week into a
  // draft timesheet. If a DRAFT already exists for the same week+employee,
  // it is refreshed with current totals. SUBMITTED/APPROVED/REJECTED rows
  // are never overwritten — use the correction flow instead.
  async create(
    organisationId: string,
    user: RequestUser,
    dto: CreateTimesheetDto,
  ): Promise<TimesheetResponse> {
    const target = await this.resolveTargetEmployee(organisationId, user, dto.employeeId);

    const monday = this.toMonday(new Date(dto.periodStart));
    const sunday = this.toSunday(monday);

    const entries = await this.prisma.timeEntry.findMany({
      where: {
        organisationId,
        employeeId: target.id,
        status: "COMPLETED",
        startTime: { gte: monday },
        endTime: { lte: sunday },
      },
    });

    const totalMinutes = entries.reduce(
      (sum, e) => sum + (e.durationSeconds ?? 0) / 60,
      0,
    );

    const existing = await this.prisma.timesheet.findFirst({
      where: {
        organisationId,
        employeeId: target.id,
        periodStart: monday,
      },
    });

    if (existing && existing.status !== "DRAFT") {
      throw new ConflictException(
        `A timesheet for this period already exists with status ${existing.status}. Use the correction flow to make changes.`,
      );
    }

    let ts;
    if (existing) {
      ts = await this.prisma.timesheet.update({
        where: { id: existing.id },
        data: { totalMinutes: Math.round(totalMinutes) },
        include: this.include,
      });
    } else {
      ts = await this.prisma.timesheet.create({
        data: {
          organisationId,
          employeeId: target.id,
          periodStart: monday,
          periodEnd: sunday,
          totalMinutes: Math.round(totalMinutes),
        },
        include: this.include,
      });
    }

        return this.toResponse(ts);
  }

  // ── Submit ─────────────────────────────────────────────────────────────────

  // POST /timesheets/:id/submit
  async submit(
    organisationId: string,
    user: RequestUser,
    id: string,
  ): Promise<TimesheetResponse> {
    const ts = await this.loadForActor(organisationId, user, id);

    const self = await this.resolveSelfEmployee(organisationId, user);
    if (ts.employeeId !== self.id) {
      throw new ForbiddenException("Only the timesheet owner can submit it");
    }

    if (ts.status !== "DRAFT") {
      throw new ConflictException(
        `Cannot submit a timesheet with status ${ts.status}. Only DRAFT timesheets can be submitted.`,
      );
    }

    const updated = await this.prisma.timesheet.update({
      where: { id },
      data: { status: "SUBMITTED" },
      include: this.include,
    });

    return this.toResponse(updated);
  }

  // ── Approve ────────────────────────────────────────────────────────────────

  // POST /timesheets/:id/approve
  async approve(
    organisationId: string,
    user: RequestUser,
    id: string,
  ): Promise<TimesheetResponse> {
    if (!MANAGER_LEVEL_ROLES.has(user.role)) {
      throw new ForbiddenException("Only managers can approve timesheets");
    }

    const ts = await this.prisma.timesheet.findFirst({
      where: { id, organisationId },
      include: this.include,
    });
    if (!ts) {
      throw new NotFoundException("Timesheet not found");
    }

    if (ts.status !== "SUBMITTED") {
      throw new ConflictException(
        `Cannot approve a timesheet with status ${ts.status}. Only SUBMITTED timesheets can be approved.`,
      );
    }

    const updated = await this.prisma.timesheet.update({
      where: { id },
      data: {
        status: "APPROVED",
        approvedById: user.id,
        approvedAt: new Date(),
        rejectionReason: null,
      },
      include: this.include,
    });

    await this.prisma.auditLog.create({
      data: {
        organisationId,
        userId: user.id,
        action: "timesheet.approve",
        entityType: "Timesheet",
        entityId: ts.id,
        oldValueJson: { status: ts.status },
        newValueJson: { status: "APPROVED" },
      },
    });

    await this.notifyDecision(organisationId, ts.employeeId, "TIMESHEET_APPROVED", ts.id, "APPROVED");

    return this.toResponse(updated);
  }

  // ── Reject ─────────────────────────────────────────────────────────────────

  // POST /timesheets/:id/reject
  async reject(
    organisationId: string,
    user: RequestUser,
    dto: RejectTimesheetDto,
    id: string,
  ): Promise<TimesheetResponse> {
    if (!MANAGER_LEVEL_ROLES.has(user.role)) {
      throw new ForbiddenException("Only managers can reject timesheets");
    }

    const ts = await this.prisma.timesheet.findFirst({
      where: { id, organisationId },
      include: this.include,
    });
    if (!ts) {
      throw new NotFoundException("Timesheet not found");
    }

    if (ts.status !== "SUBMITTED" && ts.status !== "APPROVED") {
      throw new ConflictException(`Cannot reject a timesheet with status ${ts.status}`);
    }

    const updated = await this.prisma.timesheet.update({
      where: { id },
      data: {
        status: "REJECTED",
        approvedById: user.id,
        approvedAt: new Date(),
        rejectionReason: dto.reason,
      },
      include: this.include,
    });

    await this.prisma.auditLog.create({
      data: {
        organisationId,
        userId: user.id,
        action: "timesheet.reject",
        entityType: "Timesheet",
        entityId: ts.id,
        oldValueJson: { status: ts.status },
        newValueJson: { status: "REJECTED", rejectionReason: dto.reason },
      },
    });

    await this.notifyDecision(organisationId, ts.employeeId, "TIMESHEET_REJECTED", ts.id, "REJECTED");

    return this.toResponse(updated);
  }

  private async notifyDecision(
    organisationId: string,
    employeeId: string,
    type: "TIMESHEET_APPROVED" | "TIMESHEET_REJECTED",
    timesheetId: string,
    status: string,
  ): Promise<void> {
    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, organisationId, deletedAt: null },
      select: { userId: true },
    });
    if (!employee?.userId) return;
    await this.notifications.create(organisationId, employee.userId, type, { timesheetId, status });
  }

  // ── Correct (post-approval amendment) ──────────────────────────────────────

  // POST /timesheets/:id/correct — create a new version of an APPROVED timesheet.
  // The original stays frozen; the new version starts as DRAFT and goes through
  // the full submit/approve lifecycle again.
  async correct(
    organisationId: string,
    user: RequestUser,
    id: string,
  ): Promise<TimesheetResponse> {
    const ts = await this.loadForActor(organisationId, user, id);

    if (!MANAGER_LEVEL_ROLES.has(user.role)) {
      throw new ForbiddenException("Only managers can issue corrections");
    }

    if (ts.status !== "APPROVED") {
      throw new ConflictException(
        "Corrections can only be created from an APPROVED timesheet",
      );
    }

    const nextVersion = ts.version + 1;

    const newVersion = await this.prisma.timesheet.create({
      data: {
        organisationId,
        employeeId: ts.employeeId,
        periodStart: ts.periodStart,
        periodEnd: ts.periodEnd,
        totalMinutes: ts.totalMinutes,
        status: "DRAFT",
        version: nextVersion,
        parentTimesheetId: ts.id,
      },
      include: this.include,
    });

    await this.prisma.auditLog.create({
      data: {
        organisationId,
        userId: user.id,
        action: "timesheet.correct",
        entityType: "Timesheet",
        entityId: ts.id,
        newValueJson: { correctionVersion: nextVersion, correctionId: newVersion.id },
      },
    });

    return this.toResponse(newVersion);
  }
}


