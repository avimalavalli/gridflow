import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

export class QueueForgeDto {
  @IsUUID()
  opportunityId!: string;

  @IsUUID()
  requestKey!: string;

  @IsString() @MinLength(3) @MaxLength(300)
  title!: string;

  @IsString() @MinLength(3) @MaxLength(3000)
  objective!: string;

  @IsString() @Matches(/^[A-Z]{3}$/)
  currency!: string;

  @IsOptional() @IsInt() @Min(0) @Max(2_147_483_647)
  minInvestmentMinor?: number;

  @IsOptional() @IsInt() @Min(0) @Max(2_147_483_647)
  maxInvestmentMinor?: number;

  @IsOptional() @IsInt() @Min(1) @Max(60)
  termMonths?: number;

  @IsInt() @Min(1) @Max(3)
  packageCount!: number;

  @IsOptional() @IsString() @MaxLength(12000)
  requirements?: string;

  @IsOptional() @IsString() @MaxLength(6000)
  exclusions?: string;

  @IsOptional() @IsString() @MaxLength(6000)
  nonNegotiables?: string;

  @IsOptional() @IsDateString()
  deadline?: string;
}

export class ReviewForgeDto {
  @IsString() @IsIn(["APPROVE", "EDIT", "REJECT"])
  decision!: "APPROVE" | "EDIT" | "REJECT";

  @IsOptional() @IsObject()
  draft?: Record<string, unknown>;

  @IsOptional() @IsString() @MinLength(3) @MaxLength(4000)
  notes?: string;
}

export class ReviseForgeDto {
  @IsString() @MinLength(3) @MaxLength(4000)
  instructions!: string;
}

export class MarkForgeSentDto {
  @IsBoolean()
  confirmExternallySent!: boolean;

  @IsString() @IsIn(["EMAIL", "LINKEDIN", "PHONE"])
  channel!: "EMAIL" | "LINKEDIN" | "PHONE";

  @IsOptional() @IsDateString()
  sentAt?: string;

  @IsOptional() @IsBoolean()
  updateOpportunity?: boolean;
}
