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

// Deliberately no `status` here — status changes flow only through the
// action endpoints (/start /pause /resume /complete) so the transition map
// can't be bypassed. `projectId` is also immutable: move the task by
// creating it in the right project (keeps time-entry history coherent).
export class UpdateTaskDto {
  @IsOptional()
  @IsUUID()
  categoryId?: string | null;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string | null;

  @IsOptional()
  priority?: TaskPriority;

  @IsOptional()
  @IsInt()
  @Min(1)
  estimatedMinutes?: number | null;

  @IsOptional()
  @IsISO8601()
  dueDate?: string | null;
}
