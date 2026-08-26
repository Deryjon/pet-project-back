import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { UAParser } from 'ua-parser-js';
import { PlatformService } from '../platform/platform.service';
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
    private readonly platformService: PlatformService,
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
    payableTotal: Prisma.Decimal | number;
    total: Prisma.Decimal | number;
    discountAmount: Prisma.Decimal | number;
    discountPercent: Prisma.Decimal | number;
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
            retailPriceAtSale: true,
            finalPrice: true,
            discountAmount: true,
          },
        }),
        this.prisma.companyPaymentType.findMany({
          where: { companyId: sale.companyId },
          select: { id: true, name: true, isCashPaymentType: true },
        }),
      ]);

      const paymentTypeMap = new Map(paymentTypes.map((p) => [p.id, p]));

      const findPaymentType = (methodId: string | null | undefined) => {
        if (!methodId) return null;
        const pt = paymentTypeMap.get(methodId);
        if (pt) return pt;
        const lower = methodId.toLowerCase();
        if (lower === 'cash') return paymentTypes.find((p) => p.isCashPaymentType) ?? null;
        return paymentTypes.find((p) => p.name.toLowerCase() === lower) ?? null;
      };

      const sellerName = seller
        ? `${seller.firstName} ${seller.lastName}`.trim()
        : '';
      const shopName = shop?.name ?? sale.branchCode ?? '';
      const payableTotal = Number(sale.payableTotal ?? 0);
      const total = Number(sale.total ?? 0);
      const amount =
        payableTotal !== 0 ||
        total === 0 ||
        Number(sale.discountAmount ?? 0) > 0 ||
        Number(sale.discountPercent ?? 0) > 0
          ? payableTotal
          : total;
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
      if (extraPayments && extraPayments.length > 0) {
        for (const p of extraPayments) {
          const pt = findPaymentType(p.payment_method);
          const label = pt
            ? `${pt.isCashPaymentType ? '💵' : '💳'} ${pt.name}`
            : '💳 Оплата';
          paymentLines.push(`${label}: ${this.fmt(p.amount)} UZS`);
        }
      } else {
        const pt = findPaymentType(sale.paymentMethod);
        const label = pt
          ? `${pt.isCashPaymentType ? '💵' : '💳'} ${pt.name}`
          : '💳 Оплата';
        paymentLines.push(`${label}: ${this.fmt(amount)} UZS`);
      }

      // Items
      const itemLines = items.map((item, i) => {
        const quantity = Number(item.quantity);
        const salePrice = Number(item.salePrice);
        const originalTotal =
          Number(item.retailPriceAtSale) || Number(item.lineTotal) || salePrice * quantity;
        const finalPrice = Number(item.finalPrice ?? 0);
        const hasFinalizedSnapshot =
          Number(item.retailPriceAtSale ?? 0) > 0 ||
          Number(item.discountAmount ?? 0) > 0 ||
          finalPrice > 0;
        const finalTotal = hasFinalizedSnapshot ? finalPrice : originalTotal;
        const discountPct =
          originalTotal > 0 && finalTotal < originalTotal
            ? (((originalTotal - finalTotal) / originalTotal) * 100).toFixed(2)
            : null;

        let line = `${i + 1}. ${item.name}`;
        if (item.barcode) line += ` / ${item.barcode}`;
        if (item.sku) line += ` / Арт: ${item.sku}`;
        line += ` / ${quantity} шт x ${this.fmt(salePrice)} UZS`;
        line += ` / (Сумма: ${this.fmt(finalTotal)} UZS)`;
        if (discountPct) {
          const isLast = i === items.length - 1;
          line += `, (скидка ${discountPct} %)${isLast ? '' : ','}`;
        }
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
        for (let j = 0; j < itemLines.length; j++) {
          lines.push(itemLines[j]);
          if (j < itemLines.length - 1) lines.push('');
        }
      }

      const text = lines.filter((l) => l !== null && l !== undefined).join('\n');

      await Promise.all(
        subscribers.map((sub) => this.sendMessage(sub.chatId, text)),
      );
    } catch (err) {
      this.logger.error('notifySale error', err);
    }
  }

  async getLowStockThresholdSettings(): Promise<{
    enabled: boolean;
    threshold: number;
  }> {
    const settings = await this.platformService.getNotificationSettings();
    return {
      enabled: settings.enabled && settings.lowStockThreshold,
      threshold: Number(settings.lowStockThresholdValue) || 0,
    };
  }

  async notifyLowStock(args: {
    companyId: string;
    branchCode: string | null;
    productName: string;
    sku: string | null;
    barcode: string | null;
    quantity: number;
    threshold: number;
  }): Promise<void> {
    try {
      const subscribers = await this.prisma.telegramSubscriber.findMany({
        where: {
          companyId: args.companyId,
          notifyOnLowStock: true,
          OR: [{ branchCode: args.branchCode ?? undefined }, { branchCode: null }],
        },
      });

      if (!subscribers.length) return;

      const lines = [
        '⚠️ <b>Низкий остаток товара</b>',
        '',
        `Товар: ${args.productName}`,
        ...(args.sku ? [`Арт: ${args.sku}`] : []),
        ...(args.barcode ? [`Штрихкод: ${args.barcode}`] : []),
        `Остаток: ${this.fmt(args.quantity)} (порог: ${this.fmt(args.threshold)})`,
      ];

      const text = lines.join('\n');

      await Promise.all(
        subscribers.map((sub) => this.sendMessage(sub.chatId, text)),
      );
    } catch (err) {
      this.logger.error('notifyLowStock error', err);
    }
  }

  async notifyLogin(
    user: {
      firstName: string;
      lastName: string;
      phoneNumber: string;
      companyId: string | null;
    },
    ip: string,
    userAgent: string,
  ): Promise<void> {
    if (!user.companyId) return;

    try {
      const subscribers = await this.prisma.telegramSubscriber.findMany({
        where: {
          companyId: user.companyId,
          notifyOnLogin: true,
        },
      });

      if (!subscribers.length) return;

      const parsed = new UAParser(userAgent || '').getResult();
      const osLabel = [parsed.os.name, parsed.os.version].filter(Boolean).join(' ') || 'Неизвестно';
      const browserLabel =
        [parsed.browser.name, parsed.browser.version].filter(Boolean).join(' ') || 'Неизвестно';

      const now = new Date();
      const tashkentNow = new Date(now.getTime() + 5 * 60 * 60 * 1000);
      const dateTimeStr = tashkentNow.toISOString().slice(0, 19).replace('T', ' ');

      const userName = `${user.firstName} ${user.lastName}`.trim();
      const text = [
        'В систему был осуществлён вход:',
        `👤 Пользователь: ${userName}`,
        `📱 Номер телефона: ${user.phoneNumber}`,
        `🗓 Дата и время входа: ${dateTimeStr}`,
        `🖥 Устройство: ${osLabel} (${browserLabel})`,
        `🌍 IP адрес: ${ip || 'Неизвестно'}`,
      ].join('\n');

      await Promise.all(
        subscribers.map((sub) => this.sendMessage(sub.chatId, text)),
      );
    } catch (err) {
      this.logger.error('notifyLogin error', err);
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
      notifySellerAnalytics: s.notifySellerAnalytics,
      notifyOnLogin: s.notifyOnLogin,
      notifyOnLowStock: s.notifyOnLowStock,
      branchCode: s.branchCode,
      linkedAt: s.linkedAt,
    }));
  }

  async updateSubscriber(
    id: string,
    body: {
      notifyOnSale?: boolean;
      notifySellerAnalytics?: boolean;
      notifyOnLogin?: boolean;
      notifyOnLowStock?: boolean;
      branchCode?: string | null;
    },
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
        ...(body.notifySellerAnalytics !== undefined && {
          notifySellerAnalytics: body.notifySellerAnalytics,
        }),
        ...(body.notifyOnLogin !== undefined && {
          notifyOnLogin: body.notifyOnLogin,
        }),
        ...(body.notifyOnLowStock !== undefined && {
          notifyOnLowStock: body.notifyOnLowStock,
        }),
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
