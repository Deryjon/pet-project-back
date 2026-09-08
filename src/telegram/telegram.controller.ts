import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { timingSafeEqual } from 'crypto';
import { TelegramService } from './telegram.service';

@Controller()
export class TelegramController {
  constructor(private readonly telegramService: TelegramService) {}

  // Public — called by Telegram servers (no /api prefix)
  @Post('telegram/webhook')
  async webhook(
    @Body() body: Record<string, any>,
    @Headers('x-telegram-bot-api-secret-token') providedSecret?: string,
  ) {
    const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
    if (!expectedSecret || !this.sameSecret(expectedSecret, providedSecret)) {
      throw new UnauthorizedException('Invalid Telegram webhook secret');
    }
    await this.telegramService.handleUpdate(body);
    return { ok: true };
  }

  private sameSecret(expected: string, provided?: string) {
    if (!provided) return false;
    const expectedBuffer = Buffer.from(expected);
    const providedBuffer = Buffer.from(provided);
    return (
      expectedBuffer.length === providedBuffer.length &&
      timingSafeEqual(expectedBuffer, providedBuffer)
    );
  }

  // All routes below are under /api prefix (added by frontend baseURL)
  @Post('telegram/generate-link')
  generateLink(@Headers('authorization') authorization: string) {
    return this.telegramService.generateLinkToken(authorization);
  }

  @Get('telegram/subscribers')
  getSubscribers(@Headers('authorization') authorization: string) {
    return this.telegramService.getSubscribers(authorization);
  }

  @Patch('telegram/subscribers/:id')
  updateSubscriber(
    @Param('id') id: string,
    @Body()
    body: {
      notifyOnSale?: boolean;
      notifySellerAnalytics?: boolean;
      notifyOnLogin?: boolean;
      notifyOnLowStock?: boolean;
      branchCode?: string | null;
    },
    @Headers('authorization') authorization: string,
  ) {
    return this.telegramService.updateSubscriber(id, body, authorization);
  }

  @Delete('telegram/subscribers/:id')
  deleteSubscriber(
    @Param('id') id: string,
    @Headers('authorization') authorization: string,
  ) {
    return this.telegramService.deleteSubscriber(id, authorization);
  }
}
