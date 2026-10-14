import { companyContext as testContext } from '../../test/fixtures/request-context';
import { TelegramService } from './telegram.service';

describe('TelegramService linking', () => {
  const env = { ...process.env };
  let sent: Array<{ chat_id: string; text: string }>;

  beforeEach(() => {
    sent = [];
    process.env.TELEGRAM_BOT_TOKEN = 'bot-token';
    process.env.TELEGRAM_BOT_USERNAME = '@konkurent_bot';
    process.env.TELEGRAM_WEBHOOK_SECRET = 'secret';
    process.env.APP_URL = 'https://api.example.uz/';
    delete process.env.TELEGRAM_WEBHOOK_URL;
    global.fetch = jest.fn(async (url: string, init?: any) => {
      if (String(url).endsWith('/sendMessage')) sent.push(JSON.parse(init.body));
      if (String(url).endsWith('/getMe')) return { json: async () => ({ ok: true, result: { username: 'konkurent_bot' } }) };
      if (String(url).endsWith('/getWebhookInfo'))
        return {
          json: async () => ({
            ok: true,
            result: { url: 'https://api.example.uz/telegram/webhook', last_error_message: 'Wrong response from the webhook: 401 Unauthorized', pending_update_count: 3 },
          }),
        };
      return { ok: true, text: async () => '', json: async () => ({ ok: true }) };
    }) as any;
  });

  afterEach(() => {
    process.env = { ...env };
  });

  function setup(overrides: Record<string, any> = {}) {
    const deleteMany = jest.fn((args) => ({ op: 'deleteMany', args }));
    const upsert = jest.fn((args) => ({ op: 'upsert', args }));
    const prisma: any = {
      telegramLinkToken: {
        findUnique: jest.fn(async () => ({
          id: 'lt-1',
          userId: 5,
          companyId: 'company-1',
          usedAt: null,
          expiresAt: new Date(Date.now() + 60_000),
        })),
        update: jest.fn((args) => ({ op: 'update', args })),
        create: jest.fn(),
      },
      telegramSubscriber: { deleteMany, upsert },
      user: { findUnique: jest.fn(async () => ({ id: 5, firstName: 'Ali', lastName: 'Valiev' })) },
      $transaction: jest.fn(async (ops: any[]) => ops),
      ...overrides,
    };
    return { service: new TelegramService(prisma, {} as any), prisma, deleteMany, upsert };
  }

  it('links the chat and moves a chat that belonged to another employee', async () => {
    const { service, deleteMany, upsert } = setup();
    await service.handleUpdate({ message: { chat: { id: 42 }, text: '/start  abc123 ' } });
    expect(deleteMany).toHaveBeenCalledWith({ where: { chatId: '42', userId: { not: 5 } } });
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 5 }, update: expect.objectContaining({ chatId: '42' }) }),
    );
    expect(sent.at(-1)?.text).toContain('Уведомления подключены');
  });

  it('accepts /start@botname from group chats too', async () => {
    const { service, upsert } = setup();
    await service.handleUpdate({ message: { chat: { id: 42 }, text: '/start@konkurent_bot abc123' } });
    expect(upsert).toHaveBeenCalled();
  });

  it('answers in the chat instead of failing the webhook when saving breaks', async () => {
    const { service } = setup({ $transaction: jest.fn(async () => { throw new Error('db down'); }) });
    await expect(
      service.handleUpdate({ message: { chat: { id: 42 }, text: '/start abc123' } }),
    ).resolves.toBeUndefined();
    expect(sent.at(-1)?.text).toContain('Не удалось подключить');
  });

  it('builds the link without "@" and lets any user with the permission subscribe', async () => {
    const { service, prisma } = setup();
    const { link } = await service.generateLinkToken(testContext());
    expect(link).toMatch(/^https:\/\/t\.me\/konkurent_bot\?start=\w{12}$/);
    expect(prisma.telegramLinkToken.create).toHaveBeenCalled();
  });

  it('refuses to build a link when the bot is not configured', async () => {
    delete process.env.TELEGRAM_BOT_USERNAME;
    const { service } = setup();
    await expect(service.generateLinkToken(testContext())).rejects.toThrow('не настроен');
  });

  it('explains a webhook registered without /api and rejected with 401', async () => {
    const { service } = setup();
    const status = await service.getStatus();
    expect(status.ok).toBe(false);
    expect(status.expected_webhook_url).toBe('https://api.example.uz/api/telegram/webhook');
    expect(status.problems.join('\n')).toContain('Вебхук указывает на https://api.example.uz/telegram/webhook');
    expect(status.problems.join('\n')).toContain('401');
  });
});
