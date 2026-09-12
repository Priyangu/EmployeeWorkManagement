import { Controller, Get, Query, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import { AuthGuard } from "../../common/guards/auth.guard";
import { TenantGuard } from "../../common/guards/tenant.guard";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { RequestUser } from "../auth/strategies/jwt.strategy";
import { ReportsService } from "./reports.service";
import { ProjectReportQueryDto } from "./dto/project-report.dto";

@UseGuards(AuthGuard, TenantGuard)
@Controller("reports")
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get("project")
  async project(
    @CurrentUser() user: RequestUser,
    @Query() query: ProjectReportQueryDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const report = await this.reportsService.project(user.organisationId!, query);
    if (query.format === "csv") {
      response.header("Content-Type", "text/csv; charset=utf-8");
      response.header("Content-Disposition", "attachment; filename=project-report.csv");
      return this.reportsService.toCsv(report);
    }
    return report;
  }
}
