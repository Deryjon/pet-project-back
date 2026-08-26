import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramService } from './telegram.service';

// ── Formatters ───────────────────────────────────────────────────────────────

function pct(current: number, previous: number): string {
  if (previous === 0) return current === 0 ? '(0%)' : '';
  const diff = ((current - previous) / previous) * 100;
  const sign = diff >= 0 ? '+' : '';
  return `(${sign}${Math.round(diff)}%)`;
}

function fmt(value: number): string {
  return Math.round(value)
    .toLocaleString('ru-RU')
    .replace(/ /g, ' ');
}

function fmtDec(value: number): string {
  return value
    .toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
    .replace(/ /g, ' ');
}

// ── Date helpers (Tashkent UTC+5) ────────────────────────────────────────────

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

// ── Types ────────────────────────────────────────────────────────────────────

type SaleWithItems = {
  saleType: string;
  branchCode: string | null;
  payableTotal: number;
  total: number;
  discountAmount: number;
  discountPercent: number;
  userId: number | null;
  clientId: string | null;
  items: { quantity: number; profitAtSale: number }[];
};

type Agg = {
  revenue: number;
  netRevenue: number;
  netProfit: number;
  soldQty: number;
  returnQty: number;
  saleCount: number;
  avgCheck: number;
  avgItemsPerCheck: number;
  avgItemPrice: number;
  uniqueClients: number;
};

function saleAmountOf(sale: SaleWithItems) {
  return sale.payableTotal !== 0 ||
    sale.total === 0 ||
    sale.discountAmount > 0 ||
    sale.discountPercent > 0
    ? sale.payableTotal
    : sale.total;
}

function aggregate(sales: SaleWithItems[], branchCode?: string): Agg {
  const filtered = branchCode
    ? sales.filter((s) => s.branchCode === branchCode)
    : sales;

  const regular = filtered.filter((s) => s.saleType !== 'return');
  const returns = filtered.filter((s) => s.saleType === 'return');

  const revenue = regular.reduce((sum, sale) => sum + saleAmountOf(sale), 0);
  const returnAmt = returns.reduce((sum, sale) => sum + saleAmountOf(sale), 0);
  const netRevenue = revenue - returnAmt;

  const profit = regular.reduce((s, x) => s + x.items.reduce((a, i) => a + (i.profitAtSale ?? 0), 0), 0);
  const returnProfit = returns.reduce((s, x) => s + x.items.reduce((a, i) => a + (i.profitAtSale ?? 0), 0), 0);
  const netProfit = profit - returnProfit;

  const soldQty = regular.reduce((s, x) => s + x.items.reduce((q, i) => q + i.quantity, 0), 0);
  const returnQty = returns.reduce((s, x) => s + x.items.reduce((q, i) => q + i.quantity, 0), 0);

  const saleCount = regular.length;
  const totalItems = regular.reduce((s, x) => s + x.items.length, 0);
  const avgCheck = saleCount > 0 ? revenue / saleCount : 0;
  const avgItemsPerCheck = saleCount > 0 ? totalItems / saleCount : 0;
  const avgItemPrice = totalItems > 0 ? revenue / totalItems : 0;

  const uniqueClients = new Set(filtered.map((s) => s.clientId).filter(Boolean)).size;

  return { revenue, netRevenue, netProfit, soldQty, returnQty, saleCount, avgCheck, avgItemsPerCheck, avgItemPrice, uniqueClients };
}

// ── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class TelegramReportService {
  private readonly logger = new Logger(TelegramReportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly telegramService: TelegramService,
  ) {}

  // 9:00 Tashkent = 04:00 UTC — daily
  @Cron('0 4 * * *', { timeZone: 'UTC' })
  async sendDailyReports() {
    const today = tashkentToday();
    const yesterday = shiftDays(today, -1);
    const dayBefore = shiftDays(today, -2);

    const period = utcDayBounds(yesterday);
    const prev = utcDayBounds(dayBefore);

    const dateLabel = yesterday.toISOString().slice(0, 10);
    const header = `📊 <b>Ежедневный отчёт за ${dateLabel}</b>`;

    await this.runForAllCompanies(header, period, prev);
  }

  // Every Monday 9:00 Tashkent = 04:00 UTC
  @Cron('0 4 * * 1', { timeZone: 'UTC' })
  async sendWeeklyReports() {
    const today = tashkentToday();

    // Last week: Mon–Sun
    const lastMonday = shiftDays(today, -7);
    const lastSunday = shiftDays(today, -1);
    const prevMonday = shiftDays(today, -14);
    const prevSunday = shiftDays(today, -8);

    const period = {
      start: utcDayBounds(lastMonday).start,
      end: utcDayBounds(lastSunday).end,
    };
    const prev = {
      start: utcDayBounds(prevMonday).start,
      end: utcDayBounds(prevSunday).end,
    };

    const fmt = (d: Date) =>
      d.toLocaleDateString('ru-RU', { timeZone: 'Asia/Tashkent', day: '2-digit', month: '2-digit', year: 'numeric' });

    const header =
      `📅 <b>Еженедельный отчёт</b>\n${fmt(lastMonday)} — ${fmt(lastSunday)}`;

    await this.runForAllCompanies(header, period, prev);
  }

  // 1st day of month 9:00 Tashkent = 04:00 UTC
  @Cron('0 4 1 * *', { timeZone: 'UTC' })
  async sendMonthlyReports() {
    const today = tashkentToday();

    const lastMonth = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1) - TZ_OFFSET_MS);
    const thisMonth = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1) - TZ_OFFSET_MS);
    const prevMonth = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 2, 1) - TZ_OFFSET_MS);

    const period = { start: lastMonth, end: thisMonth };
    const prev = { start: prevMonth, end: lastMonth };

    const monthName = new Date(lastMonth.getTime() + TZ_OFFSET_MS).toLocaleString('ru-RU', {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    });
    const header = `🗓 <b>Ежемесячный отчёт\n${monthName.charAt(0).toUpperCase() + monthName.slice(1)}</b>`;

    await this.runForAllCompanies(header, period, prev);
  }

  // ── Core ────────────────────────────────────────────────────────────────────

  private async runForAllCompanies(
    header: string,
    period: { start: Date; end: Date },
    prev: { start: Date; end: Date },
  ) {
    const companies = await this.prisma.telegramSubscriber.findMany({
      where: { notifyOnSale: true },
      select: { companyId: true },
      distinct: ['companyId'],
    });

    for (const { companyId } of companies) {
      await this.sendReport(companyId, header, period, prev).catch((err) =>
        this.logger.error(`Report failed for company ${companyId}`, err),
      );
    }
  }

  private async sendReport(
    companyId: string,
    header: string,
    period: { start: Date; end: Date },
    prev: { start: Date; end: Date },
  ) {
    const [shops, salesCur, salesPrev, debts, debtRepayments] = await Promise.all([
      this.prisma.shop.findMany({
        where: { companyId, isActive: true },
        select: { name: true, branchCode: true },
      }),
      this.fetchSales(companyId, period.start, period.end),
      this.fetchSales(companyId, prev.start, prev.end),
      this.prisma.clientDebt.findMany({
        where: { companyId },
        select: { amountUzs: true, remainingAmountUzs: true, repaidAmountUzs: true, status: true, clientId: true },
      }),
      this.prisma.clientDebtRepayment.findMany({
        where: { companyId, createdAt: { gte: period.start, lt: period.end } },
        select: { amountUzs: true },
      }),
    ]);

    const totCur = aggregate(salesCur);
    const totPrev = aggregate(salesPrev);

    // Seller names
    const allUserIds = new Set<number>();
    for (const s of [...salesCur, ...salesPrev]) {
      if (s.userId) allUserIds.add(s.userId);
    }
    const users = await this.prisma.user.findMany({
      where: { id: { in: [...allUserIds] } },
      select: { id: true, firstName: true, lastName: true },
    });
    const userNames = new Map(users.map((u) => [u.id, `${u.firstName} ${u.lastName}`.trim()]));

    const lines: string[] = [header, ''];

    // ── Sales ─────────────────────────────────────────────────────────────────
    lines.push('🛒 <b>Продажи</b>', '');

    const shopSection = (
      label: string,
      getCur: (a: Agg) => number,
      getPrev: (a: Agg) => number,
      unit = 'UZS',
    ) => {
      lines.push(`<b>${label}:</b>`);
      lines.push(`Всего: ${fmtDec(getCur(totCur))} ${unit} ${pct(getCur(totCur), getPrev(totPrev))}`);
      for (const shop of shops) {
        const c = aggregate(salesCur, shop.branchCode);
        const p = aggregate(salesPrev, shop.branchCode);
        if (getCur(c) > 0 || getPrev(p) > 0) {
          lines.push(`${shop.name}: ${fmtDec(getCur(c))} ${unit} ${pct(getCur(c), getPrev(p))}`);
        }
      }
      lines.push('');
    };

    shopSection('Выручка', (a) => a.revenue, (a) => a.revenue);
    shopSection('Чистая выручка', (a) => a.netRevenue, (a) => a.netRevenue);
    shopSection('Чистая прибыль', (a) => a.netProfit, (a) => a.netProfit);
    shopSection('Кол-во проданных товаров', (a) => a.soldQty, (a) => a.soldQty, 'ед.');
    shopSection('Кол-во возвращённых товаров', (a) => a.returnQty, (a) => a.returnQty, 'ед.');

    // ── Clients ───────────────────────────────────────────────────────────────
    lines.push('👥 <b>Клиенты</b>', '');
    lines.push(`Всего: ${totCur.uniqueClients} ${pct(totCur.uniqueClients, totPrev.uniqueClients)}`);
    lines.push(`Новые клиенты: 0 (0%)`);
    lines.push(`Возвращающиеся клиенты: 0 (0%)`);
    lines.push('');

    // ── KPIs ──────────────────────────────────────────────────────────────────
    lines.push('📈 <b>Основные показатели бренда</b>', '');
    shopSection('Средний чек', (a) => a.avgCheck, (a) => a.avgCheck);
    shopSection('Среднее кол-во товаров в чеке', (a) => a.avgItemsPerCheck, (a) => a.avgItemsPerCheck, 'ед.');
    shopSection('Средняя стоимость товара в чеке', (a) => a.avgItemPrice, (a) => a.avgItemPrice);

    // ── Sellers ───────────────────────────────────────────────────────────────
    lines.push('👤 <b>Продавцы</b>', '');

    const sellerRevCur = new Map<number, number>();
    const sellerCntCur = new Map<number, number>();
    const sellerRevPrev = new Map<number, number>();

    for (const s of salesCur.filter((x) => x.saleType !== 'return')) {
      if (!s.userId) continue;
      sellerRevCur.set(s.userId, (sellerRevCur.get(s.userId) ?? 0) + saleAmountOf(s));
      sellerCntCur.set(s.userId, (sellerCntCur.get(s.userId) ?? 0) + 1);
    }
    for (const s of salesPrev.filter((x) => x.saleType !== 'return')) {
      if (!s.userId) continue;
      sellerRevPrev.set(s.userId, (sellerRevPrev.get(s.userId) ?? 0) + saleAmountOf(s));
    }

    lines.push('<b>Чистая выручка по продавцам:</b>');
    lines.push(`Всего: ${fmt(totCur.netRevenue)} UZS ${pct(totCur.netRevenue, totPrev.netRevenue)}`);
    for (const [uid, rev] of sellerRevCur) {
      const name = userNames.get(uid) ?? `User ${uid}`;
      const prevRev = sellerRevPrev.get(uid) ?? 0;
      lines.push(`${name}: ${fmt(rev)} UZS ${pct(rev, prevRev)}`);
    }

    lines.push('');
    lines.push('<b>Средний чек по продавцам:</b>');
    lines.push(`Всего: ${fmtDec(totCur.avgCheck)} UZS ${pct(totCur.avgCheck, totPrev.avgCheck)}`);
    for (const [uid, rev] of sellerRevCur) {
      const cnt = sellerCntCur.get(uid) ?? 1;
      const name = userNames.get(uid) ?? `User ${uid}`;
      lines.push(`${name}: ${fmtDec(rev / cnt)} UZS`);
    }
    lines.push('');

    // ── Debts ─────────────────────────────────────────────────────────────────
    const totalRepaid = debtRepayments.reduce((s, r) => s + Number(r.amountUzs), 0);
    const remaining = debts.reduce((s, d) => s + Number(d.remainingAmountUzs), 0);
    const debtors = new Set(debts.map((d) => d.clientId)).size;
    const fullyPaid = debts.filter((d) => d.status === 'paid').length;
    const partial = debts.filter((d) => d.status === 'partial').length;
    const unpaid = debts.filter((d) => d.status === 'unpaid').length;

    lines.push(
      '💳 <b>Долги</b>', '',
      `Выдано долгов: ${debts.length}`,
      `Погашено на сумму: ${fmt(totalRepaid)}`,
      `Остаток долгов: ${fmt(remaining)}`,
      `Всего должников: ${debtors}`,
      `Частично погашенных: ${partial}`,
      `Полностью погасили: ${fullyPaid}`,
      `Не погасили: ${unpaid}`,
    );

    const text = lines.join('\n');

    const subscribers = await this.prisma.telegramSubscriber.findMany({
      where: { companyId, notifyOnSale: true },
    });

    await Promise.all(subscribers.map((s) => this.telegramService.sendMessage(s.chatId, text)));
    this.logger.log(`Report sent to ${subscribers.length} subscribers for company ${companyId}`);
  }

  private async fetchSales(
    companyId: string,
    start: Date,
    end: Date,
  ): Promise<SaleWithItems[]> {
    const sales = await this.prisma.sale.findMany({
      where: {
        companyId,
        status: {
          in: [
            'paid',
            'returned',
            'partially_returned',
            'exchanged',
            'partially_exchanged',
          ],
        },
        paidAt: { gte: start, lt: end },
      },
      select: {
        saleType: true,
        branchCode: true,
        payableTotal: true,
        total: true,
        discountAmount: true,
        discountPercent: true,
        userId: true,
        clientId: true,
        items: { select: { quantity: true, profitAtSale: true } },
      },
    });

    return sales.map((sale) => ({
      saleType: sale.saleType,
      branchCode: sale.branchCode,
      payableTotal: Number(sale.payableTotal),
      total: Number(sale.total),
      discountAmount: Number(sale.discountAmount),
      discountPercent: Number(sale.discountPercent),
      userId: sale.userId,
      clientId: sale.clientId,
      items: sale.items.map((item) => ({
        quantity: Number(item.quantity),
        profitAtSale: Number(item.profitAtSale),
      })),
    }));
  }
}
