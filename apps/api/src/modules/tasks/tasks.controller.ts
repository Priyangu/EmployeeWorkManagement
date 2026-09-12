import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { UserRole, TaskStatus } from "@ewm/shared-types";
import { AuthGuard } from "../../common/guards/auth.guard";
import { TenantGuard } from "../../common/guards/tenant.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { RequestUser } from "../auth/strategies/jwt.strategy";
import { TasksService } from "./tasks.service";
import { CreateTaskDto } from "./dto/create-task.dto";
import { UpdateTaskDto } from "./dto/update-task.dto";
import { AssignTaskDto } from "./dto/assign-task.dto";
import { CreateTaskCommentDto } from "./dto/create-task-comment.dto";
import { CreateTaskAttachmentDto } from "./dto/create-task-attachment.dto";

// Guard chain per architecture: Auth → Tenant → (Roles on mutating routes).
// Reads: any org member. Task creation/edits/assignment: ORG_ADMIN or
// MANAGER (RolesGuard). Workflow actions + comments/attachments: assignee
// or writer, enforced in the service (assertCanWorkOn).
@UseGuards(AuthGuard, TenantGuard)
@Controller("tasks")
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Get()
  list(
    @CurrentUser() user: RequestUser,
    @Query("projectId") projectId?: string,
    @Query("assigneeId") assigneeId?: string,
    @Query("status") status?: string,
    @Query("dueFrom") dueFrom?: string,
    @Query("dueTo") dueTo?: string,
  ) {
    return this.tasksService.list(user.organisationId!, user, {
      ...(projectId ? { projectId } : {}),
      ...(assigneeId ? { assigneeId } : {}),
      ...(status ? { status } : {}),
      ...(dueFrom || dueTo ? { dueFrom, dueTo } : {}),
    });
  }

  @Get(":id")
  getById(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    return this.tasksService.getById(user.organisationId!, user, id);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ORG_ADMIN, UserRole.MANAGER, UserRole.TEAM_LEAD)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateTaskDto) {
    return this.tasksService.create(user.organisationId!, user, dto);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ORG_ADMIN, UserRole.MANAGER, UserRole.TEAM_LEAD)
  @Patch(":id")
  update(
    @CurrentUser() user: RequestUser,
    @Param("id") id: string,
    @Body() dto: UpdateTaskDto,
  ) {
    return this.tasksService.update(user.organisationId!, id, dto);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ORG_ADMIN, UserRole.MANAGER, UserRole.TEAM_LEAD)
  @Post(":id/assign")
  @HttpCode(HttpStatus.OK)
  assign(
    @CurrentUser() user: RequestUser,
    @Param("id") id: string,
    @Body() dto: AssignTaskDto,
  ) {
    return this.tasksService.assign(user.organisationId!, user, id, dto);
  }

  // ── Workflow actions (assignee or writer; transitions validated in svc) ─
  @Post(":id/start")
  @HttpCode(HttpStatus.OK)
  start(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    return this.tasksService.transition(
      user.organisationId!,
      user,
      id,
      TaskStatus.IN_PROGRESS,
    );
  }

  @Post(":id/pause")
  @HttpCode(HttpStatus.OK)
  pause(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    return this.tasksService.transition(
      user.organisationId!,
      user,
      id,
      TaskStatus.PAUSED,
    );
  }

  @Post(":id/resume")
  @HttpCode(HttpStatus.OK)
  resume(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    return this.tasksService.transition(
      user.organisationId!,
      user,
      id,
      TaskStatus.IN_PROGRESS,
    );
  }

  @Post(":id/complete")
  @HttpCode(HttpStatus.OK)
  complete(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    return this.tasksService.transition(
      user.organisationId!,
      user,
      id,
      TaskStatus.COMPLETED,
    );
  }

  // ── Comments & attachments ────────────────────────────────────────────
  @Get(":id/comments")
  listComments(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    return this.tasksService.listComments(user.organisationId!, id);
  }

  @Post(":id/comments")
  @HttpCode(HttpStatus.CREATED)
  addComment(
    @CurrentUser() user: RequestUser,
    @Param("id") id: string,
    @Body() dto: CreateTaskCommentDto,
  ) {
    return this.tasksService.addComment(user.organisationId!, user, id, dto);
  }

  @Get(":id/attachments")
  listAttachments(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    return this.tasksService.listAttachments(user.organisationId!, id);
  }

  @Post(":id/attachments")
  @HttpCode(HttpStatus.CREATED)
  addAttachment(
    @CurrentUser() user: RequestUser,
    @Param("id") id: string,
    @Body() dto: CreateTaskAttachmentDto,
  ) {
    return this.tasksService.addAttachment(
      user.organisationId!,
      user,
      id,
      dto,
    );
  }
}
