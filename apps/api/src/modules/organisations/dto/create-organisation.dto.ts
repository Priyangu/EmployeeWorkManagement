import { IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength, ValidateNested } from "class-validator";
import { Type } from "class-transformer";

export class ProvisionOrgAdminDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(120)
  password!: string;
}

export class CreateOrganisationDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  timeZone?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{2}$/, { message: "country must be a 2-letter ISO code" })
  country?: string;

  // SUPER_ADMIN only: provision the organisation with its first ORG_ADMIN
  // account atomically in the same transaction.
  @IsOptional()
  @ValidateNested()
  @Type(() => ProvisionOrgAdminDto)
  admin?: ProvisionOrgAdminDto;
}