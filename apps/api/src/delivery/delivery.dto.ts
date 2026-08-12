import { IsBoolean, IsIn, IsOptional, IsString, IsUrl, Length, MaxLength } from "class-validator";

const categories = ["BRANDING","CONTENT","SOCIAL_MEDIA","EVENT","HOSPITALITY","APPEARANCE","REPORTING","MEDIA_VALUE","OTHER"] as const;
const evidenceTypes = ["URL","DOCUMENT","IMAGE","VIDEO","ANALYTICS","APPROVAL","OTHER"] as const;

export class ConfigureDeliveryProgrammeDto {
  @IsString() @Length(1, 160) internalOwner!: string;
  @IsOptional() @IsString() @Length(10, 10) renewalReviewDate?: string;
  @IsBoolean() confirmPlanReviewed!: boolean;
}

export class CreateDeliveryObligationDto {
  @IsString() @Length(1, 240) title!: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsIn(categories) category!: typeof categories[number];
  @IsOptional() @IsString() @Length(10, 10) dueDate?: string;
  @IsOptional() @IsBoolean() proofRequired?: boolean;
}

export class UpdateDeliveryObligationDto extends CreateDeliveryObligationDto {}

export class RecordDeliveryEvidenceDto {
  @IsIn(evidenceTypes) type!: typeof evidenceTypes[number];
  @IsString() @Length(1, 240) title!: string;
  @IsUrl({ protocols: ["https"], require_protocol: true }) @MaxLength(2000) evidenceUrl!: string;
  @IsString() @MaxLength(40) occurredAt!: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}

export class VerifyDeliveryEvidenceDto {
  @IsBoolean() confirmReviewed!: boolean;
}

export class TransitionDeliveryObligationDto {
  @IsIn(["READY","IN_PROGRESS","DELIVERED","VERIFIED","BLOCKED","WAIVED"])
  status!: "READY"|"IN_PROGRESS"|"DELIVERED"|"VERIFIED"|"BLOCKED"|"WAIVED";
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
  @IsOptional() @IsBoolean() confirmEvidenceReviewed?: boolean;
}

export class GenerateDeliveryReportDto {
  @IsString() @Length(10, 10) periodStart!: string;
  @IsString() @Length(10, 10) periodEnd!: string;
}

export class ApproveDeliveryReportDto {
  @IsBoolean() confirmAccurate!: boolean;
}

export class ShareDeliveryReportDto {
  @IsBoolean() confirmSharedExternally!: boolean;
  @IsUrl({ protocols: ["https"], require_protocol: true }) @MaxLength(2000) sharedUrl!: string;
}

export class UpdateDeliveryRenewalDto {
  @IsIn(["NOT_STARTED","DUE","IN_PROGRESS","RENEWED","DECLINED"])
  status!: "NOT_STARTED"|"DUE"|"IN_PROGRESS"|"RENEWED"|"DECLINED";
  @IsOptional() @IsBoolean() confirmOutcome?: boolean;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}

export class CompleteDeliveryProgrammeDto {
  @IsBoolean() confirmComplete!: boolean;
}
