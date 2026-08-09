import { Body, Controller, Headers, HttpCode, Post } from "@nestjs/common";
import { RecordOperationsProofDto } from "./operations-proofs.dto.js";
import { OperationsProofsService } from "./operations-proofs.service.js";

@Controller("operations/proofs")
export class OperationsProofsController {
  constructor(private readonly proofs: OperationsProofsService) {}

  @Post()
  @HttpCode(202)
  async record(@Headers("authorization") authorization: string | undefined, @Body() body: RecordOperationsProofDto) {
    this.proofs.assertAuthorised(authorization);
    return this.proofs.record(body);
  }
}
