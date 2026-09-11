// Phase 8: Time Tracking. One timer row per start (RUNNING → PAUSED →
// COMPLETED); pause/resume accumulate pausedSeconds via pauseStartedAt.
// The Phase 8 critical business rule — starting a timer while another is
// already running for the same employee — is a 409 (see startTimer).
// Every edit writes an AuditLog row (old/new snapshots + optional reason),
// and reads are privacy-scoped: employees see only their own entries while
// ORG_ADMIN/MANAGER/TEAM_LEAD see the whole org.
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type {
  TimeEntryResponse,
  TimeEntrySource,
  TimeEntryStatus,
} from "@ewm/shared-types";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import type { RequestUser } from "../auth/strategies/jwt.strategy";
import type {
  CreateManualTimeEntryDto,
  StartTimerDto,
  StopTimerDto,
  UpdateTimeEntryDto,
} from "./dto/time-tracking.dto";

// Roles allowed to read/act on someone else's time entries.
const MANAGER_LEVEL_ROLES = new Set(["ORG_ADMIN", "MANAGER", "TEAM_LEAD"]);

type EntryWithRelations = Prisma.TimeEntryGetPayload<{
  include: {
    employee: { select: { name: true } };
    task: { select: { title: true } };
  };
}>;

@Injectable()
export class TimeTrackingService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly include = {
    employee: { select: { name: true } },
    task: { select: { title: true } },
  } as const;

  // ── Timer lifecycle ─────────────────────────────────────────────────────

  // POST /time-entries/start — begins a RUNNING timer. 409 if one is already
  // active for the target employee (the Phase 8 critical test).
  async startTimer(
    organisationId: string,
    user: RequestUser,
    dto: StartTimerDto,
  ): Promise<TimeEntryResponse> {
    const target = await this.resolveTargetEmployee(organisationId, user, dto.employeeId);
    const active = await this.findActiveEntry(target.id);
    if (active) {
      throw new ConflictException(
        "A timer is already active for this employee — pause or stop it first",
      );
    }
    const { taskId, projectId } = await this.resolveTaskContext(organisationId, dto.taskId);

    const entry = await this.prisma.timeEntry.create({
      data: {
        organisationId,
        employeeId: target.id,
        ...(taskId ? { taskId, projectId } : {}),
        status: "RUNNING",
        source: "TIMER",
        startTime: new Date(),
      },
      include: this.include,
    });
    return this.toResponse(entry);
  }

  // POST /time-entries/:id/pause — RUNNING → PAUSED; stamps pauseStartedAt so
  // resume can fold the paused interval into pausedSeconds.
  async pause(organisationId: string, user: RequestUser, id: string): Promise<TimeEntryResponse> {
    const entry = await this.loadForActor(organisationId, user, id);
    if (entry.status !== "RUNNING") {
      throw new BadRequestException(
        `Only a RUNNING timer can be paused (current status: ${entry.status})`,
      );
    }
    const updated = await this.prisma.timeEntry.update({
      where: { id: entry.id },
      data: { status: "PAUSED", pauseStartedAt: new Date() },
      include: this.include,
    });
    return this.toResponse(updated);
  }

  // POST /time-entries/:id/resume — PAUSED → RUNNING; accumulates the pause.
  async resume(organisationId: string, user: RequestUser, id: string): Promise<TimeEntryResponse> {
    const entry = await this.loadForActor(organisationId, user, id);
    if (entry.status !== "PAUSED") {
      throw new BadRequestException(
        `Only a PAUSED timer can be resumed (current status: ${entry.status})`,
      );
    }
    const pausedSeconds = entry.pausedSeconds + this.openPauseSeconds(entry);
    const updated = await this.prisma.timeEntry.update({
      where: { id: entry.id },
      data: {
        status: "RUNNING",
        pausedSeconds,
        pauseStartedAt: null,
      },
      include: this.include,
    });
    return this.toResponse(updated);
  }

  // POST /time-entries/:id/stop — RUNNING or PAUSED → COMPLETED. Stamps
  // endTime, folds any open pause into pausedSeconds, and derives
  // durationSeconds = end − start − pausedSeconds.
  async stop(
    organisationId: string,
    user: RequestUser,
    id: string,
    dto: StopTimerDto,
  ): Promise<TimeEntryResponse> {
    const entry = await this.loadForActor(organisationId, user, id);
    if (entry.status !== "RUNNING" && entry.status !== "PAUSED") {
      throw new BadRequestException(
        `Only an active timer can be stopped (current status: ${entry.status})`,
      );
    }
    const now = new Date();
    const openPause =
      entry.status === "PAUSED" ? this.openPauseSeconds(entry) : 0;
    const pausedSeconds = entry.pausedSeconds + openPause;
    const durationSeconds = Math.max(
      0,
      Math.floor((now.getTime() - entry.startTime.getTime()) / 1000) - pausedSeconds,
    );
    const updated = await this.prisma.timeEntry.update({
      where: { id: entry.id },
      data: {
        status: "COMPLETED",
        endTime: now,
        pausedSeconds,
        pauseStartedAt: null,
        durationSeconds,
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
      },
      include: this.include,
    });
    return this.toResponse(updated);
  }

  // GET /time-entries/active — the caller's (or a given manager-for-employee's)
  // open timer, or null when nothing is running. Nest serialises a true `null`
  // return from a service method as the literal `null` response body.
  async getActive(
    organisationId: string,
    user: RequestUser,
    employeeId?: string,
  ): Promise<TimeEntryResponse | null> {
    const target = await this.resolveTargetEmployee(organisationId, user, employeeId);
    const active = await this.findActiveEntry(target.id);
    if (!active) return null;
    return this.toResponse(active);
  }

  // ── Manual entries ──────────────────────────────────────────────────────

  // POST /time-entries/manual — a COMPLETED entry born with explicit start/
  // end; durationSeconds = end − start (manual entries carry no pause state).
  async createManual(
    organisationId: string,
    user: RequestUser,
    dto: CreateManualTimeEntryDto,
  ): Promise<TimeEntryResponse> {
    const target = await this.resolveTargetEmployee(organisationId, user, dto.employeeId);
    const { taskId, projectId } = await this.resolveTaskContext(organisationId, dto.taskId);

    const start = new Date(dto.startTime);
    const end = new Date(dto.endTime);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new BadRequestException("startTime/endTime must be valid ISO-8601 dates");
    }
    if (end <= start) {
      throw new BadRequestException("endTime must be after startTime");
    }
    const durationSeconds = Math.floor((end.getTime() - start.getTime()) / 1000);

    const entry = await this.prisma.timeEntry.create({
      data: {
        organisationId,
        employeeId: target.id,
        ...(taskId ? { taskId, projectId } : {}),
        status: "COMPLETED",
        source: "MANUAL",
        startTime: start,
        endTime: end,
        durationSeconds,
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
      },
      include: this.include,
    });
    return this.toResponse(entry);
  }

  // ── Reads (privacy-scoped) ──────────────────────────────────────────────

  // GET /time-entries — employees see only their own entries; manager-level
  // roles see the whole org and may filter by employeeId.
  async list(
    organisationId: string,
    user: RequestUser,
    filters: {
      employeeId?: string;
      taskId?: string;
      status?: string;
      from?: string;
      to?: string;
    } = {},
  ): Promise<TimeEntryResponse[]> {
    let employeeId: string | undefined;
    if (filters.employeeId) {
      const target = await this.resolveTargetEmployee(organisationId, user, filters.employeeId);
      employeeId = target.id;
    } else if (!MANAGER_LEVEL_ROLES.has(user.role)) {
      const self = await this.resolveSelfEmployee(organisationId, user);
      employeeId = self.id;
    }

    const entries = await this.prisma.timeEntry.findMany({
      where: {
        organisationId,
        ...(employeeId ? { employeeId } : {}),
        ...(filters.taskId ? { taskId: filters.taskId } : {}),
        ...(filters.status ? { status: filters.status as TimeEntryStatus } : {}),
        ...(filters.from || filters.to
          ? {
              startTime: {
                ...(filters.from ? { gte: new Date(filters.from) } : {}),
                ...(filters.to ? { lte: new Date(filters.to) } : {}),
              },
            }
          : {}),
      },
      orderBy: { startTime: "desc" },
      include: this.include,
    });
    return entries.map((e) => this.toResponse(e));
  }

  async getById(
    organisationId: string,
    user: RequestUser,
    id: string,
  ): Promise<TimeEntryResponse> {
    const entry = await this.loadForActor(organisationId, user, id);
    return this.toResponse(entry);
  }

  // PATCH /time-entries/:id — audited edit. Anyone may edit their own entry;
  // manager-level roles may edit others' but MUST supply a reason. Every edit
  // stamps editedById/editedAt and writes an AuditLog row with old/new
  // snapshots (the Phase 8 "audited edits" requirement).
  async update(
    organisationId: string,
    user: RequestUser,
    id: string,
    dto: UpdateTimeEntryDto,
  ): Promise<TimeEntryResponse> {
    const entry = await this.loadForActor(organisationId, user, id);
    const self = await this.findSelfEmployee(organisationId, user);
    const editingOthers = !self || entry.employeeId !== self.id;
    if (editingOthers && !MANAGER_LEVEL_ROLES.has(user.role)) {
      throw new ForbiddenException("You may only edit your own time entries");
    }
    if (editingOthers && !dto.reason) {
      throw new BadRequestException(
        "A reason is required when editing someone else's time entry",
      );
    }

    // Effective window: dto values or existing ones. endTime can never be
    // cleared (re-opening a completed entry would corrupt derived durations).
    const nextStart = dto.startTime !== undefined ? new Date(dto.startTime) : entry.startTime;
    if (Number.isNaN(nextStart.getTime())) {
      throw new BadRequestException("startTime must be a valid ISO-8601 date");
    }
    let nextEnd = entry.endTime;
    if (dto.endTime !== undefined) {
      if (dto.endTime === null) {
        throw new BadRequestException("endTime cannot be cleared on a time entry");
      }
      nextEnd = new Date(dto.endTime);
      if (Number.isNaN(nextEnd.getTime())) {
        throw new BadRequestException("endTime must be a valid ISO-8601 date");
      }
    }
    if (nextEnd && nextEnd <= nextStart) {
      throw new BadRequestException("endTime must be after startTime");
    }

    let nextTaskId = entry.taskId;
    let nextProjectId = entry.projectId;
    if (dto.taskId !== undefined) {
      if (dto.taskId === null) {
        nextTaskId = null;
        nextProjectId = null;
      } else {
        const resolved = await this.resolveTaskContext(organisationId, dto.taskId);
        nextTaskId = resolved.taskId;
        nextProjectId = resolved.projectId;
      }
    }

    const nextDurationSeconds =
      nextEnd && entry.status === "COMPLETED"
        ? Math.max(
            0,
            Math.floor((nextEnd.getTime() - nextStart.getTime()) / 1000) - entry.pausedSeconds,
          )
        : entry.durationSeconds;

    const oldValue = {
      taskId: entry.taskId,
      startTime: entry.startTime.toISOString(),
      endTime: entry.endTime ? entry.endTime.toISOString() : null,
      notes: entry.notes,
      durationSeconds: entry.durationSeconds,
    };
    const newValue = {
      taskId: nextTaskId,
      startTime: nextStart.toISOString(),
      endTime: nextEnd ? nextEnd.toISOString() : null,
      notes: dto.notes !== undefined ? dto.notes : entry.notes,
      durationSeconds: nextDurationSeconds,
      ...(dto.reason ? { reason: dto.reason } : {}),
    };

    const updated = await this.prisma.$transaction(async (tx) => {
      const saved = await tx.timeEntry.update({
        where: { id: entry.id },
        data: {
          ...(nextTaskId !== null
            ? { taskId: nextTaskId, projectId: nextProjectId }
            : { taskId: null, projectId: null }),
          startTime: nextStart,
          ...(nextEnd ? { endTime: nextEnd } : {}),
          ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
          durationSeconds: nextDurationSeconds,
          editedById: user.id,
          editedAt: new Date(),
        },
        include: this.include,
      });
      await tx.auditLog.create({
        data: {
          organisationId,
          userId: user.id,
          action: "time_entry.update",
          entityType: "TimeEntry",
          entityId: entry.id,
          timeEntryId: entry.id,
          oldValueJson: oldValue as unknown as Prisma.InputJsonValue,
          newValueJson: newValue as unknown as Prisma.InputJsonValue,
        },
      });
      return saved;
    });
    return this.toResponse(updated);
  }

  // ── Private helpers ─────────────────────────────────────────────────────

  // Seconds elapsed since pauseStartedAt (0 when the timer isn't paused).
  private openPauseSeconds(entry: EntryWithRelations): number {
    if (entry.status !== "PAUSED" || !entry.pauseStartedAt) return 0;
    return Math.max(
      0,
      Math.floor((Date.now() - entry.pauseStartedAt.getTime()) / 1000),
    );
  }

  // The employee's single active (RUNNING/PAUSED) timer, if any.
  private findActiveEntry(employeeId: string) {
    return this.prisma.timeEntry.findFirst({
      where: { employeeId, status: { in: ["RUNNING", "PAUSED"] } },
      include: this.include,
    });
  }

  // Nullable self-lookup (used by update() so a manager without an HR
  // profile can still edit others with a reason instead of getting a 404).
  private findSelfEmployee(organisationId: string, user: RequestUser) {
    return this.prisma.employee.findFirst({
      where: { userId: user.id, organisationId, deletedAt: null },
    });
  }

  // Throws when the caller has no Employee profile in the org (e.g. an
  // ORG_ADMIN without one cannot own a timer).
  private async resolveSelfEmployee(organisationId: string, user: RequestUser) {
    const employee = await this.findSelfEmployee(organisationId, user);
    if (!employee) {
      throw new NotFoundException(
        "Your user account has no Employee profile in this organisation",
      );
    }
    return employee;
  }

  // Resolve whose entry we're acting on: dto.employeeId (manager-level only,
  // else 403) or the caller's own profile.
  private async resolveTargetEmployee(
    organisationId: string,
    user: RequestUser,
    employeeId?: string,
  ) {
    if (!employeeId) {
      return this.resolveSelfEmployee(organisationId, user);
    }
    if (!MANAGER_LEVEL_ROLES.has(user.role)) {
      throw new ForbiddenException(
        "Only managers can act on someone else's time entries",
      );
    }
    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, organisationId, deletedAt: null },
    });
    if (!employee) {
      throw new NotFoundException("Employee not found in this organisation");
    }
    return employee;
  }

  // taskId → { taskId, projectId } within the org; null/undefined → both null.
  private async resolveTaskContext(
    organisationId: string,
    taskId?: string | null,
  ): Promise<{ taskId: string | null; projectId: string | null }> {
    if (!taskId) return { taskId: null, projectId: null };
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, organisationId, deletedAt: null },
    });
    if (!task) {
      throw new NotFoundException("Task not found in this organisation");
    }
    return { taskId: task.id, projectId: task.projectId };
  }

  // Load an entry and enforce who may touch it: the owner always;
  // manager-level roles anywhere in the org. Tenant scoping is folded into
  // the where clause, so cross-org ids surface as plain 404s.
  private async loadForActor(
    organisationId: string,
    user: RequestUser,
    id: string,
  ): Promise<EntryWithRelations> {
    const entry = await this.prisma.timeEntry.findFirst({
      where: { id, organisationId },
      include: this.include,
    });
    if (!entry) {
      throw new NotFoundException("Time entry not found");
    }
    if (!MANAGER_LEVEL_ROLES.has(user.role)) {
      const self = await this.resolveSelfEmployee(organisationId, user);
      if (entry.employeeId !== self.id) {
        throw new ForbiddenException(
          "You may only access your own time entries",
        );
      }
    }
    return entry;
  }

  private toResponse(entry: EntryWithRelations): TimeEntryResponse {
    return {
      id: entry.id,
      organisationId: entry.organisationId,
      employeeId: entry.employeeId,
      employeeName: entry.employee?.name ?? "—",
      taskId: entry.taskId,
      taskTitle: entry.task?.title ?? null,
      status: entry.status as TimeEntryStatus,
      source: entry.source as TimeEntrySource,
      startTime: entry.startTime.toISOString(),
      endTime: entry.endTime ? entry.endTime.toISOString() : null,
      pausedSeconds: entry.pausedSeconds,
      durationSeconds: entry.durationSeconds,
      durationMinutes:
        entry.durationSeconds !== null
          ? Math.round(entry.durationSeconds / 60)
          : null,
      notes: entry.notes,
      editedAt: entry.editedAt ? entry.editedAt.toISOString() : null,
      createdAt: entry.createdAt.toISOString(),
      updatedAt: entry.updatedAt.toISOString(),
    };
  }
}
