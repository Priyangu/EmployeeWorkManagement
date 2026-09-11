import {
  Body,
  Controller,
  Delete,
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
import { SchedulingService } from "./scheduling.service";
import { CreateScheduleDto } from "./dto/create-schedule.dto";
import { UpdateScheduleDto } from "./dto/update-schedule.dto";

// Guard chain per architecture: Auth → Tenant (reads open to any org member
// so everyone can see the week's plan), writes restricted to management
// roles. Overlap conflicts surface as warnings on the payload, never as 4xx.
@UseGuards(AuthGuard, TenantGuard)
@Controller("schedule")
export class SchedulingController {
  constructor(private readonly schedulingService: SchedulingService) {}

  @Get()
  list(
    @CurrentUser() user: RequestUser,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("employeeId") employeeId?: string,
  ) {
    return this.schedulingService.list(user.organisationId!, {
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
      ...(employeeId ? { employeeId } : {}),
    });
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ORG_ADMIN, UserRole.MANAGER, UserRole.TEAM_LEAD)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateScheduleDto) {
    return this.schedulingService.create(user.organisationId!, dto);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ORG_ADMIN, UserRole.MANAGER, UserRole.TEAM_LEAD)
  @Patch(":id")
  update(
    @CurrentUser() user: RequestUser,
    @Param("id") id: string,
    @Body() dto: UpdateScheduleDto,
  ) {
    return this.schedulingService.update(user.organisationId!, id, dto);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ORG_ADMIN, UserRole.MANAGER, UserRole.TEAM_LEAD)
  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    return this.schedulingService.remove(user.organisationId!, id);
  }
}