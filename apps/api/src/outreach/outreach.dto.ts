import { IsIn, IsISO8601, IsOptional, IsString, MaxLength } from "class-validator";

export const approvalDecisions = ["APPROVED", "REJECTED", "NEEDS_CHANGES"] as const;
export const linkedinActions = [
  "CONNECTION_SENT",
  "ACCEPTED",
  "FOLLOW_UP_SENT",
  "REPLIED",
  "NO_RESPONSE",
  "PAUSED",
  "RESUMED",
  "NOT_INTERESTED",
] as const;

export class UpdateOutreachVersionDto {
  @IsOptional()
  @IsString()
  @MaxLength(400)
  linkedinConnectionNote?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(5_000)
  linkedinFollowUpMessage?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  emailSubject?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(20_000)
  emailBody?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(20_000)
  followUpEmail1?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(20_000)
  followUpEmail2?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(5_000)
  callOpener?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(10_000)
  partnershipPitch?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(10_000)
  generationNotes?: string | null;
}

export class OutreachDecisionDto {
  @IsIn(approvalDecisions)
  decision!: typeof approvalDecisions[number];

  @IsOptional()
  @IsString()
  @MaxLength(2_000)
  comments?: string | null;
}

export class LinkedInActionDto {
  @IsIn(linkedinActions)
  action!: typeof linkedinActions[number];

  @IsOptional()
  @IsISO8601()
  occurredAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2_000)
  notes?: string | null;

  @IsOptional()
  @IsISO8601()
  nextFollowUpAt?: string | null;
}
