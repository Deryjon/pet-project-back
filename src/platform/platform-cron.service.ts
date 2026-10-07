import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PlatformService } from './platform.service';

@Injectable()
export class PlatformCronService {
  private readonly logger = new Logger(PlatformCronService.name);

  constructor(private readonly platformService: PlatformService) {}

  // Pinned to UTC (05:05 in Tashkent) so the process-wide TZ=Asia/Tashkent
  // does not move subscription blocking to just after local midnight.
  @Cron('5 0 * * *', { timeZone: 'UTC' })
  async blockExpiredSubscriptions() {
    const result = await this.platformService.checkExpiredSubscriptions();

    if (result.expired_count > 0) {
      this.logger.log(`Blocked ${result.expired_count} expired subscriptions`);
    }
  }
}
