import { Injectable, NotFoundException } from "@nestjs/common";
import type { DashboardProjectPerformanceResponse } from "@ewm/shared-types";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async project(
    organisationId: string,
    query: { projectId?: string; from?: string; to?: string },
  ): Promise<DashboardProjectPerformanceResponse> {
    const from = query.from ? new Date(query.from) : new Date(0);
    const to = query.to ? new Date(query.to) : new Date();
    if (query.projectId) {
      const exists = await this.prisma.project.findFirst({
        where: { id: query.projectId, organisationId, deletedAt: null },
        select: { id: true },
      });
      if (!exists) throw new NotFoundException("Project not found");
    }

    const [projects, entries] = await Promise.all([
      this.prisma.project.findMany({
        where: { organisationId, deletedAt: null, ...(query.projectId ? { id: query.projectId } : {}) },
        select: {
          id: true,
          name: true,
          budgetHours: true,
          tasks: { where: { deletedAt: null }, select: { status: true, estimatedMinutes: true } },
        },
        orderBy: { name: "asc" },
      }),
      this.prisma.timeEntry.findMany({
        where: {
          organisationId,
          status: "COMPLETED",
          startTime: { lt: to },
          endTime: { gt: from },
          projectId: query.projectId ? query.projectId : { not: null },
        },
        select: { projectId: true, durationSeconds: true },
      }),
    ]);

    const actualByProject = new Map<string, number>();
    for (const entry of entries) {
      if (entry.projectId) actualByProject.set(entry.projectId, (actualByProject.get(entry.projectId) ?? 0) + (entry.durationSeconds ?? 0) / 3600);
    }

    return {
      periodFrom: from.toISOString(),
      periodTo: to.toISOString(),
      projects: projects.map((project) => {
        const plannedHours = project.budgetHours ?? project.tasks.reduce((sum, task) => sum + (task.estimatedMinutes ?? 0) / 60, 0);
        const actualHours = Math.round((actualByProject.get(project.id) ?? 0) * 100) / 100;
        const completed = project.tasks.filter((task) => task.status === "COMPLETED").length;
        return {
          projectId: project.id,
          projectName: project.name,
          plannedHours,
          actualHours,
          varianceHours: Math.round((actualHours - plannedHours) * 100) / 100,
          completionPercent: project.tasks.length ? Math.round((completed / project.tasks.length) * 100) : 0,
        };
      }),
    };
  }

  toCsv(report: DashboardProjectPerformanceResponse): string {
    const escape = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`;
    const lines = ["Project,Planned Hours,Actual Hours,Variance Hours,Completion Percent"];
    for (const project of report.projects) {
      lines.push([project.projectName, project.plannedHours, project.actualHours, project.varianceHours, project.completionPercent].map(escape).join(","));
    }
    return `${lines.join("\r\n")}\r\n`;
  }
}
