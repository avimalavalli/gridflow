import { Type } from "class-transformer";
import { IsArray, IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min } from "class-validator";

const modes = ["GUIDED", "ASSISTED", "CONTROLLED"] as const;
const cadences = ["MANUAL", "DAILY", "WEEKLY"] as const;

export class UpdateAutomationPolicyDto {
  @IsOptional() @IsIn(modes) mode?: (typeof modes)[number];
  @IsOptional() @IsBoolean() enabled?: boolean;
  @IsOptional() @IsString() @MaxLength(80) timezone?: string;
  @IsOptional() @Matches(/^([01][0-9]|2[0-3]):[0-5][0-9]$/) quietHoursStart?: string;
  @IsOptional() @Matches(/^([01][0-9]|2[0-3]):[0-5][0-9]$/) quietHoursEnd?: string;
  @IsOptional() @IsArray() @IsInt({ each: true }) @Min(0, { each: true }) @Max(6, { each: true }) workingDays?: number[];
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(500) dailyAgentRunLimit?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(1000) dailyResearchCreditLimit?: number;
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(10000) dailyEstimatedCostLimitUsd?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) maxConcurrentRuns?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) approvalBatchSize?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(3) @Max(180) staleOpportunityDays?: number;
  @IsOptional() @IsBoolean() missingDataChecksEnabled?: boolean;
  @IsOptional() @IsBoolean() automaticTaskCreationEnabled?: boolean;
  @IsOptional() @IsBoolean() automaticRetryEnabled?: boolean;
  @IsOptional() @IsBoolean() integrationMonitoringEnabled?: boolean;
  @IsOptional() @IsBoolean() weeklyBriefEnabled?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(6) weeklyBriefDay?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(23) weeklyBriefHour?: number;
  @IsOptional() @IsBoolean() discoveryScheduleEnabled?: boolean;
  @IsOptional() @IsIn(cadences) discoveryCadence?: (typeof cadences)[number];
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(6) discoveryDay?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(23) discoveryHour?: number;
  @IsOptional() @IsBoolean() paused?: boolean;
  @IsOptional() @IsString() @MaxLength(500) pauseReason?: string;
}

export class AutomationDecisionDto {
  @IsIn(["APPROVE", "REJECT"]) decision!: "APPROVE" | "REJECT";
  @IsOptional() @IsString() @MaxLength(2_000) notes?: string;
}

export class BatchAutomationDecisionDto {
  @IsArray() @IsUUID(undefined, { each: true }) ids!: string[];
  @IsIn(["APPROVE", "REJECT"]) decision!: "APPROVE" | "REJECT";
  @IsOptional() @IsString() @MaxLength(2_000) notes?: string;
}
