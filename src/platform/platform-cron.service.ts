import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PlatformService } from './platform.service';

@Injectable()
export class PlatformCronService {
  private readonly logger = new Logger(PlatformCronService.name);

  constructor(private readonly platformService: PlatformService) {}

  @Cron('5 0 * * *')
  async blockExpiredSubscriptions() {
    const result = await this.platformService.checkExpiredSubscriptions();

    if (result.expired_count > 0) {
      this.logger.log(`Blocked ${result.expired_count} expired subscriptions`);
    }
  }
}
