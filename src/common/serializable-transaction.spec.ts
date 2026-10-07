import {
  isSerializationConflict,
  runSerializableTransaction,
} from './serializable-transaction';

describe('runSerializableTransaction', () => {
  it('retries PostgreSQL serialization conflicts with Serializable isolation', async () => {
    const operation = jest.fn().mockResolvedValue('done');
    const client = {
      $transaction: jest
        .fn()
        .mockRejectedValueOnce({ code: 'P2034' })
        .mockResolvedValueOnce('done'),
    };

    await expect(
      runSerializableTransaction(client as any, operation),
    ).resolves.toBe('done');
    expect(client.$transaction).toHaveBeenCalledTimes(2);
    expect(client.$transaction).toHaveBeenCalledWith(operation, {
      isolationLevel: 'Serializable',
    });
  });

  it('does not retry application errors', async () => {
    const error = new Error('invalid operation');
    const client = {
      $transaction: jest.fn().mockRejectedValue(error),
    };

    await expect(
      runSerializableTransaction(client as any, jest.fn()),
    ).rejects.toBe(error);
    expect(client.$transaction).toHaveBeenCalledTimes(1);
  });

  it('keeps retrying conflicts up to six attempts, then gives up', async () => {
    const conflict = { code: 'P2034' };
    const client = { $transaction: jest.fn().mockRejectedValue(conflict) };

    await expect(
      runSerializableTransaction(client as any, jest.fn()),
    ).rejects.toBe(conflict);
    expect(client.$transaction).toHaveBeenCalledTimes(6);
  });

  it('retries a conflict raised by a raw query (FOR UPDATE)', async () => {
    const client = {
      $transaction: jest
        .fn()
        .mockRejectedValueOnce({ code: 'P2010', meta: { code: '40001' } })
        .mockResolvedValueOnce('done'),
    };

    await expect(
      runSerializableTransaction(client as any, jest.fn()),
    ).resolves.toBe('done');
    expect(client.$transaction).toHaveBeenCalledTimes(2);
  });

  it('treats only serialization and deadlock SQLSTATEs as conflicts', () => {
    expect(isSerializationConflict({ code: 'P2034' })).toBe(true);
    expect(
      isSerializationConflict({ code: 'P2010', meta: { code: '40P01' } }),
    ).toBe(true);
    expect(
      isSerializationConflict({ code: 'P2010', meta: { code: '23505' } }),
    ).toBe(false);
    expect(isSerializationConflict(null)).toBe(false);
  });
});
