import { Type } from "class-transformer";
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsEmail, IsIn, IsInt, IsObject, IsOptional, IsString, IsUrl, IsUUID, Length, Max, MaxLength, Min, ValidateNested } from "class-validator";

export class ContractSignerInputDto {
  @IsOptional() @IsUUID() contactId?: string;
  @IsString() @Length(1, 160) name!: string;
  @IsOptional() @IsEmail() @MaxLength(320) email?: string;
  @IsString() @Length(1, 160) role!: string;
  @IsString() @Length(1, 120) party!: string;
  @IsOptional() @IsBoolean() required?: boolean;
}

export class PaymentMilestoneInputDto {
  @IsString() @Length(1, 200) title!: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(2_147_483_647) amountMinor!: number;
  @IsString() @Length(3, 3) currency!: string;
  @IsString() @Length(10, 10) dueDate!: string;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}

export class CreateContractDto {
  @IsUUID() opportunityId!: string;
  @IsOptional() @IsUUID() proposalId?: string;
  @IsOptional() @IsString() @Length(3, 80) contractNumber?: string;
  @IsString() @Length(3, 240) title!: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(2_147_483_647) valueMinor!: number;
  @IsString() @Length(3, 3) currency!: string;
  @IsString() @Length(10, 10) startDate!: string;
  @IsString() @Length(10, 10) endDate!: string;
  @IsOptional() @IsString() @MaxLength(240) governingLaw?: string;
  @IsOptional() @IsString() @MaxLength(160) internalOwner?: string;
  @IsOptional() @IsUrl({ protocols: ["https"], require_protocol: true }) @MaxLength(2000) documentUrl?: string;
  @IsObject() terms!: Record<string, unknown>;
  @IsArray() @ArrayMinSize(2) @ArrayMaxSize(12) @ValidateNested({ each: true }) @Type(() => ContractSignerInputDto)
  signers!: ContractSignerInputDto[];
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(36) @ValidateNested({ each: true }) @Type(() => PaymentMilestoneInputDto)
  milestones!: PaymentMilestoneInputDto[];
}

export class ReviewContractDto {
  @IsIn(["APPROVE", "REJECT"]) decision!: "APPROVE" | "REJECT";
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}

export class MarkContractSentDto {
  @IsBoolean() confirmSentForSignature!: boolean;
  @IsOptional() @IsUrl({ protocols: ["https"], require_protocol: true }) @MaxLength(2000) documentUrl?: string;
}

export class UpdateSignerStatusDto {
  @IsIn(["VIEWED", "SIGNED", "DECLINED", "EXPIRED", "VOID"]) status!: "VIEWED" | "SIGNED" | "DECLINED" | "EXPIRED" | "VOID";
  @IsBoolean() confirmExternallyVerified!: boolean;
  @IsOptional() @IsString() @MaxLength(1000) reason?: string;
}

export class ActivateContractDto {
  @IsBoolean() confirmFullyExecuted!: boolean;
  @IsUrl({ protocols: ["https"], require_protocol: true }) @MaxLength(2000) signedDocumentUrl!: string;
  @IsOptional() @IsBoolean() updateOpportunityToWon?: boolean;
}

export class RecordPaymentDto {
  @Type(() => Number) @IsInt() @Min(0) @Max(2_147_483_647) amountPaidMinor!: number;
  @IsIn(["INVOICED", "PARTIALLY_PAID", "PAID", "WAIVED", "DISPUTED"]) status!: "INVOICED" | "PARTIALLY_PAID" | "PAID" | "WAIVED" | "DISPUTED";
  @IsBoolean() confirmFinancialRecord!: boolean;
  @IsOptional() @IsString() @MaxLength(240) invoiceReference?: string;
  @IsOptional() @IsString() @MaxLength(240) paymentReference?: string;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}

export class TerminateContractDto {
  @IsBoolean() confirmTermination!: boolean;
  @IsString() @Length(10, 2000) reason!: string;
}
