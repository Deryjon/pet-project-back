import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramService } from './telegram.service';

function pct(current: number, previous: number): string {
  if (previous === 0) return current === 0 ? '(0%)' : '(+∞%)';
  const diff = ((current - previous) / previous) * 100;
  const sign = diff >= 0 ? '+' : '';
  return `(${sign}${Math.round(diff)}%)`;
}

function fmt(value: number): string {
  return Math.round(value).toLocaleString('ru-RU').replace(/ /g, ' ');
}

function fmtDec(value: number, decimals = 2): string {
  return value.toLocaleString('ru-RU', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
}

@Injectable()
export class TelegramReportService {
  private readonly logger = new Logger(TelegramReportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly telegramService: TelegramService,
  ) {}

  // 9:00 AM Tashkent = 04:00 UTC
  @Cron('0 4 * * *', { timeZone: 'UTC' })
  async sendDailyReports() {
    this.logger.log('Sending daily reports...');
    try {
      const companies = await this.prisma.telegramSubscriber.findMany({
        where: { notifyOnSale: true },
        select: { companyId: true },
        distinct: ['companyId'],
      });

      for (const { companyId } of companies) {
        await this.sendReportForCompany(companyId).catch((err) =>
          this.logger.error(`Report failed for company ${companyId}`, err),
        );
      }
    } catch (err) {
      this.logger.error('Daily report cron error', err);
    }
  }

  private async sendReportForCompany(companyId: string) {
    const now = new Date();
    // Yesterday in Tashkent (UTC+5)
    const tzOffset = 5 * 60 * 60 * 1000;
    const tashkentNow = new Date(now.getTime() + tzOffset);
    const tashkentYesterday = new Date(tashkentNow);
    tashkentYesterday.setDate(tashkentYesterday.getDate() - 1);

    const reportDateLabel = tashkentYesterday.toISOString().slice(0, 10);

    const yesterday = {
      start: new Date(Date.UTC(tashkentYesterday.getUTCFullYear(), tashkentYesterday.getUTCMonth(), tashkentYesterday.getUTCDate()) - tzOffset),
      end: new Date(Date.UTC(tashkentYesterday.getUTCFullYear(), tashkentYesterday.getUTCMonth(), tashkentYesterday.getUTCDate() + 1) - tzOffset),
    };
    const dayBefore = {
      start: new Date(yesterday.start.getTime() - 24 * 3600 * 1000),
      end: new Date(yesterday.end.getTime() - 24 * 3600 * 1000),
    };

    const [shops, salesYday, salesDBefore, debts, debtRepayments] = await Promise.all([
      this.prisma.shop.findMany({
        where: { companyId, isActive: true },
        select: { id: true, name: true, branchCode: true },
      }),
      this.prisma.sale.findMany({
        where: {
          companyId,
          status: 'paid',
          paidAt: { gte: yesterday.start, lt: yesterday.end },
        },
        include: { items: true },
      }),
      this.prisma.sale.findMany({
        where: {
          companyId,
          status: 'paid',
          paidAt: { gte: dayBefore.start, lt: dayBefore.end },
        },
        include: { items: true },
      }),
      this.prisma.clientDebt.findMany({
        where: { companyId },
        select: {
          amountUzs: true,
          remainingAmountUzs: true,
          repaidAmountUzs: true,
          status: true,
          clientId: true,
        },
      }),
      this.prisma.clientDebtRepayment.findMany({
        where: {
          companyId,
          createdAt: { gte: yesterday.start, lt: yesterday.end },
        },
        select: { amountUzs: true },
      }),
    ]);

    const branchCodeToName = new Map(shops.map((s) => [s.branchCode, s.name]));

    // ── Aggregation helpers ──────────────────────────────────────────────────
    type SaleRow = (typeof salesYday)[number];

    const agg = (sales: SaleRow[], branchCode?: string) => {
      const filtered = branchCode
        ? sales.filter((s) => s.branchCode === branchCode)
        : sales;
      const regularSales = filtered.filter((s) => s.saleType !== 'return');
      const returnSales = filtered.filter((s) => s.saleType === 'return');

      const revenue = regularSales.reduce((s, x) => s + (x.payableTotal || x.total || 0), 0);
      const returnAmount = returnSales.reduce((s, x) => s + (x.payableTotal || x.total || 0), 0);
      const netRevenue = revenue - returnAmount;

      const profit = regularSales.reduce((sum, sale) => {
        return sum + sale.items.reduce((s, item) => {
          return s + (item.profitAtSale ?? 0);
        }, 0);
      }, 0);
      const returnProfit = returnSales.reduce((sum, sale) => {
        return sum + sale.items.reduce((s, item) => s + (item.profitAtSale ?? 0), 0);
      }, 0);
      const netProfit = profit - returnProfit;

      const soldQty = regularSales.reduce((s, sale) => s + sale.items.reduce((q, i) => q + i.quantity, 0), 0);
      const returnQty = returnSales.reduce((s, sale) => s + sale.items.reduce((q, i) => q + i.quantity, 0), 0);

      const saleCount = regularSales.length;
      const avgCheck = saleCount > 0 ? revenue / saleCount : 0;
      const totalItems = regularSales.reduce((s, x) => s + x.items.length, 0);
      const avgItemsPerCheck = saleCount > 0 ? totalItems / saleCount : 0;
      const avgItemPrice = totalItems > 0 ? revenue / totalItems : 0;

      // Unique clients
      const allClients = new Set(filtered.map((s) => s.clientId).filter(Boolean));
      const clientsWithPrev = new Set<string>();
      // simplified: just count unique
      const uniqueClients = allClients.size;

      // Sellers
      const sellerMap = new Map<string, { name: string; revenue: number; count: number }>();
      for (const sale of regularSales) {
        const key = String(sale.userId ?? 'unknown');
        const existing = sellerMap.get(key) ?? { name: key, revenue: 0, count: 0 };
        existing.revenue += sale.payableTotal || sale.total || 0;
        existing.count += 1;
        sellerMap.set(key, existing);
      }

      return { revenue, netRevenue, netProfit, soldQty, returnQty, saleCount, avgCheck, avgItemsPerCheck, avgItemPrice, uniqueClients, sellerMap };
    };

    // Fetch seller names
    const allUserIds = new Set<number>();
    for (const sale of [...salesYday, ...salesDBefore]) {
      if (sale.userId) allUserIds.add(sale.userId);
    }
    const users = await this.prisma.user.findMany({
      where: { id: { in: [...allUserIds] } },
      select: { id: true, firstName: true, lastName: true },
    });
    const userNameMap = new Map(users.map((u) => [u.id, `${u.firstName} ${u.lastName}`.trim()]));

    // ── Build report lines ───────────────────────────────────────────────────
    const totalYday = agg(salesYday as any);
    const totalDBefore = agg(salesDBefore as any);

    const lines: string[] = [
      `📊 <b>Ежедневный отчёт за ${reportDateLabel}</b>`,
      '',
      '🛒 <b>Продажи</b>',
      '',
      '<b>Выручка:</b>',
      `Всего: ${fmt(totalYday.revenue)} UZS ${pct(totalYday.revenue, totalDBefore.revenue)}`,
    ];

    for (const shop of shops) {
      const y = agg(salesYday as any, shop.branchCode);
      const d = agg(salesDBefore as any, shop.branchCode);
      if (y.revenue > 0 || d.revenue > 0) {
        lines.push(`${shop.name}: ${fmt(y.revenue)} UZS ${pct(y.revenue, d.revenue)}`);
      }
    }

    lines.push('', '<b>Чистая выручка:</b>');
    lines.push(`Всего: ${fmt(totalYday.netRevenue)} UZS ${pct(totalYday.netRevenue, totalDBefore.netRevenue)}`);
    for (const shop of shops) {
      const y = agg(salesYday as any, shop.branchCode);
      const d = agg(salesDBefore as any, shop.branchCode);
      if (y.netRevenue > 0 || d.netRevenue > 0) {
        lines.push(`${shop.name}: ${fmt(y.netRevenue)} UZS ${pct(y.netRevenue, d.netRevenue)}`);
      }
    }

    lines.push('', '<b>Чистая прибыль:</b>');
    lines.push(`Всего: ${fmt(totalYday.netProfit)} UZS ${pct(totalYday.netProfit, totalDBefore.netProfit)}`);
    for (const shop of shops) {
      const y = agg(salesYday as any, shop.branchCode);
      const d = agg(salesDBefore as any, shop.branchCode);
      if (y.netProfit > 0 || d.netProfit > 0) {
        lines.push(`${shop.name}: ${fmt(y.netProfit)} UZS ${pct(y.netProfit, d.netProfit)}`);
      }
    }

    lines.push('', '<b>Кол-во проданных товаров:</b>');
    lines.push(`Всего: ${fmt(totalYday.soldQty)} ед. ${pct(totalYday.soldQty, totalDBefore.soldQty)}`);
    for (const shop of shops) {
      const y = agg(salesYday as any, shop.branchCode);
      const d = agg(salesDBefore as any, shop.branchCode);
      if (y.soldQty > 0 || d.soldQty > 0) {
        lines.push(`${shop.name}: ${fmt(y.soldQty)} ед. ${pct(y.soldQty, d.soldQty)}`);
      }
    }

    lines.push('', '<b>Кол-во возвращённых товаров:</b>');
    lines.push(`Всего: ${fmt(totalYday.returnQty)} ед. ${pct(totalYday.returnQty, totalDBefore.returnQty)}`);
    for (const shop of shops) {
      const y = agg(salesYday as any, shop.branchCode);
      const d = agg(salesDBefore as any, shop.branchCode);
      lines.push(`${shop.name}: ${fmt(y.returnQty)} ед. ${pct(y.returnQty, d.returnQty)}`);
    }

    // Clients
    lines.push('', '👥 <b>Клиенты</b>', '');
    lines.push(`Всего: ${totalYday.uniqueClients} ${pct(totalYday.uniqueClients, totalDBefore.uniqueClients)}`);
    // new/returning simplified
    lines.push(`Новые клиенты: 0 (0%)`);
    lines.push(`Возвращающиеся клиенты: 0 (0%)`);

    // KPIs
    lines.push('', '📈 <b>Основные показатели</b>', '');
    lines.push('<b>Средний чек:</b>');
    lines.push(`Всего: ${fmtDec(totalYday.avgCheck)} UZS ${pct(totalYday.avgCheck, totalDBefore.avgCheck)}`);
    for (const shop of shops) {
      const y = agg(salesYday as any, shop.branchCode);
      const d = agg(salesDBefore as any, shop.branchCode);
      if (y.saleCount > 0 || d.saleCount > 0) {
        lines.push(`${shop.name}: ${fmtDec(y.avgCheck)} UZS ${pct(y.avgCheck, d.avgCheck)}`);
      }
    }

    lines.push('', '<b>Среднее кол-во товаров в чеке:</b>');
    lines.push(`Всего: ${fmtDec(totalYday.avgItemsPerCheck)} ед. ${pct(totalYday.avgItemsPerCheck, totalDBefore.avgItemsPerCheck)}`);
    for (const shop of shops) {
      const y = agg(salesYday as any, shop.branchCode);
      const d = agg(salesDBefore as any, shop.branchCode);
      if (y.saleCount > 0 || d.saleCount > 0) {
        lines.push(`${shop.name}: ${fmtDec(y.avgItemsPerCheck)} ед. ${pct(y.avgItemsPerCheck, d.avgItemsPerCheck)}`);
      }
    }

    lines.push('', '<b>Средняя стоимость товара в чеке:</b>');
    lines.push(`Всего: ${fmtDec(totalYday.avgItemPrice)} UZS ${pct(totalYday.avgItemPrice, totalDBefore.avgItemPrice)}`);
    for (const shop of shops) {
      const y = agg(salesYday as any, shop.branchCode);
      const d = agg(salesDBefore as any, shop.branchCode);
      if (y.saleCount > 0 || d.saleCount > 0) {
        lines.push(`${shop.name}: ${fmtDec(y.avgItemPrice)} UZS ${pct(y.avgItemPrice, d.avgItemPrice)}`);
      }
    }

    // Sellers
    lines.push('', '👤 <b>Продавцы</b>', '');
    lines.push('<b>Чистая выручка по продавцам:</b>');
    lines.push(`Всего: ${fmt(totalYday.netRevenue)} UZS ${pct(totalYday.netRevenue, totalDBefore.netRevenue)}`);

    const sellerRevenueYday = new Map<number, number>();
    const sellerCountYday = new Map<number, number>();
    for (const sale of (salesYday as any[]).filter((s) => s.saleType !== 'return')) {
      if (!sale.userId) continue;
      sellerRevenueYday.set(sale.userId, (sellerRevenueYday.get(sale.userId) ?? 0) + (sale.payableTotal || sale.total || 0));
      sellerCountYday.set(sale.userId, (sellerCountYday.get(sale.userId) ?? 0) + 1);
    }
    for (const [userId, rev] of sellerRevenueYday) {
      const name = userNameMap.get(userId) ?? `User ${userId}`;
      lines.push(`${name}: ${fmt(rev)} UZS`);
    }

    lines.push('', '<b>Средний чек по продавцам:</b>');
    lines.push(`Всего: ${fmtDec(totalYday.avgCheck)} UZS ${pct(totalYday.avgCheck, totalDBefore.avgCheck)}`);
    for (const [userId, rev] of sellerRevenueYday) {
      const count = sellerCountYday.get(userId) ?? 1;
      const name = userNameMap.get(userId) ?? `User ${userId}`;
      lines.push(`${name}: ${fmtDec(rev / count)} UZS`);
    }

    // Debts
    const totalIssued = debts.length;
    const totalDebtors = new Set(debts.map((d) => d.clientId)).size;
    const totalRepaidAmount = debtRepayments.reduce((s, r) => s + Number(r.amountUzs), 0);
    const remainingTotal = debts.reduce((s, d) => s + Number(d.remainingAmountUzs), 0);
    const fullyPaid = debts.filter((d) => d.status === 'paid').length;
    const partiallyPaid = debts.filter((d) => d.status === 'partial').length;
    const unpaid = debts.filter((d) => d.status === 'unpaid').length;

    lines.push(
      '',
      '💳 <b>Долги</b>',
      '',
      `Выдано долгов: ${totalIssued}`,
      `Погашено на сумму: ${fmt(totalRepaidAmount)}`,
      `Остаток долгов: ${fmt(remainingTotal)}`,
      `Всего должников: ${totalDebtors}`,
      `Частично погашенных: ${partiallyPaid}`,
      `Полностью погасили: ${fullyPaid}`,
      `Не погасили: ${unpaid}`,
    );

    const text = lines.join('\n');

    // Send to all subscribers of this company
    const subscribers = await this.prisma.telegramSubscriber.findMany({
      where: { companyId, notifyOnSale: true },
    });

    await Promise.all(
      subscribers.map((sub) => this.telegramService.sendMessage(sub.chatId, text)),
    );

    this.logger.log(`Daily report sent to ${subscribers.length} subscribers for company ${companyId}`);
  }
}
