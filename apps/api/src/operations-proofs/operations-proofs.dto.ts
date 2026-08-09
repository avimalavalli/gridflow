import { IsBoolean, IsIn, IsInt, IsISO8601, IsOptional, IsString, IsUrl, Matches, Max, MaxLength, Min } from "class-validator";

export class RecordOperationsProofDto {
  @IsIn(["MONITOR_HEARTBEAT", "BACKUP_RESTORE_VERIFIED"])
  kind!: "MONITOR_HEARTBEAT" | "BACKUP_RESTORE_VERIFIED";

  @IsString()
  @Matches(/^[A-Za-z0-9._:-]+$/)
  @MaxLength(120)
  runId!: string;

  @IsUrl({ require_protocol: true, protocols: ["https"] })
  @MaxLength(1000)
  sourceUrl!: string;

  @IsISO8601()
  observedAt!: string;

  @IsOptional()
  @Matches(/^[a-f0-9]{7,64}$/i)
  @MaxLength(80)
  commitSha?: string;

  @IsOptional()
  @Matches(/^[a-f0-9]{64}$/i)
  checksumSha256?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  backupBytes?: number;

  @IsOptional()
  @IsBoolean()
  restoreVerified?: boolean;

  @IsOptional()
  @IsInt()
  @Min(13)
  @Max(10_000)
  migrationsVerified?: number;
}
