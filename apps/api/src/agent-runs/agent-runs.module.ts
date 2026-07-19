import { Module } from "@nestjs/common";
import { ContextModule } from "../context/context.module.js";
import { DatabaseModule } from "../database/database.module.js";
import { AgentRunsController } from "./agent-runs.controller.js";
import { AgentRunsService } from "./agent-runs.service.js";

@Module({ imports: [DatabaseModule, ContextModule], controllers: [AgentRunsController], providers: [AgentRunsService] })
export class AgentRunsModule {}
