import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { SellerAnalyticsService } from '../analytics/seller-analytics.service';
import { SellerAnalyticsReport } from '../analytics/seller-analytics.types';
import { TelegramService } from './telegram.service';

// ── Date helpers (Tashkent UTC+5) — mirrors telegram-report.service.ts ───────

const TZ_OFFSET_MS = 5 * 60 * 60 * 1000;

function tashkentToday(): Date {
  return new Date(Date.now() + TZ_OFFSET_MS);
}

function utcDayBounds(tashkentDate: Date): { start: Date; end: Date } {
  const y = tashkentDate.getUTCFullYear();
  const m = tashkentDate.getUTCMonth();
  const d = tashkentDate.getUTCDate();
  return {
    start: new Date(Date.UTC(y, m, d) - TZ_OFFSET_MS),
    end: new Date(Date.UTC(y, m, d + 1) - TZ_OFFSET_MS),
  };
}

function shiftDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function fmt(value: number): string {
  return Math.round(value).toLocaleString('ru-RU').replace(/ /g, ' ');
}

function pct(value: number): string {
  return Math.round(value).toString();
}

@Injectable()
export class TelegramSellerAnalyticsService {
  private readonly logger = new Logger(TelegramSellerAnalyticsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly telegramService: TelegramService,
    private readonly sellerAnalyticsService: SellerAnalyticsService,
  ) {}

  // 9:00 Ташкент = 04:00 UTC — за вчера
  @Cron('0 4 * * *', { timeZone: 'UTC' })
  async sendDailySellerAnalytics() {
    const today = tashkentToday();
    const yesterday = shiftDays(today, -1);
    const period = utcDayBounds(yesterday);
    const dateLabel = yesterday.toISOString().slice(0, 10);
    await this.runForAllCompanies(period, `за ${dateLabel}`);
  }

  // Воскресенье 20:00 Ташкент = 15:00 UTC — за прошлую неделю (Пн–Вс)
  @Cron('0 15 * * 0', { timeZone: 'UTC' })
  async sendWeeklySellerAnalytics() {
    const today = tashkentToday();
    const lastMonday = shiftDays(today, -7);
    const lastSunday = shiftDays(today, -1);
    const period = {
      start: utcDayBounds(lastMonday).start,
      end: utcDayBounds(lastSunday).end,
    };

    const fmtDate = (d: Date) =>
      d.toLocaleDateString('ru-RU', { timeZone: 'Asia/Tashkent', day: '2-digit', month: '2-digit', year: 'numeric' });

    await this.runForAllCompanies(period, `${fmtDate(lastMonday)} – ${fmtDate(lastSunday)}`);
  }

  private async runForAllCompanies(period: { start: Date; end: Date }, periodLabel: string) {
    const companies = await this.prisma.telegramSubscriber.findMany({
      where: { notifySellerAnalytics: true },
      select: { companyId: true },
      distinct: ['companyId'],
    });

    for (const { companyId } of companies) {
      await this.sendForCompany(companyId, period, periodLabel).catch((err) =>
        this.logger.error(`Seller analytics failed for company ${companyId}`, err),
      );
    }
  }

  private async sendForCompany(
    companyId: string,
    period: { start: Date; end: Date },
    periodLabel: string,
  ) {
    const [reports, subscribers] = await Promise.all([
      this.sellerAnalyticsService.buildCompanyReports(companyId, period),
      this.prisma.telegramSubscriber.findMany({
        where: { companyId, notifySellerAnalytics: true },
      }),
    ]);

    if (!reports.length || !subscribers.length) return;

    let sentCount = 0;
    for (const report of reports) {
      const recipients = subscribers.filter(
        (sub) => !sub.branchCode || sub.branchCode === report.branchCode,
      );
      if (!recipients.length) continue;

      const message = this.formatMessage(report, periodLabel);
      await Promise.all(
        recipients.map((sub) => this.telegramService.sendMessage(sub.chatId, message)),
      );
      sentCount += 1;
    }

    this.logger.log(
      `Seller analytics: ${sentCount}/${reports.length} seller report(s) sent for company ${companyId}`,
    );
  }

  private formatMessage(report: SellerAnalyticsReport, periodLabel: string): string {
    const lines: string[] = [
      `📊 <b>Отчёт по продавцу: ${report.sellerName} (${report.shopName})</b>`,
      `Период: ${periodLabel}`,
      '',
      `💰 Продажи: ${report.receiptsCount} чеков · ${fmt(report.totalRevenue)} сум · средний чек ${fmt(report.avgCheck)} сум`,
    ];

    if (report.upsell.length) {
      lines.push('', '🔺 <b>Апсейл — есть куда расти:</b>');
      for (const group of report.upsell) {
        lines.push(
          `${group.groupLabel}: ${pct(group.budgetShare * 100)}% продаж — бюджетные, премиум-аналог почти не предлагается.`,
          `Оценочно недополучено маржи: ~${fmt(group.estimatedLostMargin)} сум за период.`,
        );
      }
    }

    const d = report.discounts;
    if (d.totalReceipts > 0) {
      lines.push(
        '',
        `🏷 Скидки: ${pct(d.discountFrequency * 100)}% чеков со скидкой (среднее по филиалу — ${pct(d.branchDiscountFrequency * 100)}%).`,
        `Средняя скидка: ${pct(d.avgDiscountPct)}% (по филиалу — ${pct(d.branchAvgDiscountPct)}%).`,
      );
      if (d.flaggedFrequency) {
        lines.push('⚠️ Частота скидок выше среднего по филиалу — стоит обсудить.');
      }
      if (d.flaggedNotPayingOff) {
        lines.push('⚠️ Скидки не окупаются: средний чек со скидкой не выше, чем без неё.');
      }
    }

    if (report.topProducts.length) {
      lines.push('', '🏆 <b>Топ товаров:</b>');
      report.topProducts.forEach((p, i) => lines.push(`${i + 1}. ${p.name} — ${fmt(p.qty)} шт`));
    }

    if (report.antiTopProducts.length) {
      lines.push('', `📉 Не продавал за период: ${report.antiTopProducts.map((p) => p.name).join(', ')}`);
    }

    return lines.filter((l) => l !== null && l !== undefined).join('\n');
  }
}
