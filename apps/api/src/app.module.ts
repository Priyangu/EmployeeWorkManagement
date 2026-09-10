import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { APP_GUARD } from "@nestjs/core";
import { HealthModule } from "./modules/health/health.module";
import { PrismaModule } from "./prisma/prisma.module";
import { AuthModule } from "./modules/auth/auth.module";
import { OrganisationsModule } from "./modules/organisations/organisations.module";
import { EmployeesModule } from "./modules/employees/employees.module";
import { TeamsModule } from "./modules/teams/teams.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60_000, limit: 100 }], // generous default; auth endpoints override per-route
    }),
    PrismaModule,
    HealthModule,
    AuthModule,
    OrganisationsModule,
    EmployeesModule,
    TeamsModule,
    // Future modules land here, one per domain area, e.g.:
    // ProjectsModule, TasksModule, SchedulingModule, TimeTrackingModule,
    // TimesheetsModule, AttendanceModule, LeaveModule, NotificationsModule,
    // DashboardModule, ReportsModule, AuditModule.
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
