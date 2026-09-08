import { UnauthorizedException } from '@nestjs/common';
import { TelegramController } from './telegram.controller';

describe('TelegramController webhook authentication', () => {
  const previousSecret = process.env.TELEGRAM_WEBHOOK_SECRET;

  afterEach(() => {
    if (previousSecret === undefined)
      delete process.env.TELEGRAM_WEBHOOK_SECRET;
    else process.env.TELEGRAM_WEBHOOK_SECRET = previousSecret;
  });

  it('fails closed when the webhook secret is not configured', async () => {
    delete process.env.TELEGRAM_WEBHOOK_SECRET;
    const telegram = { handleUpdate: jest.fn() };
    const controller = new TelegramController(telegram as any);
    await expect(controller.webhook({ update_id: 1 })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(telegram.handleUpdate).not.toHaveBeenCalled();
  });

  it('accepts only the configured Telegram secret header', async () => {
    process.env.TELEGRAM_WEBHOOK_SECRET = 'expected-secret';
    const telegram = { handleUpdate: jest.fn().mockResolvedValue(undefined) };
    const controller = new TelegramController(telegram as any);

    await expect(
      controller.webhook({ update_id: 1 }, 'wrong-secret'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(
      controller.webhook({ update_id: 2 }, 'expected-secret'),
    ).resolves.toEqual({ ok: true });
    expect(telegram.handleUpdate).toHaveBeenCalledTimes(1);
  });
});
