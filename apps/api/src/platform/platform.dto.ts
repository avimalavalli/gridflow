import { IsEmail, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from "class-validator";

export class CreateActivationGrantDto {
  @IsEmail()
  email!: string;

  @IsIn(["CORE", "ULTRA"])
  plan!: "CORE" | "ULTRA";

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

export class AddResearchCreditsDto {
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  amount!: number;

  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}

export class RenewUltraDto {
  @IsInt()
  @Min(1)
  @Max(365)
  days!: number;

  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}
