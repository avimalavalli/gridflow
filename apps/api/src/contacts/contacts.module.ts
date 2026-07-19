import { Module } from "@nestjs/common";
import { ContextModule } from "../context/context.module.js";
import { DatabaseModule } from "../database/database.module.js";
import { ContactsController } from "./contacts.controller.js";
import { ContactsService } from "./contacts.service.js";
@Module({ imports: [DatabaseModule, ContextModule], controllers: [ContactsController], providers: [ContactsService] })
export class ContactsModule {}
