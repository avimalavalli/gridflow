import { Injectable } from "@nestjs/common";
import { AgentEngine } from "@gridflow/engine";
import { DatabaseService } from "../database/database.service.js";

@Injectable()
export class PipelinesService {
  private enginePromise?: Promise<AgentEngine>;

  constructor(private readonly database: DatabaseService) {}

  private engine(): Promise<AgentEngine> {
    this.enginePromise ??= this.database.raw().then((database) => new AgentEngine(database));
    return this.enginePromise;
  }

  async start(tenantId: string, userId: string, discoveryBriefId: string) {
    return (await this.engine()).startPipeline(tenantId, userId, discoveryBriefId);
  }

  async list(tenantId: string) {
    return (await this.engine()).listPipelines(tenantId);
  }
}
