import { Module } from "@nestjs/common";
import { RenewalsController } from "./renewals.controller.js";
import { RenewalsService } from "./renewals.service.js";

@Module({ controllers:[RenewalsController], providers:[RenewalsService], exports:[RenewalsService] })
export class RenewalsModule {}
