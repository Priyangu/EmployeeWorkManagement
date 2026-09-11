import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
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
import { AttendanceService } from "./attendance.service";
import { AttendanceQueryDto, ClockInDto, ClockOutDto } from "./dto/attendance.dto";

// Guard chain: Auth → Tenant. Employees clock in/out on their own records;
// managers may clock in/out for others. All queries are tenant-scoped.
@UseGuards(AuthGuard, TenantGuard)
@Controller("attendance")
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  @Post("clock-in")
  @UseGuards(RolesGuard)
  @Roles(UserRole.ORG_ADMIN, UserRole.MANAGER, UserRole.TEAM_LEAD, UserRole.EMPLOYEE)
  @HttpCode(HttpStatus.CREATED)
  clockIn(
    @CurrentUser() user: RequestUser,
    @Body() _dto: ClockInDto,
    @Query("employeeId") employeeId?: string,
  ) {
    return this.attendanceService.clockIn(user.organisationId!, user, employeeId);
  }

  @Post("clock-out")
  @UseGuards(RolesGuard)
  @Roles(UserRole.ORG_ADMIN, UserRole.MANAGER, UserRole.TEAM_LEAD, UserRole.EMPLOYEE)
  @HttpCode(HttpStatus.OK)
  clockOut(
    @CurrentUser() user: RequestUser,
    @Body() dto: ClockOutDto,
    @Query("employeeId") employeeId?: string,
  ) {
    return this.attendanceService.clockOut(user.organisationId!, user, employeeId, dto);
  }

  @Get()
  list(
    @CurrentUser() user: RequestUser,
    @Query() query: AttendanceQueryDto,
  ) {
    return this.attendanceService.list(user.organisationId!, user, {
      ...(query.employeeId ? { employeeId: query.employeeId } : {}),
      ...(query.from ? { from: query.from } : {}),
      ...(query.to ? { to: query.to } : {}),
    });
  }
}
