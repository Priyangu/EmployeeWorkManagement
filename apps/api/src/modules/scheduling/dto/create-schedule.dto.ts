import { IsISO8601, IsUUID } from "class-validator";

// POST /schedule — book an employee onto a task for a time window.
// scheduledStart/End are ISO-8601 instants; the API stores them as UTC.
// Overlapping blocks for the same employee are allowed (warned, not blocked).
export class CreateScheduleDto {
  @IsUUID()
  taskId!: string;

  @IsUUID()
  employeeId!: string;

  @IsISO8601()
  scheduledStart!: string;

  @IsISO8601()
  scheduledEnd!: string;
}