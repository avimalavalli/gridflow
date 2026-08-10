import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

export class CreateSealContractDto {
  @IsUUID()
  opportunityId!: string;

  @IsOptional() @IsUUID()
  proposalId?: string;

  @IsString() @MinLength(3) @MaxLength(300)
  title!: string;

  @IsString() @MinLength(2) @MaxLength(300)
  counterpartyLegalName!: string;

  @IsString() @Matches(/^[A-Z]{3}$/)
  currency!: string;

  @IsInt() @Min(0) @Max(2_147_483_647)
  cashValueMinor!: number;

  @IsOptional() @IsString() @MaxLength(4000)
  considerationSummary?: string;

  @IsOptional() @IsDateString()
  effectiveDate?: string;

  @IsOptional() @IsDateString()
  termStartDate?: string;

  @IsOptional() @IsDateString()
  termEndDate?: string;

  @IsOptional() @IsString() @MaxLength(2000)
  documentUrl?: string;

  @IsOptional() @IsString() @MaxLength(500)
  externalDocumentReference?: string;
}

export class ConfirmSealTermsDto {
  @IsBoolean()
  confirmTermsReviewed!: boolean;

  @IsOptional() @IsString() @MaxLength(4000)
  notes?: string;
}

export class MarkSealReadyToSignDto {
  @IsBoolean()
  confirmExternalDocumentReady!: boolean;

  @IsOptional() @IsString() @MaxLength(2000)
  documentUrl?: string;

  @IsOptional() @IsString() @MaxLength(500)
  externalDocumentReference?: string;
}

export class ConfirmSealSignedDto {
  @IsBoolean()
  confirmFullyExecutedExternally!: boolean;

  @IsOptional() @IsDateString()
  signedAt?: string;

  @IsOptional() @IsBoolean()
  updateOpportunity?: boolean;
}

export class CreateSealMilestoneDto {
  @IsString() @MinLength(2) @MaxLength(240)
  label!: string;

  @IsInt() @Min(1) @Max(2_147_483_647)
  amountMinor!: number;

  @IsString() @Matches(/^[A-Z]{3}$/)
  currency!: string;

  @IsDateString()
  dueDate!: string;
}

export class ConfirmSealPaymentDto {
  @IsUUID()
  requestKey!: string;

  @IsBoolean()
  confirmReceivedExternally!: boolean;

  @IsInt() @Min(1) @Max(2_147_483_647)
  amountMinor!: number;

  @IsOptional() @IsDateString()
  receivedAt?: string;

  @IsOptional() @IsString() @MaxLength(500)
  externalReference?: string;

  @IsOptional() @IsString() @MaxLength(2000)
  note?: string;
}
