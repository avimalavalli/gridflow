import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { DatabaseService } from "../database/database.service.js";
const statuses=["OPEN","IN_PROGRESS","COMPLETED","CANCELLED"] as const;
const types=["MANUAL_ACTION","LINKEDIN_ACTION","EMAIL_ACTION","FOLLOW_UP","MEETING_PREP","PROPOSAL","DATA_REVIEW","AUTOMATION_RETRY"] as const;
export interface CreateTaskInput { title?:string; description?:string|null; type?:string; dueAt?:string|null; companyId?:string|null; contactId?:string|null; opportunityId?:string|null; }
export interface UpdateTaskInput { title?:string; description?:string|null; type?:string; dueAt?:string|null; status?:string; }
@Injectable() export class TasksService {
 constructor(private readonly database:DatabaseService){}
 async list(tenantId:string){return this.database.tenantTransaction(tenantId,async tx=>(await tx.query(
  `SELECT t."id",t."title",t."description",t."type"::text AS "type",t."status"::text AS "status",t."dueAt",t."completedAt",t."createdAt",
          c."id" AS "companyId",c."companyName",ct."id" AS "contactId",ct."contactName",o."id" AS "opportunityId",o."opportunityName"
   FROM "Task" t LEFT JOIN "Company" c ON c."id"=t."companyId" LEFT JOIN "Contact" ct ON ct."id"=t."contactId" LEFT JOIN "Opportunity" o ON o."id"=t."opportunityId"
   WHERE t."tenantId"=$1::uuid ORDER BY CASE t."status" WHEN 'OPEN' THEN 1 WHEN 'IN_PROGRESS' THEN 2 ELSE 3 END,t."dueAt" ASC NULLS LAST,t."createdAt" DESC`,[tenantId])).rows)}
 async create(tenantId:string,userId:string,input:CreateTaskInput){if(!input.title?.trim())throw new BadRequestException("Task title is required.");this.validate(input);return this.database.tenantTransaction(tenantId,async tx=>{const r=await tx.query<{id:string}>(
  `INSERT INTO "Task" ("tenantId","companyId","contactId","opportunityId","ownerId","title","description","type","dueAt","updatedAt")
   VALUES ($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6,$7,$8::"TaskType",$9::timestamptz,CURRENT_TIMESTAMP) RETURNING "id"`,
  [tenantId,input.companyId??null,input.contactId??null,input.opportunityId??null,userId,input.title!.trim(),input.description??null,input.type??"MANUAL_ACTION",input.dueAt??null]);return {id:r.rows[0]?.id};})}
 async update(tenantId:string,id:string,input:UpdateTaskInput){this.validate(input);return this.database.tenantTransaction(tenantId,async tx=>{const e=await tx.query<{id:string}>(`SELECT "id" FROM "Task" WHERE "tenantId"=$1::uuid AND "id"=$2::uuid`,[tenantId,id]);if(!e.rows[0])throw new NotFoundException("Task not found.");await tx.query(
  `UPDATE "Task" SET "title"=COALESCE(NULLIF($3,''),"title"),"description"=CASE WHEN $4='__unchanged__' THEN "description" ELSE NULLIF($4,'') END,
   "type"=COALESCE($5::"TaskType","type"),"status"=COALESCE($6::"TaskStatus","status"),"dueAt"=CASE WHEN $7='__unchanged__' THEN "dueAt" ELSE NULLIF($7,'')::timestamptz END,
   "completedAt"=CASE WHEN $6='COMPLETED' THEN CURRENT_TIMESTAMP WHEN $6 IN ('OPEN','IN_PROGRESS') THEN NULL ELSE "completedAt" END,"updatedAt"=CURRENT_TIMESTAMP
   WHERE "tenantId"=$1::uuid AND "id"=$2::uuid`,[tenantId,id,input.title??"",input.description===undefined?"__unchanged__":input.description??"",input.type??null,input.status??null,input.dueAt===undefined?"__unchanged__":input.dueAt??""]);return {updated:true};})}
 private validate(input:CreateTaskInput&UpdateTaskInput){if(input.status&&!statuses.includes(input.status as never))throw new BadRequestException("Invalid task status.");if(input.type&&!types.includes(input.type as never))throw new BadRequestException("Invalid task type.");}
}
