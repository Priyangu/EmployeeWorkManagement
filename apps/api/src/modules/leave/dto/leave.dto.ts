// Phase 9: Leave DTOs. Leave requests follow a pending → approved/rejected
// workflow. Managers (ORG_ADMIN/MANAGER/TEAM_LEAD) may act on any org
// request; employees may only act on their own.
import {
  IsEnum,
  IsISO8601,
  IsOptional,
  IsString,
  MaxLength,
} from "class-validator";
import { LeaveType } from "@ewm/shared-types";

export class CreateLeaveRequestDto {
  @IsEnum(LeaveType)
  type!: LeaveType;

  @IsISO8601({ strict: true })
  startDate!: string;

  @IsISO8601({ strict: true })
  endDate!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reason?: string;
}

export class ApproveLeaveRequestDto {
    // No body fields — approval is a state transition.
}

export class RejectLeaveRequestDto {
  @IsString()
  @MaxLength(1000)
  reason!: string;
}

export class LeaveRequestQueryDto {
  @IsOptional()
  @IsEnum(LeaveType)
  type?: LeaveType;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  employeeId?: string;
}

// Re-export for convenience
export { LeaveType };