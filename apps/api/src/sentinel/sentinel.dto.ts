import { IsIn, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export const replyIntents = [
  "POSITIVE_INTEREST",
  "MORE_INFORMATION",
  "MEETING_REQUEST",
  "REFERRAL",
  "OBJECTION",
  "NO_BUDGET",
  "NOT_NOW",
  "NOT_INTERESTED",
  "WRONG_CONTACT",
  "OUT_OF_OFFICE",
  "UNSUBSCRIBE",
  "UNKNOWN",
] as const;

export type ReplyIntentDto = (typeof replyIntents)[number];

export class ReviewSentinelReplyDto {
  @IsString()
  @IsIn(["ACCEPT", "CORRECT"])
  decision!: "ACCEPT" | "CORRECT";

  @IsOptional()
  @IsString()
  @IsIn(replyIntents)
  intent?: ReplyIntentDto;

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(4000)
  notes?: string;
}
