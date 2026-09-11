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
  UseGuards,
} from '@nestjs/common';
import { timingSafeEqual } from 'crypto';
import { CurrentCompanyContext } from '../auth/company-context.decorator';
import { CompanyAccessGuard } from '../auth/guards/company-access.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Permissions } from '../auth/permissions.decorator';
import { CompanyRequestContext } from '../auth/request-context';
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
  @UseGuards(JwtAuthGuard, CompanyAccessGuard, PermissionsGuard)
  @Permissions('telegram-notification')
  generateLink(@CurrentCompanyContext() requestContext: CompanyRequestContext) {
    return this.telegramService.generateLinkToken(requestContext);
  }

  @Get('telegram/subscribers')
  @UseGuards(JwtAuthGuard, CompanyAccessGuard, PermissionsGuard)
  @Permissions('telegram-notification')
  getSubscribers(
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.telegramService.getSubscribers(requestContext);
  }

  @Patch('telegram/subscribers/:id')
  @UseGuards(JwtAuthGuard, CompanyAccessGuard, PermissionsGuard)
  @Permissions('telegram-notification')
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
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.telegramService.updateSubscriber(id, body, requestContext);
  }

  @Delete('telegram/subscribers/:id')
  @UseGuards(JwtAuthGuard, CompanyAccessGuard, PermissionsGuard)
  @Permissions('telegram-notification')
  deleteSubscriber(
    @Param('id') id: string,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.telegramService.deleteSubscriber(id, requestContext);
  }
}
