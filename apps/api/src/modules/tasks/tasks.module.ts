import { Module } from "@nestjs/common";
import { TasksController } from "./tasks.controller";
import { TasksService } from "./tasks.service";
import { NotificationsModule } from "../notifications/notifications.module";

@Module({
  controllers: [TasksController],
  providers: [TasksService],
  imports: [NotificationsModule],
})
export class TasksModule {}
