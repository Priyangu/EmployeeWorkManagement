import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { AuthGuard } from "../../common/guards/auth.guard";
import { TenantGuard } from "../../common/guards/tenant.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { UserRole } from "@ewm/shared-types";
import type { RequestUser } from "../auth/strategies/jwt.strategy";
import { TimesheetsService } from "./timesheets.service";
import {
  CreateTimesheetDto,
  RejectTimesheetDto,
  SubmitTimesheetDto,
  TimesheetQueryDto,
  TimesheetSummaryQueryDto,
} from "./dto/timesheets.dto";

// Guard chain: Auth → Tenant → (Roles on mutating routes).
// Reads + submit: any org member. Approve/reject/correct: MANAGER+.
@UseGuards(AuthGuard, TenantGuard)
@Controller("timesheets")
export class TimesheetsController {
  constructor(private readonly timesheetsService: TimesheetsService) {}

  @Get("summary")
  summary(
    @CurrentUser() user: RequestUser,
    @Query() query: TimesheetSummaryQueryDto,
  ) {
    return this.timesheetsService.summary(user.organisationId!, user, query);
  }

  @Get()
  list(
    @CurrentUser() user: RequestUser,
    @Query() query: TimesheetQueryDto,
  ) {
    return this.timesheetsService.list(user.organisationId!, user, {
      ...(query.employeeId ? { employeeId: query.employeeId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.periodFrom ? { periodFrom: query.periodFrom } : {}),
      ...(query.periodTo ? { periodTo: query.periodTo } : {}),
    });
  }

  // Any org member may create their own timesheet — the service defaults
  // employeeId to the caller's own Employee. Creating one for someone else
  // is manager-only, enforced in the service via resolveTargetEmployee.
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateTimesheetDto,
  ) {
    return this.timesheetsService.create(user.organisationId!, user, dto);
  }

  @Post(":id/submit")
  @HttpCode(HttpStatus.OK)
  submit(
    @CurrentUser() user: RequestUser,
    @Param("id") id: string,
    @Body() _dto: SubmitTimesheetDto,
  ) {
    return this.timesheetsService.submit(user.organisationId!, user, id);
  }

  @Post(":id/approve")
  @UseGuards(RolesGuard)
  @Roles(UserRole.ORG_ADMIN, UserRole.MANAGER, UserRole.TEAM_LEAD)
  @HttpCode(HttpStatus.OK)
  approve(
    @CurrentUser() user: RequestUser,
    @Param("id") id: string,
  ) {
    return this.timesheetsService.approve(user.organisationId!, user, id);
  }

  @Post(":id/reject")
  @UseGuards(RolesGuard)
  @Roles(UserRole.ORG_ADMIN, UserRole.MANAGER, UserRole.TEAM_LEAD)
  @HttpCode(HttpStatus.OK)
  reject(
    @CurrentUser() user: RequestUser,
    @Param("id") id: string,
    @Body() dto: RejectTimesheetDto,
  ) {
    return this.timesheetsService.reject(user.organisationId!, user, dto, id);
  }

  @Post(":id/correct")
  @UseGuards(RolesGuard)
  @Roles(UserRole.ORG_ADMIN, UserRole.MANAGER, UserRole.TEAM_LEAD)
  @HttpCode(HttpStatus.CREATED)
  correct(
    @CurrentUser() user: RequestUser,
    @Param("id") id: string,
  ) {
    return this.timesheetsService.correct(user.organisationId!, user, id);
  }
}
