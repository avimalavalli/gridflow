import { Module } from "@nestjs/common";
import { ContextModule } from "../context/context.module.js";
import { DatabaseModule } from "../database/database.module.js";
import { AcceptanceLabController } from "./acceptance-lab.controller.js";
import { AcceptanceLabService } from "./acceptance-lab.service.js";

@Module({ imports: [DatabaseModule, ContextModule], controllers: [AcceptanceLabController], providers: [AcceptanceLabService], exports: [AcceptanceLabService] })
export class AcceptanceLabModule {}
