import { Module } from "@nestjs/common";
import { DeliveryController } from "./delivery.controller.js";
import { DeliveryService } from "./delivery.service.js";
import { RenewalsModule } from "../renewals/renewals.module.js";

@Module({ imports:[RenewalsModule], controllers: [DeliveryController], providers: [DeliveryService] })
export class DeliveryModule {}
