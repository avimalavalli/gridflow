import { Module } from "@nestjs/common";
import { OperationsProofsModule } from "../operations-proofs/operations-proofs.module.js";
import { HealthController } from "./health.controller.js";

@Module({ imports: [OperationsProofsModule], controllers: [HealthController] })
export class HealthModule {}
