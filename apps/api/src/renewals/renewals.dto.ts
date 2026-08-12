import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Length, Matches, MaxLength, Min } from "class-validator";

const intents = ["RENEW","EXPAND","RENEW_AND_EXPAND","HOLD","EXIT"] as const;
const sentiments = ["NOT_CAPTURED","POSITIVE","NEUTRAL","NEGATIVE"] as const;

export class PrepareRenewalCaseDto {
  @IsOptional() @IsBoolean() confirmInvalidateApproval?: boolean;
}

export class UpdateRenewalCaseDto {
  @IsIn(intents) intent!: typeof intents[number];
  @IsIn(sentiments) sponsorSentiment!: typeof sentiments[number];
  @IsOptional() @IsString() @MaxLength(3000) sponsorFeedback?: string;
  @IsString() @Length(10, 3000) internalRecommendation!: string;
  @IsOptional() @IsInt() @Min(0) proposedValueMinor?: number;
  @IsString() @Matches(/^[A-Z]{3}$/) currency!: string;
  @IsOptional() @IsString() @Length(10, 10) proposedStartDate?: string;
  @IsOptional() @IsString() @Length(10, 10) proposedEndDate?: string;
  @IsOptional() @IsString() @Length(10, 10) expectedDecisionDate?: string;
}

export class SubmitRenewalCaseDto {
  @IsBoolean() confirmFactsReviewed!: boolean;
}

export class ApproveRenewalCaseDto {
  @IsBoolean() confirmEvidenceReviewed!: boolean;
  @IsBoolean() confirmCommercialBoundaries!: boolean;
  @IsOptional() @IsBoolean() confirmOutcome?: boolean;
}

export class HandoffRenewalCaseDto {
  @IsBoolean() confirmNoExternalContact!: boolean;
}
