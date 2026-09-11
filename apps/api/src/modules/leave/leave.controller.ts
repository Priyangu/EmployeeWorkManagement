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
import { LeaveService } from "./leave.service";
import {
  CreateLeaveRequestDto,
  LeaveRequestQueryDto,
  RejectLeaveRequestDto,
} from "./dto/leave.dto";

// Guard chain: Auth → Tenant → (Roles on mutating routes).
// Any org member can list/create their own requests; managers approve/reject.
@UseGuards(AuthGuard, TenantGuard)
@Controller("leave-requests")
export class LeaveController {
  constructor(private readonly leaveService: LeaveService) {}

  @Get()
  list(
    @CurrentUser() user: RequestUser,
    @Query() query: LeaveRequestQueryDto,
  ) {
    return this.leaveService.list(user.organisationId!, user, {
      ...(query.employeeId ? { employeeId: query.employeeId } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.status ? { status: query.status } : {}),
    });
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateLeaveRequestDto,
  ) {
    return this.leaveService.create(user.organisationId!, user, dto);
  }

  @Post(":id/approve")
  @UseGuards(RolesGuard)
  @Roles(UserRole.ORG_ADMIN, UserRole.MANAGER, UserRole.TEAM_LEAD)
  @HttpCode(HttpStatus.OK)
  approve(
    @CurrentUser() user: RequestUser,
    @Param("id") id: string,
  ) {
    return this.leaveService.approve(user.organisationId!, user, id);
  }

  @Post(":id/reject")
  @UseGuards(RolesGuard)
  @Roles(UserRole.ORG_ADMIN, UserRole.MANAGER, UserRole.TEAM_LEAD)
  @HttpCode(HttpStatus.OK)
  reject(
    @CurrentUser() user: RequestUser,
    @Param("id") id: string,
    @Body() dto: RejectLeaveRequestDto,
  ) {
    return this.leaveService.reject(user.organisationId!, user, id, dto);
  }
}
