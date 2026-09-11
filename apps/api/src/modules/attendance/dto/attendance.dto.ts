// Phase 9: Attendance DTOs. Clock-in stamps the server time; clock-out records
// optional break minutes. Both are scoped to the authenticated employee and
// tenant-scoped by TenantGuard.
import { IsInt, IsOptional, Max } from "class-validator";

export class ClockInDto {
    // No body fields needed — the server stamps clockIn = now().
}

export class ClockOutDto {
  @IsOptional()
  @IsInt()
  @Max(1440) // sanity: break ≤ 24h
  breakMinutes?: number;
}

export class AttendanceQueryDto {
  @IsOptional()
  employeeId?: string;

  @IsOptional()
  from?: string;

  @IsOptional()
  to?: string;
}