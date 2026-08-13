import { Body, Controller, Get, Post } from "@nestjs/common";
import { CommerceService } from "./commerce.service.js";
import { ReceiptLookupDto } from "./commerce.dto.js";

@Controller("commerce")
export class CommerceController {
  constructor(private readonly commerce: CommerceService) {}

  @Get("catalogue")
  catalogue() {
    return this.commerce.catalogue();
  }

  @Post("receipts/lookup")
  receipt(@Body() input: ReceiptLookupDto) {
    return this.commerce.receipt(input);
  }
}
