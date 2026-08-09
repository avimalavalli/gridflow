import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module.js";
import { OperationsProofsController } from "./operations-proofs.controller.js";
import { OperationsProofsService } from "./operations-proofs.service.js";

@Module({
  imports: [DatabaseModule],
  controllers: [OperationsProofsController],
  providers: [OperationsProofsService],
  exports: [OperationsProofsService],
})
export class OperationsProofsModule {}
