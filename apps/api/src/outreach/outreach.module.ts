import { Module } from "@nestjs/common";
import { ContextModule } from "../context/context.module.js";
import { DatabaseModule } from "../database/database.module.js";
import { OutreachController } from "./outreach.controller.js";
import { OutreachService } from "./outreach.service.js";
@Module({ imports: [DatabaseModule, ContextModule], controllers: [OutreachController], providers: [OutreachService] })
export class OutreachModule {}
