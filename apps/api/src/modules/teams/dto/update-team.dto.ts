import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from "class-validator";

// PATCH /teams/:id — explicit null clears the manager; undefined keeps it.
export class UpdateTeamDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsUUID()
  managerId?: string | null;
}
