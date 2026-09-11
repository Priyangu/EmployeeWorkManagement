import {
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";
import { TaskPriority } from "@ewm/shared-types";

export class CreateTaskDto {
  // The parent project must already exist in the caller's org.
  @IsUUID()
  projectId!: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsString()
  @MinLength(2)
  @MaxLength(160)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string;

  @IsOptional()
  priority?: TaskPriority;

  @IsOptional()
  @IsInt()
  @Min(1)
  estimatedMinutes?: number;

  @IsOptional()
  @IsISO8601()
  dueDate?: string;

  // Optional at creation; assigning later via POST /tasks/:id/assign records
  // the auditable TaskAssignment row. An initial assignee here is recorded
  // through the same path (status flips NOT_STARTED → SCHEDULED).
  @IsOptional()
  @IsUUID()
  assigneeId?: string;
}
