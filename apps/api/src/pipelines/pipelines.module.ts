import { Module } from "@nestjs/common";
import { ContextModule } from "../context/context.module.js";
import { DatabaseModule } from "../database/database.module.js";
import { PipelinesController } from "./pipelines.controller.js";
import { PipelinesService } from "./pipelines.service.js";

@Module({
  imports: [DatabaseModule, ContextModule],
  controllers: [PipelinesController],
  providers: [PipelinesService],
})
export class PipelinesModule {}
