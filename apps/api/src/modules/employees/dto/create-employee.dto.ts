import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateIf,
} from "class-validator";
import type { UserRole } from "@ewm/shared-types";

// POST /employees supports two modes (exactly one required):
//  Mode A — create login + profile together: email + password (+ role).
//  Mode B — link to an existing user: userId.
// teamId/managerId are validated against the caller's org in the service
// (never trusted from the client alone).
export class CreateEmployeeDto {
  @ValidateIf((o: CreateEmployeeDto) => !o.userId)
  @IsEmail()
  email?: string;

  @ValidateIf((o: CreateEmployeeDto) => !o.userId)
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password?: string;

  @IsOptional()
  @IsIn(["ORG_ADMIN", "MANAGER", "TEAM_LEAD", "EMPLOYEE"])
  role?: UserRole;

  @ValidateIf((o: CreateEmployeeDto) => !o.email && !o.password)
  @IsUUID()
  userId?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;

  @IsOptional()
  @IsUUID()
  teamId?: string;

  @IsOptional()
  @IsUUID()
  managerId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  timeZone?: string;

  @IsOptional()
  @IsObject()
  workingHours?: Record<string, unknown>;
}
