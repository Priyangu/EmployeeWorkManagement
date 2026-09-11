import { IsISO8601, IsOptional, IsUUID } from "class-validator";

// PATCH /schedule/:id — every field optional. Used by the calendar UI for
// drag-to-reschedule (move the window, optionally reassign the task/employee).
export class UpdateScheduleDto {
  @IsOptional()
  @IsUUID()
  taskId?: string;

  @IsOptional()
  @IsUUID()
  employeeId?: string;

  @IsOptional()
  @IsISO8601()
  scheduledStart?: string;

  @IsOptional()
  @IsISO8601()
  scheduledEnd?: string;
}