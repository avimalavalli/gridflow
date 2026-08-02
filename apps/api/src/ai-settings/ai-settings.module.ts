import { Module } from "@nestjs/common";
import { ContextModule } from "../context/context.module.js";
import { DatabaseModule } from "../database/database.module.js";
import { AiSettingsController } from "./ai-settings.controller.js";
import { AiSettingsService } from "./ai-settings.service.js";

@Module({ imports: [DatabaseModule, ContextModule], controllers: [AiSettingsController], providers: [AiSettingsService] })
export class AiSettingsModule {}
