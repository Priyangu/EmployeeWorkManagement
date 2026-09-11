import {
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";
import { ProjectStatus } from "@ewm/shared-types";

const STATUSES = Object.values(ProjectStatus) as string[];

// PATCH /projects/:id — explicit null clears the nullable field; undefined
// leaves it untouched (same convention as UpdateTeamDto).
export class UpdateProjectDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  customer?: string | null;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: "startDate must be YYYY-MM-DD" })
  startDate?: string | null;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: "endDate must be YYYY-MM-DD" })
  endDate?: string | null;

  @IsOptional()
  @IsIn(STATUSES)
  status?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  budgetHours?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  budgetAmount?: number | null;

  @IsOptional()
  @IsUUID()
  projectManagerId?: string | null;
}
