import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../../common/guards/auth.guard";
import { TenantGuard } from "../../common/guards/tenant.guard";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { RequestUser } from "../auth/strategies/jwt.strategy";
import { DashboardService } from "./dashboard.service";
import { DashboardRangeQueryDto } from "./dto/dashboard.dto";

@UseGuards(AuthGuard, TenantGuard)
@Controller("dashboard")
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get("today")
  today(@CurrentUser() user: RequestUser) {
    return this.dashboardService.today(user.organisationId!);
  }

  @Get("team-workload")
  teamWorkload(@CurrentUser() user: RequestUser, @Query() query: DashboardRangeQueryDto) {
    return this.dashboardService.teamWorkload(user.organisationId!, query);
  }

  @Get("project-performance")
  projectPerformance(@CurrentUser() user: RequestUser, @Query() query: DashboardRangeQueryDto) {
    return this.dashboardService.projectPerformance(user.organisationId!, query);
  }
}
