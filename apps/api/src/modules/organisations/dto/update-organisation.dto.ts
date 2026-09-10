import { IsOptional, IsString, Matches, MaxLength, MinLength } from "class-validator";

// Every field optional: PATCH semantics (only send what you want to change).
export class UpdateOrganisationDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  timeZone?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{2}$/, { message: "country must be a 2-letter ISO code" })
  country?: string;
}