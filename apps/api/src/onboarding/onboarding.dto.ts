import { Type } from "class-transformer";
import {
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from "class-validator";
import { RecommendDiscoveryBriefsDto } from "../discovery/discovery.dto.js";

const approvalModes = ["EVERY_MESSAGE", "INITIAL_ONLY", "HIGH_VALUE_ONLY", "NONE"] as const;

export class CompleteOnboardingDto extends RecommendDiscoveryBriefsDto {
  @IsOptional()
  @IsString()
  currentSeries?: string;

  @IsOptional()
  @IsString()
  currentTeam?: string;

  @IsOptional()
  @IsString()
  currentProgramme?: string;

  @IsOptional()
  @IsString()
  futureGoals?: string;

  @IsOptional()
  @IsString()
  personalStory?: string;

  @IsOptional()
  @IsString()
  differentiators?: string;

  @IsOptional()
  @IsString()
  audienceSummary?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  audienceCountries?: string[];

  @IsOptional()
  @IsString()
  tone?: string;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsIn(approvalModes)
  approvalMode?: (typeof approvalModes)[number];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100000)
  dailyEmailLimit?: number;

  @IsOptional()
  @IsString()
  timezone?: string;
}
