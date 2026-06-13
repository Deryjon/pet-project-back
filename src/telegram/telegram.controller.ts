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

  // Public — called by Telegram servers
  @Post('telegram/webhook')
  async webhook(@Body() body: Record<string, any>) {
    await this.telegramService.handleUpdate(body);
    return { ok: true };
  }

  @Post('api/telegram/generate-link')
  generateLink(@Headers('authorization') authorization: string) {
    return this.telegramService.generateLinkToken(authorization);
  }

  @Get('api/telegram/subscribers')
  getSubscribers(@Headers('authorization') authorization: string) {
    return this.telegramService.getSubscribers(authorization);
  }

  @Patch('api/telegram/subscribers/:id')
  updateSubscriber(
    @Param('id') id: string,
    @Body() body: { notifyOnSale?: boolean; branchCode?: string | null },
    @Headers('authorization') authorization: string,
  ) {
    return this.telegramService.updateSubscriber(id, body, authorization);
  }

  @Delete('api/telegram/subscribers/:id')
  deleteSubscriber(
    @Param('id') id: string,
    @Headers('authorization') authorization: string,
  ) {
    return this.telegramService.deleteSubscriber(id, authorization);
  }
}
