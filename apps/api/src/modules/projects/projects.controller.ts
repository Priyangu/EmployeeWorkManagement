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
import { UserRole } from "@ewm/shared-types";
import { AuthGuard } from "../../common/guards/auth.guard";
import { TenantGuard } from "../../common/guards/tenant.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { RequestUser } from "../auth/strategies/jwt.strategy";
import { ProjectsService } from "./projects.service";
import { CreateProjectDto } from "./dto/create-project.dto";
import { UpdateProjectDto } from "./dto/update-project.dto";

// Tenant-scoped reads (any org member) with status/customer filters;
// writes restricted to ORG_ADMIN / MANAGER per the RBAC matrix.
@UseGuards(AuthGuard, TenantGuard)
@Controller("projects")
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Get()
  list(
    @CurrentUser() user: RequestUser,
    @Query("status") status?: string,
    @Query("customer") customer?: string,
  ) {
    return this.projectsService.list(user.organisationId!, { status, customer });
  }

  @Get(":id")
  getById(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    return this.projectsService.getById(user.organisationId!, id);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ORG_ADMIN, UserRole.MANAGER, UserRole.TEAM_LEAD)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateProjectDto) {
    return this.projectsService.create(user.organisationId!, dto);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ORG_ADMIN, UserRole.MANAGER, UserRole.TEAM_LEAD)
  @Patch(":id")
  update(
    @CurrentUser() user: RequestUser,
    @Param("id") id: string,
    @Body() dto: UpdateProjectDto,
  ) {
    return this.projectsService.update(user.organisationId!, id, dto);
  }
}
