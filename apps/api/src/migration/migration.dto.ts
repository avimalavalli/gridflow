import { IsIn, IsOptional, IsString, MaxLength } from "class-validator";
import type { ReviewDecision } from "./airtable-importer.js";

export class SetMigrationDecisionDto {
  @IsString()
  legacyId!: string;

  @IsIn(["PENDING", "APPROVE", "APPLY_REPAIRS", "SKIP"])
  decision!: ReviewDecision;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
