import { IsOptional, IsString, MaxLength, MinLength } from "class-validator";

// Metadata-only in MVP — the actual upload happens client-side against the
// StorageService-signed URL (wired in Phase 13). We record what was stored.
export class CreateTaskAttachmentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  storageKey!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  fileName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  mimeType?: string;
}
