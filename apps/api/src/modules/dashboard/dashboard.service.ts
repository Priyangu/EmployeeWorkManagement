import { Injectable } from "@nestjs/common";
import type {
  DashboardProjectPerformanceResponse,
  DashboardTeamWorkloadResponse,
  DashboardTodayResponse,
} from "@ewm/shared-types";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  private range(query: { from?: string; to?: string }) {
    const from = query.from ? new Date(query.from) : new Date();
    if (!query.from) {
      from.setUTCHours(0, 0, 0, 0);
      from.setUTCDate(from.getUTCDate() - ((from.getUTCDay() + 6) % 7));
    }
    const to = query.to ? new Date(query.to) : new Date(from);
    if (!query.to) to.setUTCDate(to.getUTCDate() + 7);
    return { from, to };
  }

  private hours(milliseconds: number): number {
    return Math.round((milliseconds / 3600000) * 100) / 100;
  }

  private capacityHours(workingHours: unknown, from: Date, to: Date): number {
    const configured = workingHours && typeof workingHours === "object"
      ? workingHours as Record<string, { start?: string; end?: string }>
      : {};
    let total = 0;
    for (const date = new Date(from); date < to; date.setUTCDate(date.getUTCDate() + 1)) {
      const day = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][date.getUTCDay()];
      const schedule = configured[day];
      if (schedule?.start && schedule.end) {
        const [startHour, startMinute] = schedule.start.split(":").map(Number);
        const [endHour, endMinute] = schedule.end.split(":").map(Number);
        total += Math.max(0, (endHour * 60 + endMinute - startHour * 60 - startMinute) / 60);
      } else if (date.getUTCDay() !== 0 && date.getUTCDay() !== 6) {
        total += 8;
      }
    }
    return total;
  }

  async today(organisationId: string): Promise<DashboardTodayResponse> {
    const start = new Date();
    start.setUTCHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 1);

    const [activeAttendance, activeTimers, scheduledTasks, completedTasks, overdueTasks, activeTasks] =
      await Promise.all([
        this.prisma.attendance.findMany({
          where: { organisationId, clockOut: null },
          distinct: ["employeeId"],
          select: { employeeId: true },
        }),
        this.prisma.timeEntry.findMany({
          where: { organisationId, status: { in: ["RUNNING", "PAUSED"] } },
          distinct: ["employeeId"],
          select: { employeeId: true },
        }),
        this.prisma.taskSchedule.count({
          where: { organisationId, scheduledStart: { lt: end }, scheduledEnd: { gt: start } },
        }),
        this.prisma.task.count({
          where: { organisationId, status: "COMPLETED", updatedAt: { gte: start, lt: end } },
        }),
        this.prisma.task.count({
          where: {
            organisationId,
            dueDate: { lt: start },
            status: { notIn: ["COMPLETED", "CANCELLED"] },
          },
        }),
        this.prisma.task.count({
          where: { organisationId, status: { in: ["IN_PROGRESS", "PAUSED"] } },
        }),
      ]);

    return {
      date: start.toISOString().slice(0, 10),
      employeesWorking: new Set([
        ...activeAttendance.map((record) => record.employeeId),
        ...activeTimers.map((entry) => entry.employeeId),
      ]).size,
      tasksScheduled: scheduledTasks,
      tasksCompleted: completedTasks,
      overdueTasks,
      activeTasks,
    };
  }

  async teamWorkload(
    organisationId: string,
    query: { from?: string; to?: string },
  ): Promise<DashboardTeamWorkloadResponse> {
    const { from, to } = this.range(query);
    const employees = await this.prisma.employee.findMany({
      where: { organisationId, deletedAt: null },
      select: {
        id: true,
        name: true,
        workingHours: true,
        schedules: {
          where: { scheduledStart: { lt: to }, scheduledEnd: { gt: from } },
          select: { scheduledStart: true, scheduledEnd: true },
        },
        timeEntries: {
          where: { status: "COMPLETED", startTime: { lt: to }, endTime: { gt: from } },
          select: { durationSeconds: true },
        },
        assignedTasks: {
          where: { deletedAt: null, status: { notIn: ["COMPLETED", "CANCELLED"] } },
          select: { id: true },
        },
      },
    });
    return {
      periodFrom: from.toISOString(),
      periodTo: to.toISOString(),
      employees: employees.map((employee) => ({
        employeeId: employee.id,
        employeeName: employee.name,
        scheduledHours: Math.round(employee.schedules.reduce((sum, schedule) => sum + this.hours(Math.max(0, schedule.scheduledEnd.getTime() - schedule.scheduledStart.getTime())), 0) * 100) / 100,
        actualHours: Math.round(employee.timeEntries.reduce((sum, entry) => sum + (entry.durationSeconds ?? 0) / 3600, 0) * 100) / 100,
        remainingTasks: employee.assignedTasks.length,
        capacityHours: this.capacityHours(employee.workingHours, from, to),
      })),
    };
  }

  async projectPerformance(
    organisationId: string,
    query: { from?: string; to?: string },
  ): Promise<DashboardProjectPerformanceResponse> {
    const { from, to } = this.range(query);
    const [projects, entries] = await Promise.all([
      this.prisma.project.findMany({
        where: { organisationId, deletedAt: null },
        select: {
          id: true,
          name: true,
          budgetHours: true,
          tasks: { where: { deletedAt: null }, select: { status: true, estimatedMinutes: true } },
        },
      }),
      this.prisma.timeEntry.findMany({
        where: { organisationId, status: "COMPLETED", startTime: { lt: to }, endTime: { gt: from }, projectId: { not: null } },
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
}
