import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
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
import { EmployeesService } from "./employees.service";
import { CreateEmployeeDto } from "./dto/create-employee.dto";
import { UpdateEmployeeDto } from "./dto/update-employee.dto";

// All routes are tenant-scoped (AuthGuard → TenantGuard): the organisation
// always comes from the JWT, never from the request body or params.
// Reads are open to any org member; writes need ORG_ADMIN or MANAGER.
@UseGuards(AuthGuard, TenantGuard)
@Controller("employees")
export class EmployeesController {
  constructor(private readonly employeesService: EmployeesService) {}

  @Get()
  list(@CurrentUser() user: RequestUser) {
    return this.employeesService.list(user.organisationId!);
  }

  @Get(":id")
  getById(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    return this.employeesService.getById(user.organisationId!, id);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ORG_ADMIN, UserRole.MANAGER, UserRole.TEAM_LEAD)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateEmployeeDto) {
    return this.employeesService.create(user.organisationId!, dto, user);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ORG_ADMIN, UserRole.MANAGER, UserRole.TEAM_LEAD)
  @Patch(":id")
  update(
    @CurrentUser() user: RequestUser,
    @Param("id") id: string,
    @Body() dto: UpdateEmployeeDto,
  ) {
    return this.employeesService.update(user.organisationId!, id, dto);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ORG_ADMIN, UserRole.MANAGER, UserRole.TEAM_LEAD)
  @Post(":id/disable")
  @HttpCode(HttpStatus.OK)
  disable(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    return this.employeesService.setEmploymentStatus(
      user.organisationId!,
      id,
      "DISABLED",
    );
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ORG_ADMIN, UserRole.MANAGER, UserRole.TEAM_LEAD)
  @Post(":id/enable")
  @HttpCode(HttpStatus.OK)
  enable(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    return this.employeesService.setEmploymentStatus(
      user.organisationId!,
      id,
      "ACTIVE",
    );
  }
}
