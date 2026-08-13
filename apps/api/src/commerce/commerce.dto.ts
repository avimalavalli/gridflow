import { IsBoolean, IsEmail, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from "class-validator";

export class ReceiptLookupDto {
  @IsString()
  @MinLength(6)
  @MaxLength(80)
  receiptNumber!: string;

  @IsString()
  @MinLength(20)
  @MaxLength(300)
  token!: string;
}

export class ConfirmManualPurchaseDto {
  @IsIn(["CORE_ONBOARDING", "ULTRA_PERIOD", "RESEARCH_PACK"])
  productType!: "CORE_ONBOARDING" | "ULTRA_PERIOD" | "RESEARCH_PACK";

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsUUID()
  organisationId?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  packCode?: string;

  @IsInt()
  @Min(1)
  @Max(1_000_000_000)
  amountMinor!: number;

  @IsString()
  @MinLength(2)
  @MaxLength(180)
  paymentReference!: string;

  @IsBoolean()
  confirmPaymentRecord!: boolean;

  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}

export class ResolveCommercialPurchaseDto {
  @IsIn(["CONFIRM_PAYMENT", "MARK_FAILED"])
  action!: "CONFIRM_PAYMENT" | "MARK_FAILED";

  @IsBoolean()
  confirmPaymentRecord!: boolean;

  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(180)
  paymentReference?: string;
}
