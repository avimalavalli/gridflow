import { Module } from "@nestjs/common";
import { ContextModule } from "../context/context.module.js";
import { DatabaseModule } from "../database/database.module.js";
import { PulseController } from "./pulse.controller.js";
import { PulseService } from "./pulse.service.js";

@Module({
  imports: [DatabaseModule, ContextModule],
  controllers: [PulseController],
  providers: [PulseService],
})
export class PulseModule {}
