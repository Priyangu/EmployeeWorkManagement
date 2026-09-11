import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { TaskScheduleResponse } from "@ewm/shared-types";
import { PrismaService } from "../../prisma/prisma.service";
import type { CreateScheduleDto } from "./dto/create-schedule.dto";
import type { UpdateScheduleDto } from "./dto/update-schedule.dto";

type ScheduleRow = {
  id: string;
  organisationId: string;
  taskId: string;
  task?: { title: string } | null;
  employeeId: string;
  employee?: { name: string } | null;
  scheduledStart: Date;
  scheduledEnd: Date;
  createdAt: Date;
  updatedAt: Date;
};

// Every query is keyed by the JWT-derived organisationId (TenantGuard), so
// cross-tenant schedules are structurally impossible. Overlap detection is a
// soft warning per architecture decision 4: we never reject, we flag
// `overlaps` + `conflictIds` on the response so the calendar UI can warn
// while letting managers override real-world overlaps (on-call, travel).
@Injectable()
export class SchedulingService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly include = {
    task: { select: { title: true } },
    employee: { select: { name: true } },
  } as const;

  // GET /schedule?from=&to=&employeeId=
  // Returns schedules inside the window, each annotated with its conflicts.
  async list(
    organisationId: string,
    query: { from?: string; to?: string; employeeId?: string },
  ): Promise<TaskScheduleResponse[]> {
    const { start, end } = this.resolveWindow(query.from, query.to);

    // Pull the org's blocks (optionally for one employee) WITHOUT trimming to
    // the window first, so conflict flags are computed against every block
    // the employee actually has — not just the visible week.
    const candidates = await this.prisma.taskSchedule.findMany({
      where: {
        organisationId,
        ...(query.employeeId ? { employeeId: query.employeeId } : {}),
      },
      orderBy: { scheduledStart: "asc" },
      include: this.include,
    });

    const window = candidates.filter((s) =>
      s.scheduledStart < end && s.scheduledEnd > start,
    );

    const conflicts = this.buildConflictMap(candidates);
    const visible = new Set(window.map((s) => s.id));
    return candidates
      .filter((s) => visible.has(s.id))
      .map((s) => this.toResponse(s, conflicts));
  }

  async create(
    organisationId: string,
    dto: CreateScheduleDto,
  ): Promise<TaskScheduleResponse> {
    const { start, end } = this.assertValidWindow(
      dto.scheduledStart,
      dto.scheduledEnd,
    );
    await this.findTaskInOrgOrThrow(organisationId, dto.taskId);
    await this.findEmployeeInOrgOrThrow(organisationId, dto.employeeId);

    const schedule = await this.prisma.taskSchedule.create({
      data: {
        organisationId,
        taskId: dto.taskId,
        employeeId: dto.employeeId,
        scheduledStart: start,
        scheduledEnd: end,
      },
      include: this.include,
    });

    // Warn (not block) on overlaps with the employee's existing blocks.
    const conflicts = await this.findConflicts(schedule);
    return this.toResponse(schedule, conflicts);
  }

  // PATCH /schedule/:id — resize/move/reassign a block. Used by drag-reschedule.
  async update(
    organisationId: string,
    id: string,
    dto: UpdateScheduleDto,
  ): Promise<TaskScheduleResponse> {
    const existing = await this.findInOrgOrThrow(organisationId, id);

    if (dto.taskId !== undefined) {
      await this.findTaskInOrgOrThrow(organisationId, dto.taskId);
    }
    if (dto.employeeId !== undefined) {
      await this.findEmployeeInOrgOrThrow(organisationId, dto.employeeId);
    }

    const nextStart = dto.scheduledStart !== undefined
      ? new Date(dto.scheduledStart)
      : existing.scheduledStart;
    const nextEnd = dto.scheduledEnd !== undefined
      ? new Date(dto.scheduledEnd)
      : existing.scheduledEnd;
    this.assertOrderedOrThrow(nextStart, nextEnd);

    const schedule = await this.prisma.taskSchedule.update({
      where: { id: existing.id },
      data: {
        ...(dto.taskId !== undefined ? { taskId: dto.taskId } : {}),
        ...(dto.employeeId !== undefined ? { employeeId: dto.employeeId } : {}),
        ...(dto.scheduledStart !== undefined
          ? { scheduledStart: nextStart }
          : {}),
        ...(dto.scheduledEnd !== undefined ? { scheduledEnd: nextEnd } : {}),
      },
      include: this.include,
    });

    const conflicts = await this.findConflicts(schedule);
    return this.toResponse(schedule, conflicts);
  }
