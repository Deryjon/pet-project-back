import 'reflect-metadata';
import { SCHEDULE_CRON_OPTIONS } from '@nestjs/schedule/dist/schedule.constants';
import { TelegramReportService } from './telegram-report.service';
import { TelegramSellerAnalyticsService } from './telegram-seller-analytics.service';

const cronOf = (method: unknown) =>
  (Reflect.getMetadata(SCHEDULE_CRON_OPTIONS, method as object) ?? {}).cronTime;

describe('Telegram report schedule', () => {
  afterEach(() => jest.useRealTimers());

  it('sends no report on Sunday', () => {
    const jobs = [
      cronOf(TelegramReportService.prototype.sendDailyReports),
      cronOf(TelegramReportService.prototype.sendWeeklyReports),
      cronOf(TelegramReportService.prototype.sendMonthlyReports),
      cronOf(TelegramSellerAnalyticsService.prototype.sendDailySellerAnalytics),
      cronOf(TelegramSellerAnalyticsService.prototype.sendWeeklySellerAnalytics),
    ];
    for (const cron of jobs) {
      expect(typeof cron).toBe('string');
      // Every job runs at 04:00 UTC = 09:00 Tashkent; weekly ones on Monday.
      expect(cron.split(' ').slice(0, 2)).toEqual(['0', '4']);
      expect(cron.split(' ')[4]).not.toBe('0');
    }
    expect(cronOf(TelegramSellerAnalyticsService.prototype.sendWeeklySellerAnalytics)).toBe('0 4 * * 1');
  });

  it('the weekly seller report on Monday covers the previous Monday–Sunday', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-12T04:00:00Z')); // Monday 09:00 Tashkent
    const service = new TelegramSellerAnalyticsService({} as any, {} as any, {} as any);
    const run = jest.spyOn(service as any, 'runForAllCompanies').mockResolvedValue(undefined);
    await service.sendWeeklySellerAnalytics();
    const [period, label] = run.mock.calls[0] as [{ start: Date; end: Date }, string];
    expect(period.start.toISOString()).toBe('2026-10-04T19:00:00.000Z'); // Mon 05.10 00:00 Tashkent
    expect(period.end.toISOString()).toBe('2026-10-11T19:00:00.000Z'); // Mon 12.10 00:00 Tashkent
    expect(label).toBe('05.10.2026 – 11.10.2026');
  });
});
