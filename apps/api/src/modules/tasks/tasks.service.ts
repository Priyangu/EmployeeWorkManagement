import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type {
  TaskAttachmentResponse,
  TaskCommentResponse,
  TaskResponse,
  TaskPriority,
  TaskStatus,
} from "@ewm/shared-types";
import { UserRole } from "@ewm/shared-types";
import { PrismaService } from "../../prisma/prisma.service";
import type { RequestUser } from "../auth/strategies/jwt.strategy";
import type { CreateTaskDto } from "./dto/create-task.dto";
import type { UpdateTaskDto } from "./dto/update-task.dto";
import type { AssignTaskDto } from "./dto/assign-task.dto";
import type { CreateTaskCommentDto } from "./dto/create-task-comment.dto";
import type { CreateTaskAttachmentDto } from "./dto/create-task-attachment.dto";

// Allowed status transitions. Terminal states (COMPLETED/CANCELLED) have no
// outgoing edges — the critical Phase 6 test pins that they never leave.
// start→IN_PROGRESS is reachable from NOT_STARTED/SCHEDULED/PAUSED/BLOCKED;
// pause only from IN_PROGRESS; resume is PAUSED→IN_PROGRESS.
const TASK_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  NOT_STARTED: ["SCHEDULED", "IN_PROGRESS", "CANCELLED"],
  SCHEDULED: ["IN_PROGRESS", "PAUSED", "CANCELLED", "BLOCKED"],
  IN_PROGRESS: ["PAUSED", "COMPLETED", "BLOCKED", "CANCELLED"],
  PAUSED: ["IN_PROGRESS", "CANCELLED", "BLOCKED"],
  BLOCKED: ["IN_PROGRESS", "PAUSED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

// Every lookup is keyed by the JWT-derived organisationId (via TenantGuard),
// so cross-tenant access is structurally impossible. `createdById` and
// `TaskAssignment.assignedById` reference the Employee record (HR profile),
// which we resolve from the caller's user id; comments/attachments reference
// the User account directly. Status moves only through `transition()`.
@Injectable()
export class TasksService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly include = {
    project: { select: { name: true } },
    category: { select: { name: true } },
    assignee: { select: { name: true } },
  } as const;

  async list(
    organisationId: string,
    filters: {
      projectId?: string;
      assigneeId?: string;
      status?: string;
      dueFrom?: string;
      dueTo?: string;
    } = {},
  ): Promise<TaskResponse[]> {
    const tasks = await this.prisma.task.findMany({
      where: {
        organisationId,
        deletedAt: null,
        ...(filters.projectId ? { projectId: filters.projectId } : {}),
        ...(filters.assigneeId ? { assigneeId: filters.assigneeId } : {}),
        ...(filters.status ? { status: filters.status as TaskStatus } : {}),
        ...(filters.dueFrom || filters.dueTo
          ? {
              dueDate: {
                ...(filters.dueFrom ? { gte: new Date(filters.dueFrom) } : {}),
                ...(filters.dueTo ? { lte: new Date(filters.dueTo) } : {}),
              },
            }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      include: this.include,
    });
    return tasks.map((t) => this.toResponse(t));
  }

  async getById(organisationId: string, id: string): Promise<TaskResponse> {
    const task = await this.findInOrgOrThrow(organisationId, id);
    return this.toResponse(task);
  }

  async create(
    organisationId: string,
    user: RequestUser,
    dto: CreateTaskDto,
  ): Promise<TaskResponse> {
    // createdById references the Employee record — resolve the caller's HR
    // profile. ORG_ADMIN/MANAGER without a profile cannot create tasks.
    const creator = await this.requireEmployeeProfile(organisationId, user.id);
    await this.findProjectInOrgOrThrow(organisationId, dto.projectId);
    if (dto.categoryId) {
      await this.findCategoryInOrgOrThrow(organisationId, dto.categoryId);
    }

    // An initial assignee goes through the same auditable assignment path as
    // POST /assign: TaskAssignment row (current=true) + NOT_STARTED→SCHEDULED.
    const task = await this.prisma.$transaction(async (tx) => {
      const created = await tx.task.create({
        data: {
          organisationId,
          projectId: dto.projectId,
          ...(dto.categoryId ? { categoryId: dto.categoryId } : {}),
          title: dto.title,
          ...(dto.description !== undefined ? { description: dto.description } : {}),
          ...(dto.priority ? { priority: dto.priority } : {}),
          ...(dto.estimatedMinutes !== undefined
            ? { estimatedMinutes: dto.estimatedMinutes }
            : {}),
          ...(dto.dueDate ? { dueDate: new Date(dto.dueDate) } : {}),
          createdById: creator.id,
        },
      });
      if (dto.assigneeId) {
        const assignee = await tx.employee.findFirst({
          where: { id: dto.assigneeId, organisationId, deletedAt: null },
        });
        if (!assignee) {
          throw new NotFoundException("Assignee not found in this organisation");
        }
        await tx.taskAssignment.create({
          data: {
            taskId: created.id,
            employeeId: assignee.id,
            assignedById: creator.id,
          },
        });
        return tx.task.update({
          where: { id: created.id },
          data: { assigneeId: assignee.id, status: "SCHEDULED" },
          include: this.include,
        });
      }
      return tx.task.findUniqueOrThrow({
        where: { id: created.id },
        include: this.include,
      });
    });
    return this.toResponse(task);
  }

  async update(
    organisationId: string,
    id: string,
    dto: UpdateTaskDto,
  ): Promise<TaskResponse> {
    const existing = await this.findInOrgOrThrow(organisationId, id);
    if (dto.categoryId !== undefined && dto.categoryId !== null) {
      await this.findCategoryInOrgOrThrow(organisationId, dto.categoryId);
    }
    const task = await this.prisma.task.update({
      where: { id: existing.id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.priority !== undefined ? { priority: dto.priority } : {}),
        ...(dto.categoryId !== undefined ? { categoryId: dto.categoryId } : {}),
        ...(dto.estimatedMinutes !== undefined
          ? { estimatedMinutes: dto.estimatedMinutes }
          : {}),
        ...(dto.dueDate !== undefined
          ? { dueDate: dto.dueDate ? new Date(dto.dueDate) : null }
          : {}),
      },
      include: this.include,
    });
    return this.toResponse(task);
  }

  // Records the auditable TaskAssignment history row and moves
  // NOT_STARTED → SCHEDULED on first assignment. Terminal tasks reject.
  async assign(
    organisationId: string,
    user: RequestUser,
    id: string,
    dto: AssignTaskDto,
  ): Promise<TaskResponse> {
    const assigner = await this.requireEmployeeProfile(organisationId, user.id);
    const existing = await this.findInOrgOrThrow(organisationId, id);
    const current = existing.status as TaskStatus;
    if (current === "COMPLETED" || current === "CANCELLED") {
      throw new BadRequestException(
        `Cannot assign a task that is already ${current}`,
      );
    }
    const assignee = await this.prisma.employee.findFirst({
      where: { id: dto.employeeId, organisationId, deletedAt: null },
    });
    if (!assignee) {
      throw new NotFoundException("Assignee not found in this organisation");
    }

    const task = await this.prisma.$transaction(async (tx) => {
      // Reassignment keeps history: flip old current rows, add the new one.
      await tx.taskAssignment.updateMany({
        where: { taskId: existing.id, current: true },
        data: { current: false },
      });
      await tx.taskAssignment.create({
        data: {
          taskId: existing.id,
          employeeId: assignee.id,
          assignedById: assigner.id,
        },
      });
      return tx.task.update({
        where: { id: existing.id },
        data: {
          assigneeId: assignee.id,
          ...(current === "NOT_STARTED" ? { status: "SCHEDULED" } : {}),
        },
        include: this.include,
      });
    });
    return this.toResponse(task);
  }

  // Single gateway for start/pause/resume/complete. Validates the move
  // against TASK_TRANSITIONS (terminal states have no outgoing edges —
  // the critical Phase 6 test pins that COMPLETED/CANCELLED never leave),
  // then enforces the assignee-or-writer rule before persisting.
  async transition(
    organisationId: string,
    user: RequestUser,
    id: string,
    target: TaskStatus,
  ): Promise<TaskResponse> {
    const existing = await this.findInOrgOrThrow(organisationId, id);
    const current = existing.status as TaskStatus;
    const allowed = TASK_TRANSITIONS[current] ?? [];
    if (!allowed.includes(target)) {
      throw new BadRequestException(
        `Cannot move a task from ${current} to ${target}`,
      );
    }
    await this.assertCanWorkOn(organisationId, user, existing);

    const task = await this.prisma.task.update({
      where: { id: existing.id },
      data: { status: target },
      include: this.include,
    });
    return this.toResponse(task);
  }

  async listComments(
    organisationId: string,
    id: string,
  ): Promise<TaskCommentResponse[]> {
    const task = await this.findInOrgOrThrow(organisationId, id);
    const comments = await this.prisma.taskComment.findMany({
      where: { taskId: task.id },
      orderBy: { createdAt: "asc" },
      include: { user: { select: { email: true } } },
    });
    return comments.map((c) => ({
      id: c.id,
      taskId: c.taskId,
      userId: c.userId,
      userEmail: c.user.email,
      body: c.body,
      createdAt: c.createdAt.toISOString(),
    }));
  }

  async addComment(
    organisationId: string,
    user: RequestUser,
    id: string,
    dto: CreateTaskCommentDto,
  ): Promise<TaskCommentResponse> {
    const task = await this.findInOrgOrThrow(organisationId, id);
    const comment = await this.prisma.taskComment.create({
      data: { taskId: task.id, userId: user.id, body: dto.body },
      include: { user: { select: { email: true } } },
    });
    return {
      id: comment.id,
      taskId: comment.taskId,
      userId: comment.userId,
      userEmail: comment.user.email,
      body: comment.body,
      createdAt: comment.createdAt.toISOString(),
    };
  }

  // Workflow actions are for the assignee, or ORG_ADMIN/MANAGER.
  private async assertCanWorkOn(
    organisationId: string,
    user: RequestUser,
    task: { assigneeId: string | null },
  ): Promise<void> {
    if (task.assigneeId) {
      const assignee = await this.prisma.employee.findFirst({
        where: { id: task.assigneeId, organisationId, deletedAt: null },
        select: { userId: true },
      });
      if (assignee?.userId === user.id) return;
    }
    if (user.role === UserRole.ORG_ADMIN || user.role === UserRole.MANAGER) {
      return;
    }
    throw new ForbiddenException(
      "Only the assignee or a manager can perform this action",
    );
  }

  async listAttachments(
    organisationId: string,
    id: string,
  ): Promise<TaskAttachmentResponse[]> {
    const task = await this.findInOrgOrThrow(organisationId, id);
    const attachments = await this.prisma.taskAttachment.findMany({
      where: { taskId: task.id },
      orderBy: { createdAt: "asc" },
    });
    return attachments.map((a) => ({
      id: a.id,
      taskId: a.taskId,
      storageKey: a.storageKey,
      fileName: a.fileName,
      mimeType: a.mimeType,
      uploadedById: a.uploadedById,
      createdAt: a.createdAt.toISOString(),
    }));
  }

  async addAttachment(
    organisationId: string,
    user: RequestUser,
    id: string,
    dto: CreateTaskAttachmentDto,
  ): Promise<TaskAttachmentResponse> {
    const task = await this.findInOrgOrThrow(organisationId, id);
    const attachment = await this.prisma.taskAttachment.create({
      data: {
        taskId: task.id,
        storageKey: dto.storageKey,
        fileName: dto.fileName,
        ...(dto.mimeType !== undefined ? { mimeType: dto.mimeType } : {}),
        uploadedById: user.id,
      },
    });
    return {
      id: attachment.id,
      taskId: attachment.taskId,
      storageKey: attachment.storageKey,
      fileName: attachment.fileName,
      mimeType: attachment.mimeType,
      uploadedById: attachment.uploadedById,
      createdAt: attachment.createdAt.toISOString(),
    };
  }

  private async findInOrgOrThrow(organisationId: string, id: string) {
    const task = await this.prisma.task.findFirst({
      where: { id, organisationId, deletedAt: null },
      include: this.include,
    });
    if (!task) {
      throw new NotFoundException("Task not found");
    }
    return task;
  }

  // createdById/assignedById reference the Employee HR profile, so any user
  // creating/assigning tasks needs one. Without this check an admin without
  // a profile would fail on the FK with a confusing 500.
  private async requireEmployeeProfile(
    organisationId: string,
    userId: string,
  ) {
    const employee = await this.prisma.employee.findFirst({
      where: { userId, organisationId, deletedAt: null },
    });
    if (!employee) {
      throw new BadRequestException(
        "Your account has no employee profile; ask your admin to create one",
      );
    }
    return employee;
  }

  private async findProjectInOrgOrThrow(organisationId: string, id: string) {
    const project = await this.prisma.project.findFirst({
      where: { id, organisationId, deletedAt: null },
    });
    if (!project) {
      throw new NotFoundException("Project not found in this organisation");
    }
    return project;
  }

  // TaskCategory has no soft-delete (lightweight per-org reference list).
  private async findCategoryInOrgOrThrow(organisationId: string, id: string) {
    const category = await this.prisma.taskCategory.findFirst({
      where: { id, organisationId },
    });
    if (!category) {
      throw new NotFoundException("Task category not found in this organisation");
    }
    return category;
  }

  private toResponse(task: {
    id: string;
    organisationId: string;
    projectId: string;
    project: { name: string };
    categoryId: string | null;
    category: { name: string } | null;
    title: string;
    description: string | null;
    priority: string;
    status: string;
    estimatedMinutes: number | null;
    dueDate: Date | null;
    assigneeId: string | null;
    assignee: { name: string } | null;
    createdById: string;
    createdAt: Date;
    updatedAt: Date;
  }): TaskResponse {
    return {
      id: task.id,
      organisationId: task.organisationId,
      projectId: task.projectId,
      projectName: task.project.name,
      categoryId: task.categoryId,
      categoryName: task.category?.name ?? null,
      title: task.title,
      description: task.description,
      priority: task.priority as TaskPriority,
      status: task.status as TaskStatus,
      estimatedMinutes: task.estimatedMinutes,
      dueDate: task.dueDate ? task.dueDate.toISOString() : null,
      assigneeId: task.assigneeId,
      assigneeName: task.assignee?.name ?? null,
      createdById: task.createdById,
      createdAt: task.createdAt.toISOString(),
      updatedAt: task.updatedAt.toISOString(),
    };
  }
}
