import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { TelegramService } from './telegram.service';

@Controller()
export class TelegramController {
  constructor(private readonly telegramService: TelegramService) {}

  // Public — called by Telegram servers (no /api prefix)
  @Post('telegram/webhook')
  async webhook(@Body() body: Record<string, any>) {
    await this.telegramService.handleUpdate(body);
    return { ok: true };
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
