import { Injectable } from "@nestjs/common";
import { AgentEngine, type EnqueueAgentRequest } from "@gridflow/engine";
import { DatabaseService } from "../database/database.service.js";

@Injectable()
export class AgentRunsService {
  private enginePromise?: Promise<AgentEngine>;
  constructor(private readonly database: DatabaseService) {}

  private engine(): Promise<AgentEngine> {
    this.enginePromise ??= this.database.raw().then((database) => new AgentEngine(database));
    return this.enginePromise;
  }

  async enqueue(tenantId: string, userId: string, request: EnqueueAgentRequest) {
    return (await this.engine()).enqueue(tenantId, userId, request);
  }

  async list(tenantId: string) {
    return (await this.engine()).listRuns(tenantId);
  }

  async retry(tenantId: string, userId: string, agentRunId: string) {
    return (await this.engine()).retryRun(tenantId, userId, agentRunId);
  }
}
