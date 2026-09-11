import {
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { UserRole } from "@ewm/shared-types";
import { AuthGuard } from "../../common/guards/auth.guard";
import { TenantGuard } from "../../common/guards/tenant.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { RequestUser } from "../auth/strategies/jwt.strategy";
import { PrismaService } from "../../prisma/prisma.service";
import { CreateTaskCategoryDto } from "./dto/create-task-category.dto";
import { UpdateTaskCategoryDto } from "./dto/update-task-category.dto";

// Phase 5: reusable task categories, scoped per organisation. Names are
// unique per org (DB-level @@unique + explicit 409 here for a clean error).
@UseGuards(AuthGuard, TenantGuard)
@Controller("task-categories")
export class TaskCategoriesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(@CurrentUser() user: RequestUser) {
    const categories = await this.prisma.taskCategory.findMany({
      where: { organisationId: user.organisationId! },
      orderBy: { name: "asc" },
    });
    return categories.map((c) => ({
      id: c.id,
      organisationId: c.organisationId,
      name: c.name,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    }));
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ORG_ADMIN, UserRole.MANAGER)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateTaskCategoryDto,
  ) {
    const duplicate = await this.prisma.taskCategory.findFirst({
      where: { organisationId: user.organisationId!, name: dto.name },
    });
    if (duplicate) {
      throw new ConflictException(
        "A task category with this name already exists",
      );
    }
    const category = await this.prisma.taskCategory.create({
      data: { organisationId: user.organisationId!, name: dto.name },
    });
    return {
      id: category.id,
      organisationId: category.organisationId,
      name: category.name,
      createdAt: category.createdAt.toISOString(),
      updatedAt: category.updatedAt.toISOString(),
    };
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ORG_ADMIN, UserRole.MANAGER)
  @Patch(":id")
  async update(
    @CurrentUser() user: RequestUser,
    @Param("id") id: string,
    @Body() dto: UpdateTaskCategoryDto,
  ) {
    const existing = await this.prisma.taskCategory.findFirst({
      where: { id, organisationId: user.organisationId! },
    });
    if (!existing) {
      throw new NotFoundException("Task category not found");
    }
    if (dto.name !== existing.name) {
      const duplicate = await this.prisma.taskCategory.findFirst({
        where: {
          organisationId: user.organisationId!,
          name: dto.name,
          NOT: { id: existing.id },
        },
      });
      if (duplicate) {
        throw new ConflictException(
          "A task category with this name already exists",
        );
      }
    }
    const category = await this.prisma.taskCategory.update({
      where: { id: existing.id },
      data: { name: dto.name },
    });
    return {
      id: category.id,
      organisationId: category.organisationId,
      name: category.name,
      createdAt: category.createdAt.toISOString(),
      updatedAt: category.updatedAt.toISOString(),
    };
  }
}
