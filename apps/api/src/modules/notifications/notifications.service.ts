import { Injectable, NotFoundException } from "@nestjs/common";
import type { NotificationResponse } from "@ewm/shared-types";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(organisationId: string, userId: string): Promise<NotificationResponse[]> {
    const rows = await this.prisma.notification.findMany({
      where: { organisationId, userId },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return rows.map((row) => ({
      id: row.id,
      type: row.type,
      payload: row.payloadJson as Record<string, unknown>,
      isRead: row.isRead,
      createdAt: row.createdAt.toISOString(),
      readAt: row.readAt?.toISOString() ?? null,
    }));
  }

  async markRead(organisationId: string, userId: string, id: string): Promise<void> {
    const result = await this.prisma.notification.updateMany({
      where: { id, organisationId, userId },
      data: { isRead: true, readAt: new Date() },
    });
    if (result.count === 0) throw new NotFoundException("Notification not found");
  }

  async create(
    organisationId: string,
    userId: string,
    type: "TASK_ASSIGNED" | "TIMESHEET_APPROVED" | "TIMESHEET_REJECTED",
    payload: Record<string, unknown>,
  ): Promise<void> {
    await this.prisma.notification.create({
      data: { organisationId, userId, type, payloadJson: payload as Prisma.InputJsonValue },
    });
  }
}
