import { Controller, Get, Req } from "@nestjs/common";
import type { Request } from "express";
import { TenantContextService } from "../context/tenant-context.service.js";
import { ContactsService } from "./contacts.service.js";

@Controller("contacts")
export class ContactsController {
  constructor(private readonly contacts: ContactsService, private readonly context: TenantContextService) {}
  @Get()
  async list(@Req() request: Request) {
    const identity = await this.context.resolve(request);
    return { contacts: await this.contacts.list(identity.tenantId) };
  }
}