// ── Helpers ────────────────────────────────────────────────────────────

  // DELETE /schedule/:id — remove a block (e.g. unschedule via the UI).
  async remove(organisationId: string, id: string): Promise<void> {
    const existing = await this.findInOrgOrThrow(organisationId, id);
    await this.prisma.taskSchedule.delete({ where: { id: existing.id } });
  }

  private resolveWindow(from?: string, to?: string): { start: Date; end: Date } {
    if (from && to) {
      const start = new Date(from);
      const end = new Date(to);
      this.assertOrderedOrThrow(start, end);
      return { start, end };
    }
    if (from && !to) {
      const start = new Date(from);
      return { start, end: new Date(start.getTime() + 7 * 24 * 3600 * 1000) };
    }
    // Default: the current ISO week (Monday 00:00 UTC → next Monday).
    const now = new Date();
    const dayOffset = (now.getUTCDay() + 6) % 7; // 0 = Monday
    const monday = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - dayOffset),
    );
    return {
      start: monday,
      end: new Date(monday.getTime() + 7 * 24 * 3600 * 1000),
    };
  }

  private assertValidWindow(startStr: string, endStr: string): {
    start: Date;
    end: Date;
  } {
    const start = new Date(startStr);
    const end = new Date(endStr);
    this.assertOrderedOrThrow(start, end);
    return { start, end };
  }

  private assertOrderedOrThrow(start: Date, end: Date): void {
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new BadRequestException(
        "scheduledStart/scheduledEnd must be valid ISO-8601 dates",
      );
    }
    if (start >= end) {
      throw new BadRequestException("scheduledEnd must be after scheduledStart");
    }
  }

  // Overlap window for the same employee: A overlaps B when
  // A.start < B.end AND A.end > B.start (adjacent blocks do not conflict).
  private overlapsWith(a: ScheduleRow, b: ScheduleRow): boolean {
    return a.scheduledStart < b.scheduledEnd && a.scheduledEnd > b.scheduledStart;
  }

  // Map of scheduleId -> [ids of schedules it overlaps with, same employee].
  private buildConflictMap(rows: ScheduleRow[]): Map<string, string[]> {
    const map = new Map<string, string[]>();
    for (const a of rows) {
      const conflicts: string[] = [];
      for (const b of rows) {
        if (a.id === b.id) continue;
        if (a.employeeId !== b.employeeId) continue;
        if (this.overlapsWith(a, b)) conflicts.push(b.id);
      }
      map.set(a.id, conflicts);
    }
    return map;
  }

  private async findConflicts(
    schedule: ScheduleRow,
  ): Promise<Map<string, string[]>> {
    const others = await this.prisma.taskSchedule.findMany({
      where: {
        organisationId: schedule.organisationId,
        employeeId: schedule.employeeId,
      },
      include: this.include,
    });
    const withSelf: ScheduleRow[] = others.filter((o) => o.id !== schedule.id);
    const conflicts: string[] = [];
    for (const o of withSelf) {
      if (this.overlapsWith(schedule, o)) conflicts.push(o.id);
    }
    const map = new Map<string, string[]>();
    map.set(schedule.id, conflicts);
    return map;
  }

  private toResponse(
    s: ScheduleRow,
    conflicts: Map<string, string[]>,
  ): TaskScheduleResponse {
    const conflictIds = conflicts.get(s.id) ?? [];
    return {
      id: s.id,
      organisationId: s.organisationId,
      taskId: s.taskId,
      taskTitle: s.task?.title ?? "Unknown task",
      employeeId: s.employeeId,
      employeeName: s.employee?.name ?? "Unknown employee",
      scheduledStart: s.scheduledStart.toISOString(),
      scheduledEnd: s.scheduledEnd.toISOString(),
      overlaps: conflictIds.length > 0,
      conflictIds,
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
    };
  }

  private async findInOrgOrThrow(organisationId: string, id: string) {
    const schedule = await this.prisma.taskSchedule.findFirst({
      where: { id, organisationId },
      include: this.include,
    });
    if (!schedule) {
      throw new NotFoundException("Schedule not found");
    }
    return schedule;
  }

  private async findTaskInOrgOrThrow(organisationId: string, taskId: string) {
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, organisationId, deletedAt: null },
    });
    if (!task) {
      throw new NotFoundException("Task not found in this organisation");
    }
    return task;
  }

  private async findEmployeeInOrgOrThrow(
    organisationId: string,
    employeeId: string,
  ) {
    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, organisationId, deletedAt: null },
    });
    if (!employee) {
      throw new NotFoundException("Employee not found in this organisation");
    }
    return employee;
  }
}