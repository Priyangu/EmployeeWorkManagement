import { IsISO8601, IsOptional, IsUUID } from "class-validator";

export class ProjectReportQueryDto {
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  from?: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  to?: string;

  @IsOptional()
  format?: "json" | "csv";
}
