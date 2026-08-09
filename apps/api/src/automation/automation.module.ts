import { Module } from "@nestjs/common";
import { ContextModule } from "../context/context.module.js";
import { DatabaseModule } from "../database/database.module.js";
import { AutomationController } from "./automation.controller.js";
import { AutomationService } from "./automation.service.js";

@Module({ imports: [DatabaseModule, ContextModule], controllers: [AutomationController], providers: [AutomationService] })
export class AutomationModule {}
