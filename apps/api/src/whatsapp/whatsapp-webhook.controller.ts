import type { IncomingMessage } from 'node:http';
import {
  BadRequestException,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
  type RawBodyRequest,
} from '@nestjs/common';
import { RateLimit, RateLimitGuard } from '../security/rate-limit.guard.js';
import { MalformedWebhookError } from './whatsapp-provider.js';
import { UnauthenticWebhookError, WhatsAppWebhookService } from './whatsapp-webhook.service.js';

export interface WebhookAcknowledgement {
  readonly status: 'accepted';
}

@Controller('webhooks')
export class WhatsAppWebhookController {
  constructor(private readonly webhooks: WhatsAppWebhookService) {}

  @Post('whatsapp')
  @UseGuards(RateLimitGuard)
  @RateLimit('WEBHOOK')
  @HttpCode(HttpStatus.OK)
  async receive(@Req() request: RawBodyRequest<IncomingMessage>): Promise<WebhookAcknowledgement> {
    try {
      await this.webhooks.accept(
        { rawBody: request.rawBody ?? Buffer.alloc(0), headers: request.headers },
        new Date(),
      );
    } catch (error) {
      if (error instanceof UnauthenticWebhookError) {
        throw new UnauthorizedException();
      }
      if (error instanceof MalformedWebhookError) {
        throw new BadRequestException();
      }
      throw error;
    }
    return { status: 'accepted' };
  }
}
