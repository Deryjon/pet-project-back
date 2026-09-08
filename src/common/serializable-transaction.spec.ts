import { runSerializableTransaction } from './serializable-transaction';

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
});
