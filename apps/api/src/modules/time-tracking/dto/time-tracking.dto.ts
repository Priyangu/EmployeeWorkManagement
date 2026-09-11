// Time-tracking DTOs: thin timer payloads (server stamps startTime and
// enforces one active timer per employee), explicit windows for manual
// entries, audited edits with an optional reason for the AuditLog row.
import {
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from "class-validator";

export class StartTimerDto {
  // Managers may start a timer for someone else; defaults to self.
  @IsOptional()
  @IsUUID()
  employeeId?: string;

  // Optional task context; validated against the caller's org.
  @IsOptional()
  @IsUUID()
  taskId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class StopTimerDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class CreateManualTimeEntryDto {
  // Managers may log time for someone else; defaults to self.
  @IsOptional()
  @IsUUID()
  employeeId?: string;

  // Optional task context; validated against the caller's org.
  @IsOptional()
  @IsUUID()
  taskId?: string;

  @IsISO8601({ strict: true })
  startTime!: string;

  @IsISO8601({ strict: true })
  endTime!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class UpdateTimeEntryDto {
  @IsOptional()
  @IsUUID()
  taskId?: string | null;

  @IsOptional()
  @IsISO8601({ strict: true })
  startTime?: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  endTime?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string | null;

  // Audit reason: required when a manager edits someone else's entry, so the
  // AuditLog row always carries a human explanation alongside the diff.
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
