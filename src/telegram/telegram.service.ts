import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { UAParser } from 'ua-parser-js';
import {
  CompanyRequestContext,
  requireCompanyContext,
} from '../auth/request-context';
import { PlatformService } from '../platform/platform.service';
import {
  LOYALTY_CASHBACK_PAYMENT_METHOD,
  loadLoyaltyProgramType,
  loyaltyPaymentName,
} from '../common/loyalty-payment';
import { PrismaService } from '../prisma/prisma.service';

function randomToken(length = 8): string {
  const chars =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

@Injectable()
export class TelegramService implements OnApplicationBootstrap {
  private readonly logger = new Logger(TelegramService.name);
  private get token() {
    return (process.env.TELEGRAM_BOT_TOKEN ?? '').trim();
  }
  private get botUsername() {
    // "@konkurent_bot" and "https://t.me/konkurent_bot" both mean konkurent_bot.
    return (process.env.TELEGRAM_BOT_USERNAME ?? '')
      .trim()
      .replace(/^https?:\/\/t\.me\//i, '')
      .replace(/^@/, '');
  }
  private get webhookSecret() {
    return (process.env.TELEGRAM_WEBHOOK_SECRET ?? '').trim();
  }
  /** Public URL Telegram must call; the API runs under the global /api prefix. */
  get expectedWebhookUrl() {
    const base = (process.env.TELEGRAM_WEBHOOK_URL ?? '').trim();
    if (base) return base;
    const appUrl = (process.env.APP_URL ?? '').trim().replace(/\/+$/, '');
    return appUrl ? `${appUrl}/api/telegram/webhook` : '';
  }

  /**
   * Registers the webhook with the secret the controller checks. Done on every
   * start, so a changed secret, domain or a webhook set by hand without
   * secret_token cannot silently turn every update into a 401.
   */
  async onApplicationBootstrap() {
    if (process.env.NODE_ENV === 'test') return;
    if (!this.token || !this.webhookSecret) return;
    const url = this.expectedWebhookUrl;
    if (!url.startsWith('https://')) {
      this.logger.warn(
        `Telegram webhook not registered: ${url || 'APP_URL is not set'} is not a public https URL`,
      );
      return;
    }
    try {
      const res = await fetch(`${this.apiBase}/setWebhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url,
          secret_token: this.webhookSecret,
          allowed_updates: ['message'],
        }),
      });
      const body: any = await res.json().catch(() => null);
      if (!body?.ok) {
        this.logger.error(`Telegram setWebhook failed: ${body?.description ?? res.status}`);
      } else {
        this.logger.log(`Telegram webhook registered: ${url}`);
      }
    } catch (err) {
      this.logger.error('Telegram setWebhook error', err);
    }
  }

  /** Diagnostics for the notifications page: why linking may not work. */
  async getStatus() {
    const problems: string[] = [];
    if (!this.token) problems.push('На сервере не задан TELEGRAM_BOT_TOKEN — бот не может отвечать.');
    if (!this.botUsername) problems.push('На сервере не задан TELEGRAM_BOT_USERNAME — ссылка на бота не строится.');
    if (!this.webhookSecret) problems.push('На сервере не задан TELEGRAM_WEBHOOK_SECRET — сервер отклоняет все сообщения бота.');
    const expectedUrl = this.expectedWebhookUrl;
    if (!expectedUrl.startsWith('https://')) {
      problems.push('APP_URL должен быть публичным https-адресом API — иначе Telegram не может достучаться до сервера.');
    }

    let bot: { username: string } | null = null;
    let webhook: {
      url: string;
      pendingUpdates: number;
      lastError: string | null;
      lastErrorAt: string | null;
    } | null = null;
    if (this.token) {
      try {
        const [me, info]: any[] = await Promise.all([
          fetch(`${this.apiBase}/getMe`).then((res) => res.json()),
          fetch(`${this.apiBase}/getWebhookInfo`).then((res) => res.json()),
        ]);
        if (!me?.ok) {
          problems.push('Telegram не принимает TELEGRAM_BOT_TOKEN — токен неверный или бот удалён.');
        } else {
          bot = { username: String(me.result?.username ?? '') };
          if (this.botUsername && bot.username.toLowerCase() !== this.botUsername.toLowerCase()) {
            problems.push(
              `TELEGRAM_BOT_USERNAME (${this.botUsername}) не совпадает с ботом токена (@${bot.username}) — ссылка ведёт не в тот бот.`,
            );
          }
        }
        if (info?.ok) {
          const result = info.result ?? {};
          webhook = {
            url: String(result.url ?? ''),
            pendingUpdates: Number(result.pending_update_count ?? 0),
            lastError: result.last_error_message ? String(result.last_error_message) : null,
            lastErrorAt: result.last_error_date
              ? new Date(Number(result.last_error_date) * 1000).toISOString()
              : null,
          };
          if (!webhook.url) {
            problems.push('Вебхук бота не зарегистрирован — сообщения боту не доходят до сервера.');
          } else if (expectedUrl && webhook.url !== expectedUrl) {
            problems.push(`Вебхук указывает на ${webhook.url}, а должен на ${expectedUrl}.`);
          }
          if (webhook.lastError) {
            problems.push(`Последняя ошибка доставки от Telegram: ${webhook.lastError}.`);
          }
        }
      } catch {
        problems.push('Сервер не может связаться с api.telegram.org.');
      }
    }

    return {
      ok: problems.length === 0,
      bot_username: bot?.username ?? (this.botUsername || null),
      expected_webhook_url: expectedUrl || null,
      webhook,
      problems,
    };
  }

  /** Re-registers the webhook on demand (button on the notifications page). */
  async repairWebhook() {
    await this.onApplicationBootstrap();
    return this.getStatus();
  }
  private get apiBase() {
    return `https://api.telegram.org/bot${this.token}`;
  }

  constructor(
    private readonly prisma: PrismaService,
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

  async generateLinkToken(
    requestContext: CompanyRequestContext,
  ): Promise<{ link: string }> {
    const context = await requireCompanyContext(requestContext);

    if (!this.token || !this.botUsername) {
      throw new BadRequestException(
        'Telegram-бот не настроен на сервере (TELEGRAM_BOT_TOKEN / TELEGRAM_BOT_USERNAME)',
      );
    }

    // Who may subscribe is decided by the "telegram-notification" permission
    // (checked by the guard); an extra admin-only check here also locked out
    // the managers the role was given to.
    const user = await this.prisma.user.findUnique({
      where: { id: Number(context.userId) },
    });

    if (!user) throw new NotFoundException('Пользователь не найден');

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
    const text: string = String(message?.text ?? '').trim();

    if (!chatId || !/^\/start(@\w+)?(\s|$)/i.test(text)) return;

    // Any error is answered in the chat and swallowed: a failed webhook makes
    // Telegram resend the same update again and again.
    try {
      await this.linkChat(chatId, text.split(/\s+/)[1]?.trim());
    } catch (err) {
      this.logger.error('Telegram link failed', err);
      await this.sendMessage(
        chatId,
        '⚠️ Не удалось подключить уведомления. Запросите новую ссылку в CRM и попробуйте ещё раз.',
      );
    }
  }

  private async linkChat(chatId: string, token: string | undefined) {
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
      // One Telegram chat belongs to one employee (chatId is unique): linking
      // it again moves the chat over instead of failing on the constraint.
      this.prisma.telegramSubscriber.deleteMany({
        where: { chatId, userId: { not: linkToken.userId } },
      }),
      this.prisma.telegramSubscriber.upsert({
        where: { userId: linkToken.userId },
        create: {
          chatId,
          userId: linkToken.userId,
          companyId: linkToken.companyId,
          notifyOnSale: true,
        },
        update: { chatId, companyId: linkToken.companyId, notifyOnSale: true },
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
        if (lower === 'cash')
          return paymentTypes.find((p) => p.isCashPaymentType) ?? null;
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
        ? (sale.extraPayments as Array<{
            payment_method: string;
            amount: number;
          }>)
        : null;

      const paymentLines: string[] = [];
      if (extraPayments && extraPayments.length > 0) {
        const loyaltyName = loyaltyPaymentName(
          await loadLoyaltyProgramType(this.prisma, sale.companyId),
        );
        for (const p of extraPayments) {
          if (p.payment_method === LOYALTY_CASHBACK_PAYMENT_METHOD) {
            paymentLines.push(
              `🎁 ${loyaltyName}: ${this.fmt(p.amount)} UZS`,
            );
            continue;
          }
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
          Number(item.retailPriceAtSale) ||
          Number(item.lineTotal) ||
          salePrice * quantity;
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

      const text = lines
        .filter((l) => l !== null && l !== undefined)
        .join('\n');

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
          OR: [
            { branchCode: args.branchCode ?? undefined },
            { branchCode: null },
          ],
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
      const osLabel =
        [parsed.os.name, parsed.os.version].filter(Boolean).join(' ') ||
        'Неизвестно';
      const browserLabel =
        [parsed.browser.name, parsed.browser.version]
          .filter(Boolean)
          .join(' ') || 'Неизвестно';

      const now = new Date();
      const tashkentNow = new Date(now.getTime() + 5 * 60 * 60 * 1000);
      const dateTimeStr = tashkentNow
        .toISOString()
        .slice(0, 19)
        .replace('T', ' ');

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

  /** Text goes out with parse_mode HTML: names and reasons must not break it. */
  private escapeHtml(value: unknown): string {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  private formatTashkentDateTime(date: Date) {
    const day = date.toLocaleDateString('ru-RU', {
      timeZone: 'Asia/Tashkent',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
    const time = date.toLocaleTimeString('ru-RU', {
      timeZone: 'Asia/Tashkent',
      hour: '2-digit',
      minute: '2-digit',
    });
    return `${day} ${time}`;
  }

  private async userName(userId: number | null | undefined) {
    if (!userId) return '';
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { firstName: true, lastName: true },
    });
    return user ? `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() : '';
  }

  private async shopName(companyId: string, branchCode: string | null) {
    if (!branchCode) return '';
    const shop = await this.prisma.shop.findFirst({
      where: { companyId, branchCode },
      select: { name: true },
    });
    return shop?.name ?? branchCode;
  }

  /** Same audience as sale notifications: the shop's (or company-wide) subscribers. */
  private saleSubscribers(companyId: string, branchCode: string | null) {
    return this.prisma.telegramSubscriber.findMany({
      where: {
        companyId,
        notifyOnSale: true,
        OR: [{ branchCode: branchCode ?? undefined }, { branchCode: null }],
      },
    });
  }

  async notifySaleCancelled(args: {
    companyId: string | null;
    branchCode: string | null;
    number: string;
    kind: 'sale' | 'return' | 'exchange';
    amount: number;
    reason: string;
    cancelledById: number | null;
    sellerId: number | null;
    clientName?: string | null;
    itemsCount: number;
  }): Promise<void> {
    if (!args.companyId) return;
    try {
      const subscribers = await this.saleSubscribers(args.companyId, args.branchCode);
      if (!subscribers.length) return;
      const [shop, cancelledBy, seller] = await Promise.all([
        this.shopName(args.companyId, args.branchCode),
        this.userName(args.cancelledById),
        this.userName(args.sellerId),
      ]);
      const title =
        args.kind === 'return'
          ? 'Отменён возврат'
          : args.kind === 'exchange'
            ? 'Отменён обмен'
            : 'Отменена продажа';
      const lines = [
        `❌ <b>${title} #${this.escapeHtml(args.number)}</b>`,
        this.formatTashkentDateTime(new Date()),
        '',
        shop ? `🛒 Магазин: ${this.escapeHtml(shop)}` : '',
        `💸 Сумма: ${this.fmt(args.amount)} UZS`,
        `📦 Товаров: ${args.itemsCount}`,
        seller ? `Продавец: ${this.escapeHtml(seller)}` : '',
        args.clientName ? `Клиент: ${this.escapeHtml(args.clientName)}` : '',
        cancelledBy ? `Отменил: ${this.escapeHtml(cancelledBy)}` : '',
        '',
        `📝 Причина: ${this.escapeHtml(args.reason)}`,
      ].filter((line, index, all) => line !== '' || (all[index - 1] ?? '') !== '');
      const text = lines.join('\n').trim();
      await Promise.all(subscribers.map((sub) => this.sendMessage(sub.chatId, text)));
    } catch (err) {
      this.logger.error('notifySaleCancelled error', err);
    }
  }

  async notifyDebtRepaid(args: {
    companyId: string;
    branchCode: string | null;
    clientId: string;
    amount: number;
    remaining: number;
    paymentMethodName: string;
    acceptedById: number | null;
    saleId: number | null;
  }): Promise<void> {
    try {
      const subscribers = await this.saleSubscribers(args.companyId, args.branchCode);
      if (!subscribers.length) return;
      const [shop, acceptedBy, client, sale] = await Promise.all([
        this.shopName(args.companyId, args.branchCode),
        this.userName(args.acceptedById),
        this.prisma.client.findFirst({
          where: { id: args.clientId, companyId: args.companyId },
          select: { firstName: true, lastName: true, phone: true },
        }),
        args.saleId
          ? this.prisma.sale.findUnique({ where: { id: args.saleId }, select: { number: true } })
          : null,
      ]);
      const clientName = client
        ? `${client.firstName ?? ''} ${client.lastName ?? ''}`.trim() || client.phone || ''
        : '';
      const lines = [
        `💰 <b>Погашение долга</b>`,
        this.formatTashkentDateTime(new Date()),
        '',
        shop ? `🛒 Магазин: ${this.escapeHtml(shop)}` : '',
        clientName ? `Клиент: ${this.escapeHtml(clientName)}` : '',
        sale?.number ? `По продаже: #${this.escapeHtml(sale.number)}` : '',
        `Погашено: ${this.fmt(args.amount)} UZS`,
        `Способ оплаты: ${this.escapeHtml(args.paymentMethodName)}`,
        args.remaining > 0
          ? `Остаток долга: ${this.fmt(args.remaining)} UZS`
          : '✅ Долг погашен полностью',
        acceptedBy ? `Принял: ${this.escapeHtml(acceptedBy)}` : '',
      ].filter((line, index, all) => line !== '' || (all[index - 1] ?? '') !== '');
      const text = lines.join('\n').trim();
      await Promise.all(subscribers.map((sub) => this.sendMessage(sub.chatId, text)));
    } catch (err) {
      this.logger.error('notifyDebtRepaid error', err);
    }
  }

  private fmt(value: number): string {
    return Math.round(value).toLocaleString('ru-RU').replace(/\s/g, ' ');
  }

  async getSubscribers(requestContext: CompanyRequestContext) {
    const context = await requireCompanyContext(requestContext);

    const subscribers = await this.prisma.telegramSubscriber.findMany({
      where: { companyId: context.companyId },
      include: {
        user: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { linkedAt: 'desc' },
    });

    return subscribers.map((s) => ({
      id: s.id,
      chatId: s.chatId,
      userId: s.userId,
      userName: s.user ? `${s.user.firstName} ${s.user.lastName}`.trim() : '',
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
    requestContext: CompanyRequestContext,
  ) {
    const context = await requireCompanyContext(requestContext);

    if (
      typeof body.branchCode === 'string' &&
      !context.allowedBranchCodes.includes(body.branchCode)
    ) {
      throw new ForbiddenException('Филиал недоступен');
    }

    const sub = await this.prisma.telegramSubscriber.findFirst({
      where: { id, companyId: context.companyId },
    });
    if (!sub) throw new NotFoundException('Подписчик не найден');

    return this.prisma.telegramSubscriber.update({
      where: { id },
      data: {
        ...(body.notifyOnSale !== undefined && {
          notifyOnSale: body.notifyOnSale,
        }),
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

  async deleteSubscriber(id: string, requestContext: CompanyRequestContext) {
    const context = await requireCompanyContext(requestContext);

    const sub = await this.prisma.telegramSubscriber.findFirst({
      where: { id, companyId: context.companyId },
    });
    if (!sub) throw new NotFoundException('Подписчик не найден');

    await this.prisma.telegramSubscriber.delete({ where: { id } });
    return { success: true };
  }
}
