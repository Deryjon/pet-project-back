import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';

function randomToken(length = 8): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);
  private get token() { return process.env.TELEGRAM_BOT_TOKEN ?? ''; }
  private get botUsername() { return process.env.TELEGRAM_BOT_USERNAME ?? ''; }
  private get apiBase() { return `https://api.telegram.org/bot${this.token}`; }

  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
  ) {}

  async sendMessage(chatId: string, text: string): Promise<void> {
    try {
      const res = await fetch(`${this.apiBase}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
      });
      if (!res.ok) {
        const body = await res.text();
        this.logger.warn(`Telegram sendMessage failed: ${res.status} ${body}`);
      }
    } catch (err) {
      this.logger.error('Telegram sendMessage error', err);
    }
  }

  async generateLinkToken(authorization: string): Promise<{ link: string }> {
    const context = await this.usersService.getRequestContext(authorization);
    if (!context?.userId || !context?.companyId) {
      throw new ForbiddenException('Требуется авторизация');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: Number(context.userId) },
      include: { crmRole: true },
    });

    if (!user) throw new NotFoundException('Пользователь не найден');

    const isAdminOrManager =
      user.crmRole?.isAdmin === true ||
      user.userType === 'platform' ||
      user.platformRole === 'admin';

    if (!isAdminOrManager) {
      throw new ForbiddenException(
        'Только владельцы и менеджеры могут подписаться на уведомления',
      );
    }

    const token = randomToken(12);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    await this.prisma.telegramLinkToken.create({
      data: {
        token,
        userId: user.id,
        companyId: context.companyId,
        expiresAt,
      },
    });

    return { link: `https://t.me/${this.botUsername}?start=${token}` };
  }

  async handleUpdate(update: Record<string, any>): Promise<void> {
    const message = update?.message ?? update?.edited_message;
    if (!message) return;

    const chatId = String(message?.chat?.id ?? '');
    const text: string = message?.text ?? '';

    if (!chatId || !text.startsWith('/start')) return;

    const parts = text.trim().split(' ');
    const token = parts[1]?.trim();

    if (!token) {
      await this.sendMessage(
        chatId,
        '👋 Привет! Чтобы подключить уведомления, перейдите по ссылке из CRM Konkurent.',
      );
      return;
    }

    const linkToken = await this.prisma.telegramLinkToken.findUnique({
      where: { token },
    });

    if (!linkToken || linkToken.usedAt || linkToken.expiresAt < new Date()) {
      await this.sendMessage(
        chatId,
        '❌ Ссылка недействительна или устарела. Запросите новую в CRM.',
      );
      return;
    }

    const user = await this.prisma.user.findUnique({
      where: { id: linkToken.userId },
    });

    await this.prisma.$transaction([
      this.prisma.telegramLinkToken.update({
        where: { id: linkToken.id },
        data: { usedAt: new Date() },
      }),
      this.prisma.telegramSubscriber.upsert({
        where: { userId: linkToken.userId },
        create: {
          chatId,
          userId: linkToken.userId,
          companyId: linkToken.companyId,
          notifyOnSale: true,
        },
        update: { chatId, notifyOnSale: true },
      }),
    ]);

    const userName = user
      ? `${user.firstName} ${user.lastName}`.trim()
      : 'Сотрудник';

    await this.sendMessage(
      chatId,
      `✅ Уведомления подключены!\n👤 Сотрудник: ${userName}`,
    );
  }

  async notifySale(sale: {
    id: number;
    number: string;
    companyId: string | null;
    branchCode: string | null;
    payableTotal: number;
    total: number;
    userId: number | null;
    paymentMethod: string | null;
    extraPayments: any;
    paidAt: Date | null;
  }): Promise<void> {
    if (!sale.companyId) return;

    try {
      const subscribers = await this.prisma.telegramSubscriber.findMany({
        where: {
          companyId: sale.companyId,
          notifyOnSale: true,
          OR: [
            { branchCode: sale.branchCode ?? undefined },
            { branchCode: null },
          ],
        },
      });

      if (!subscribers.length) return;

      // Fetch all needed data in parallel
      const [seller, shop, items, paymentTypes] = await Promise.all([
        sale.userId
          ? this.prisma.user.findUnique({
              where: { id: sale.userId },
              select: { firstName: true, lastName: true },
            })
          : null,
        sale.branchCode
          ? this.prisma.shop.findFirst({
              where: { companyId: sale.companyId, branchCode: sale.branchCode },
              select: { name: true },
            })
          : null,
        this.prisma.saleItem.findMany({
          where: { saleId: sale.id },
          select: {
            name: true,
            barcode: true,
            sku: true,
            quantity: true,
            salePrice: true,
            lineTotal: true,
            discountAmount: true,
          },
        }),
        this.prisma.paymentType.findMany({
          where: { companyId: sale.companyId },
          select: { id: true, name: true, isCash: true },
        }),
      ]);

      const paymentTypeMap = new Map(paymentTypes.map((p) => [p.id, p]));

      const sellerName = seller
        ? `${seller.firstName} ${seller.lastName}`.trim()
        : '';
      const shopName = shop?.name ?? sale.branchCode ?? '';
      const amount = sale.payableTotal || sale.total || 0;
      const paidAt = sale.paidAt ?? new Date();

      // Date formatting
      const dateStr = paidAt.toLocaleDateString('ru-RU', {
        timeZone: 'Asia/Tashkent',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
      const timeStr = paidAt.toLocaleTimeString('ru-RU', {
        timeZone: 'Asia/Tashkent',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });

      // Payment breakdown
      const extraPayments = Array.isArray(sale.extraPayments)
        ? (sale.extraPayments as Array<{ payment_method: string; amount: number }>)
        : null;

      const paymentLines: string[] = [];
      if (extraPayments && extraPayments.length > 1) {
        for (const p of extraPayments) {
          const pt = paymentTypeMap.get(p.payment_method);
          const label = pt
            ? `${pt.isCash ? '💵' : '💳'} ${pt.name}`
            : `💳 ${p.payment_method}`;
          paymentLines.push(`${label}: ${this.fmt(p.amount)} UZS`);
        }
      } else {
        const pt = sale.paymentMethod
          ? paymentTypeMap.get(sale.paymentMethod)
          : null;
        const label = pt
          ? `${pt.isCash ? '💵' : '💳'} ${pt.name}`
          : '💳 Оплата';
        paymentLines.push(`${label}: ${this.fmt(amount)} UZS`);
      }

      // Items
      const itemLines = items.map((item, i) => {
        const lineTotal = item.lineTotal ?? item.salePrice * item.quantity;
        const originalTotal = item.salePrice * item.quantity;
        const discount = item.discountAmount ?? 0;
        const discountPct =
          discount > 0 && originalTotal > 0
            ? ((discount / originalTotal) * 100).toFixed(2)
            : null;

        let line = `${i + 1}. ${item.name}`;
        if (item.barcode) line += ` / ${item.barcode}`;
        if (item.sku) line += ` / Арт: ${item.sku}`;
        line += ` / ${item.quantity} шт x ${this.fmt(item.salePrice)} UZS`;
        line += ` / (Сумма: ${this.fmt(lineTotal)} UZS)`;
        if (discountPct) line += `, (скидка ${discountPct} %)`;
        return line;
      });

      const lines: string[] = [
        `Продажа #${sale.number}`,
        `${dateStr} ${timeStr}`,
        '',
        shopName ? `🛒 Магазин: ${shopName}` : '',
        '',
        '💸 Детали:',
        sellerName ? `Продавец: ${sellerName}` : '',
        `Сумма транзакции: ${this.fmt(amount)} UZS`,
        ...paymentLines,
        `Кол-во товаров: ${items.length}`,
      ];

      if (itemLines.length) {
        lines.push('', '📦 Товары:');
        lines.push(...itemLines);
      }

      const text = lines.filter((l) => l !== null && l !== undefined).join('\n');

      await Promise.all(
        subscribers.map((sub) => this.sendMessage(sub.chatId, text)),
      );
    } catch (err) {
      this.logger.error('notifySale error', err);
    }
  }

  private fmt(value: number): string {
    return Math.round(value)
      .toLocaleString('ru-RU')
      .replace(/\s/g, ' ');
  }

  async getSubscribers(authorization: string) {
    const context = await this.usersService.getRequestContext(authorization);
    if (!context?.companyId) throw new ForbiddenException('Требуется авторизация');

    const subscribers = await this.prisma.telegramSubscriber.findMany({
      where: { companyId: context.companyId },
      include: { user: { select: { id: true, firstName: true, lastName: true } } },
      orderBy: { linkedAt: 'desc' },
    });

    return subscribers.map((s) => ({
      id: s.id,
      chatId: s.chatId,
      userId: s.userId,
      userName: s.user
        ? `${s.user.firstName} ${s.user.lastName}`.trim()
        : '',
      notifyOnSale: s.notifyOnSale,
      branchCode: s.branchCode,
      linkedAt: s.linkedAt,
    }));
  }

  async updateSubscriber(
    id: string,
    body: { notifyOnSale?: boolean; branchCode?: string | null },
    authorization: string,
  ) {
    const context = await this.usersService.getRequestContext(authorization);
    if (!context?.companyId) throw new ForbiddenException('Требуется авторизация');

    const sub = await this.prisma.telegramSubscriber.findFirst({
      where: { id, companyId: context.companyId },
    });
    if (!sub) throw new NotFoundException('Подписчик не найден');

    return this.prisma.telegramSubscriber.update({
      where: { id },
      data: {
        ...(body.notifyOnSale !== undefined && { notifyOnSale: body.notifyOnSale }),
        ...(body.branchCode !== undefined && { branchCode: body.branchCode }),
      },
    });
  }

  async deleteSubscriber(id: string, authorization: string) {
    const context = await this.usersService.getRequestContext(authorization);
    if (!context?.companyId) throw new ForbiddenException('Требуется авторизация');

    const sub = await this.prisma.telegramSubscriber.findFirst({
      where: { id, companyId: context.companyId },
    });
    if (!sub) throw new NotFoundException('Подписчик не найден');

    await this.prisma.telegramSubscriber.delete({ where: { id } });
    return { success: true };
  }
}
