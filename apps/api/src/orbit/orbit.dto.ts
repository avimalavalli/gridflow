import { IsBoolean, IsIn, IsObject, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class ReviewOrbitPrepDto {
  @IsString() @IsIn(["APPROVE", "EDIT", "REJECT"])
  decision!: "APPROVE" | "EDIT" | "REJECT";

  @IsOptional() @IsObject()
  draft?: Record<string, unknown>;

  @IsOptional() @IsString() @MinLength(3) @MaxLength(4000)
  notes?: string;
}

export class QueueOrbitDebriefDto {
  @IsString() @MinLength(3) @MaxLength(20000)
  notes!: string;
}

export class ReviewOrbitDebriefDto {
  @IsString() @IsIn(["APPROVE", "EDIT", "REJECT"])
  decision!: "APPROVE" | "EDIT" | "REJECT";

  @IsOptional() @IsObject()
  draft?: Record<string, unknown>;

  @IsOptional() @IsBoolean()
  createTasks?: boolean;

  @IsOptional() @IsBoolean()
  applyOpportunityUpdate?: boolean;

  @IsOptional() @IsString() @MinLength(3) @MaxLength(4000)
  notes?: string;
}

export class RetryOrbitDto {
  @IsString() @IsIn(["PREP", "DEBRIEF"])
  stage!: "PREP" | "DEBRIEF";
}
