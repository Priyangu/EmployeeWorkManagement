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
import { AuthGuard } from "../../common/guards/auth.guard";
import { TenantGuard } from "../../common/guards/tenant.guard";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { RequestUser } from "../auth/strategies/jwt.strategy";
import { TimeTrackingService } from "./time-tracking.service";
import {
  CreateManualTimeEntryDto,
  StartTimerDto,
  StopTimerDto,
  UpdateTimeEntryDto,
} from "./dto/time-tracking.dto";

// Guard chain per architecture: Auth → Tenant. There is deliberately NO
// RolesGuard here: employees own the timer lifecycle (start/pause/stop on
// their own entries) and the privacy/authorisation rules — "only your own
// entries", "manager-level roles may edit others' but only with a reason",
// "managers may start/log time for someone else" — are enforced in the
// service, which is exactly how the Tasks workflow actions work.
@UseGuards(AuthGuard, TenantGuard)
@Controller("time-entries")
export class TimeTrackingController {
  constructor(private readonly timeTrackingService: TimeTrackingService) {}

  @Post("start")
  @HttpCode(HttpStatus.CREATED)
  start(@CurrentUser() user: RequestUser, @Body() dto: StartTimerDto) {
    return this.timeTrackingService.startTimer(user.organisationId!, user, dto);
  }

  // Literal route declared before the parametric GET /:id so it wins routing.
  @Get("active")
  active(
    @CurrentUser() user: RequestUser,
    @Query("employeeId") employeeId?: string,
  ) {
    return this.timeTrackingService.getActive(
      user.organisationId!,
      user,
      employeeId,
    );
  }

  @Post("manual")
  @HttpCode(HttpStatus.CREATED)
  createManual(@CurrentUser() user: RequestUser, @Body() dto: CreateManualTimeEntryDto) {
    return this.timeTrackingService.createManual(user.organisationId!, user, dto);
  }

  @Get()
  list(
    @CurrentUser() user: RequestUser,
    @Query("employeeId") employeeId?: string,
    @Query("taskId") taskId?: string,
    @Query("status") status?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    return this.timeTrackingService.list(user.organisationId!, user, {
      ...(employeeId ? { employeeId } : {}),
      ...(taskId ? { taskId } : {}),
      ...(status ? { status } : {}),
      ...(from || to ? { from, to } : {}),
    });
  }

  @Get(":id")
  getById(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    return this.timeTrackingService.getById(user.organisationId!, user, id);
  }

  @Post(":id/pause")
  @HttpCode(HttpStatus.OK)
  pause(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    return this.timeTrackingService.pause(user.organisationId!, user, id);
  }

  @Post(":id/resume")
  @HttpCode(HttpStatus.OK)
  resume(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    return this.timeTrackingService.resume(user.organisationId!, user, id);
  }

  @Post(":id/stop")
  @HttpCode(HttpStatus.OK)
  stop(@CurrentUser() user: RequestUser, @Param("id") id: string, @Body() dto: StopTimerDto) {
    return this.timeTrackingService.stop(user.organisationId!, user, id, dto);
  }

  @Patch(":id")
  update(
    @CurrentUser() user: RequestUser,
    @Param("id") id: string,
    @Body() dto: UpdateTimeEntryDto,
  ) {
    return this.timeTrackingService.update(user.organisationId!, user, id, dto);
  }
}
