import { IsBoolean, IsEmail, IsIn, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min, MinLength } from "class-validator";
import { Type } from "class-transformer";

export class CreateActivationGrantDto {
  @IsEmail()
  email!: string;

  @IsInt()
  @Min(1)
  @Max(90)
  expiresInDays!: number;
}

export class OrganisationAccessDecisionDto {
  @IsIn(["APPROVE", "SUSPEND", "REJECT", "REVOKE"])
  action!: "APPROVE" | "SUSPEND" | "REJECT" | "REVOKE";

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason?: string;
}

export class MarkUltraPaymentPendingDto {
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}

export class ReconcileResearchEconomicsDto {
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Max(1000000)
  modelCostGbp!: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Max(1000000)
  webSearchCostGbp!: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Max(1000000)
  externalCostGbp!: number;

  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  notes!: string;
}

export class ApproveResearchEconomicsDto {
  @IsBoolean()
  confirmComplete!: boolean;
}
