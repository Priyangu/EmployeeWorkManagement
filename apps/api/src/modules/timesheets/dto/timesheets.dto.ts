// Phase 9: Timesheet DTOs. Timesheet creation pulls existing COMPLETED time
// entries for the week into an immutable snapshot; status transitions are
// explicit (submit/approve/reject) so the API can enforce the critical rule:
// once APPROVED, a timesheet is immutable — corrections create a new version.
import { IsEnum, IsISO8601, IsOptional, IsString, IsUUID, MaxLength } from "class-validator";
import {
  TimesheetStatus,
  TimesheetSummaryGranularity,
} from "@ewm/shared-types";

export class CreateTimesheetDto {
  // Managers may create a timesheet for someone else; defaults to self.
  @IsOptional()
  @IsUUID()
  employeeId?: string;

  @IsISO8601({ strict: true })
  periodStart!: string; // Monday 00:00 UTC of the target week
}

export class SubmitTimesheetDto {
  // No body fields — submission is a state transition.
}

export class RejectTimesheetDto {
  @IsString()
  @MaxLength(1000)
  reason!: string;
}

export class TimesheetQueryDto {
  @IsOptional()
  @IsUUID()
  employeeId?: string;

  @IsOptional()
  @IsEnum(TimesheetStatus)
  status?: TimesheetStatus;

  @IsOptional()
  @IsISO8601({ strict: true })
  periodFrom?: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  periodTo?: string;
}

export class TimesheetSummaryQueryDto {
  @IsEnum(TimesheetSummaryGranularity)
  granularity!: TimesheetSummaryGranularity;

  @IsISO8601({ strict: true })
  periodFrom!: string;

  @IsISO8601({ strict: true })
  periodTo!: string;

  @IsOptional()
  @IsUUID()
  employeeId?: string;
}