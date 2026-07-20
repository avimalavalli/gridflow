import { Body, Controller, Get, Param, Patch, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import { TenantContextService } from "../context/tenant-context.service.js";
import { ContactsService, type CreateContactInput, type UpdateContactInput } from "./contacts.service.js";

@Controller("contacts")
export class ContactsController {
  constructor(private readonly contacts: ContactsService, private readonly context: TenantContextService) {}

  @Get()
  async list(@Req() request: Request) {
    const identity = await this.context.resolve(request);
    return { contacts: await this.contacts.list(identity.tenantId) };
  }


  @Post()
  async create(@Req() request: Request, @Body() input: CreateContactInput) {
    const identity = await this.context.resolve(request);
    this.context.assertOperator(identity);
    return this.contacts.create(identity.tenantId, identity.userId, input);
  }

  @Get(":id")
  async detail(@Req() request: Request, @Param("id") id: string) {
    const identity = await this.context.resolve(request);
    return this.contacts.detail(identity.tenantId, id);
  }

  @Patch(":id")
  async update(@Req() request: Request, @Param("id") id: string, @Body() input: UpdateContactInput) {
    const identity = await this.context.resolve(request);
    this.context.assertOperator(identity);
    return this.contacts.update(identity.tenantId, id, input);
  }
}
