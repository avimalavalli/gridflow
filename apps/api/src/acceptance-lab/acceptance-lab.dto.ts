import { IsBoolean, IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from "class-validator";

const PERSONAS = ["NEW_CORE_DRIVER", "ULTRA_RENEWAL", "CORE_AFTER_ULTRA", "MOBILE_RECOVERY"] as const;
const DEVICES = ["DESKTOP", "MOBILE", "TABLET"] as const;
const STEP_STATUSES = ["PENDING", "PASS", "FAIL", "BLOCKED", "NOT_APPLICABLE"] as const;
const FINDING_TYPES = ["BUG", "FRICTION", "CONFUSION", "DEAD_END", "UNNECESSARY_CLICK", "PERFORMANCE", "ACCESSIBILITY"] as const;
const SEVERITIES = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "OBSERVATION"] as const;
const FINDING_STATUSES = ["OPEN", "IN_PROGRESS", "RESOLVED", "DEFERRED"] as const;

export class CreateAcceptanceJourneyDto {
  @IsUUID()
  organisationId!: string;

  @IsIn(PERSONAS)
  persona!: (typeof PERSONAS)[number];

  @IsIn(DEVICES)
  deviceClass!: (typeof DEVICES)[number];

  @IsString()
  @MinLength(2)
  @MaxLength(80)
  browser!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class UpdateAcceptanceStepDto {
  @IsIn(STEP_STATUSES)
  status!: (typeof STEP_STATUSES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  evidenceReference?: string;
}

export class CreateAcceptanceFindingDto {
  @IsUUID()
  journeyId!: string;

  @IsOptional()
  @IsUUID()
  stepId?: string;

  @IsIn(FINDING_TYPES)
  type!: (typeof FINDING_TYPES)[number];

  @IsIn(SEVERITIES)
  severity!: (typeof SEVERITIES)[number];

  @IsString()
  @MinLength(3)
  @MaxLength(160)
  title!: string;

  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  detail!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  route?: string;
}

export class UpdateAcceptanceFindingDto {
  @IsIn(FINDING_STATUSES)
  status!: (typeof FINDING_STATUSES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  resolution?: string;
}

export class FreezeAcceptanceCycleDto {
  @IsBoolean()
  confirmComplete!: boolean;

  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  notes!: string;
}
