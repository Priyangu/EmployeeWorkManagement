import { Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../../common/guards/auth.guard";
import { TenantGuard } from "../../common/guards/tenant.guard";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { RequestUser } from "../auth/strategies/jwt.strategy";
import { NotificationsService } from "./notifications.service";

@UseGuards(AuthGuard, TenantGuard)
@Controller("notifications")
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  list(@CurrentUser() user: RequestUser) {
    return this.notificationsService.list(user.organisationId!, user.id);
  }

  @Post(":id/read")
  read(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    return this.notificationsService.markRead(user.organisationId!, user.id, id);
  }
}
