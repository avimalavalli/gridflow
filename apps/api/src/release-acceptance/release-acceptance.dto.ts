import { IsIn, IsOptional, IsString, IsUrl, MaxLength, MinLength } from "class-validator";

export class UpdateAcceptanceCheckDto {
  @IsIn(["PASS", "FAIL", "BLOCKED", "WAIVED"])
  status!: "PASS" | "FAIL" | "BLOCKED" | "WAIVED";

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string;

  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(1000)
  evidenceUrl?: string;
}

export class CreateReleaseAcceptanceDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  releaseVersion!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  commitSha?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  environment?: string;
}
