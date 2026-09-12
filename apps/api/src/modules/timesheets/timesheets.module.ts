import { Module } from "@nestjs/common";
import { TimesheetsController } from "./timesheets.controller";
import { TimesheetsService } from "./timesheets.service";
import { NotificationsModule } from "../notifications/notifications.module";

@Module({
  controllers: [TimesheetsController],
  providers: [TimesheetsService],
  imports: [NotificationsModule],
})
export class TimesheetsModule {}