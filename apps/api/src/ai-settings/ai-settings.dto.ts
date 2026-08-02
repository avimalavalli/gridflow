import { Equals, IsBoolean, IsOptional, IsString, Matches, MaxLength, MinLength } from "class-validator";

export class SaveGeminiCredentialDto {
  @IsString()
  @MinLength(20)
  @MaxLength(512)
  apiKey!: string;

  @IsOptional()
  @IsString()
  @Matches(/^gemini-[a-z0-9.\-]+$/)
  @MaxLength(100)
  model?: string;

  @IsBoolean()
  @Equals(true, { message: "You must acknowledge the Gemini free-tier data terms before connecting the key." })
  acceptFreeTierDataTerms!: true;
}
