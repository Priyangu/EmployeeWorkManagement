import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from "class-validator";

// Name uniqueness is per-org (@@unique([organisationId, name])); the service
// enforces scope so "Platform" in Org A doesn't clash with Org B's.
export class CreateTeamDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsUUID()
  managerId?: string;
}
