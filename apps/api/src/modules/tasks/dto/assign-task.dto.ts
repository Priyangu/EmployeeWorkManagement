import { IsUUID } from "class-validator";

export class AssignTaskDto {
  // Employee (HR record) to hand the task to; must belong to caller's org.
  @IsUUID()
  employeeId!: string;
}
