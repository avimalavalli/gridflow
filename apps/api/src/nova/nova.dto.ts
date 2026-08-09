import { Type } from "class-transformer";
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

export const novaRelationshipActions = ["CONTINUE", "PAUSE", "CLOSE"] as const;
export const novaResponseChannels = ["EMAIL", "LINKEDIN", "NONE"] as const;
export const novaOpportunityStages = ["INTERESTED", "DISCOVERY_CALL", "NEEDS_ANALYSIS", "ON_HOLD"] as const;

export type NovaRelationshipActionDto = (typeof novaRelationshipActions)[number];
export type NovaResponseChannelDto = (typeof novaResponseChannels)[number];
export type NovaOpportunityStageDto = (typeof novaOpportunityStages)[number];

export class ReviewNovaDto {
  @IsString()
  @IsIn(["APPROVE", "EDIT", "REJECT"])
  decision!: "APPROVE" | "EDIT" | "REJECT";

  @IsOptional() @IsString() @IsIn(novaRelationshipActions)
  relationshipAction?: NovaRelationshipActionDto;

  @IsOptional() @IsString() @MaxLength(800)
  relationshipReason?: string;

  @IsOptional() @IsBoolean()
  responseRequired?: boolean;

  @IsOptional() @IsString() @IsIn(novaResponseChannels)
  responseChannel?: NovaResponseChannelDto;

  @IsOptional() @IsString() @MaxLength(300)
  draftSubject?: string;

  @IsOptional() @IsString() @MaxLength(8000)
  draftBody?: string;

  @IsOptional() @IsString() @MaxLength(2000)
  objectionStrategy?: string;

  @IsOptional() @IsBoolean()
  shouldCreateOpportunity?: boolean;

  @IsOptional() @IsString() @MaxLength(300)
  opportunityName?: string;

  @IsOptional() @IsString() @IsIn(novaOpportunityStages)
  opportunityStage?: NovaOpportunityStageDto;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(100)
  opportunityProbability?: number;

  @IsOptional() @IsString() @MaxLength(1200)
  opportunityRationale?: string;

  @IsOptional() @IsBoolean()
  shouldRecommendMeeting?: boolean;

  @IsOptional() @IsBoolean()
  createMeetingTask?: boolean;

  @IsOptional() @IsString() @MaxLength(300)
  meetingTitle?: string;

  @IsOptional() @IsString() @MaxLength(1200)
  meetingObjective?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(120)
  meetingDurationMinutes?: number;

  @IsOptional() @IsString() @MaxLength(3000)
  meetingAgenda?: string;

  @IsOptional() @IsString() @MaxLength(1200)
  meetingRationale?: string;

  @IsOptional() @IsString() @MinLength(3) @MaxLength(4000)
  notes?: string;
}
