import { IsBoolean, IsEmail, IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from "class-validator";

export class CreateCommercialOrderDto {
  @IsEmail()
  email!: string;

  @IsIn(["CORE", "ULTRA"])
  plan!: "CORE" | "ULTRA";
}

export class PaymentConfirmationEventDto {
  @IsString()
  @MinLength(3)
  @MaxLength(160)
  eventId!: string;

  @IsIn(["PAYMENT_CONFIRMED", "PAYMENT_FAILED", "PAYMENT_REVIEW_REQUIRED"])
  type!: "PAYMENT_CONFIRMED" | "PAYMENT_FAILED" | "PAYMENT_REVIEW_REQUIRED";

  @IsString()
  @MinLength(6)
  @MaxLength(80)
  orderReference!: string;

  @IsEmail()
  email!: string;

  @IsIn(["CORE", "ULTRA"])
  plan!: "CORE" | "ULTRA";

  @IsInt()
  @Min(1)
  @Max(1_000_000_000)
  amountMinor!: number;

  @Matches(/^[A-Z]{3}$/)
  currency!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(80)
  provider!: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(180)
  paymentReference?: string;

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason?: string;
}

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
  @IsEmail()
  email!: string;

  @IsIn(["CORE", "ULTRA"])
  plan!: "CORE" | "ULTRA";

  @IsInt()
  @Min(1)
  @Max(1_000_000_000)
  amountMinor!: number;

  @Matches(/^[A-Z]{3}$/)
  currency!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(80)
  paymentProvider!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(180)
  paymentReference!: string;

  @IsInt()
  @Min(0)
  @Max(1_000_000)
  researchCreditsGranted!: number;

  @IsInt()
  @Min(1)
  @Max(100)
  seatLimit!: number;

  @IsInt()
  @Min(1)
  @Max(90)
  activationExpiresInDays!: number;

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

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  researchCreditsGranted?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  seatLimit?: number;
}
