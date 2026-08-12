import { Body, Controller, Get, Headers, Post, Req } from "@nestjs/common";
import type { RawBodyRequest } from "@nestjs/common";
import type { Request } from "express";
import { CommerceService } from "./commerce.service.js";
import { CreateCommercialOrderDto, PaymentConfirmationEventDto, ReceiptLookupDto } from "./commerce.dto.js";

@Controller("commerce")
export class CommerceController {
  constructor(private readonly commerce: CommerceService) {}

  @Get("catalogue")
  catalogue() {
    return this.commerce.catalogue();
  }

  @Post("orders")
  createOrder(@Req() request: Request, @Body() input: CreateCommercialOrderDto) {
    return this.commerce.createOrder(input, request);
  }

  @Post("payment-events")
  paymentEvent(
    @Req() request: RawBodyRequest<Request>,
    @Headers("x-gridflow-payment-timestamp") timestamp: string | undefined,
    @Headers("x-gridflow-payment-signature") signature: string | undefined,
    @Body() input: PaymentConfirmationEventDto,
  ) {
    const raw = request.rawBody;
    this.commerce.verifyPaymentSignature(raw, timestamp, signature);
    return this.commerce.processPaymentEvent(input, raw!, request);
  }

  @Post("receipts/lookup")
  receipt(@Body() input: ReceiptLookupDto) {
    return this.commerce.receipt(input);
  }
}
