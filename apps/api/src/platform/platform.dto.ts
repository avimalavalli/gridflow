import { IsEmail, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from "class-validator";

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
