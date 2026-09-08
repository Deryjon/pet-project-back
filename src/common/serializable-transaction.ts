import { Prisma } from '@prisma/client';

type SerializableClient = {
  $transaction<T>(
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
    options: { isolationLevel: Prisma.TransactionIsolationLevel },
  ): Promise<T>;
};

const SERIALIZATION_CONFLICT = 'P2034';

export async function runSerializableTransaction<T>(
  client: SerializableClient,
  operation: (tx: Prisma.TransactionClient) => Promise<T>,
  maxAttempts = 3,
): Promise<T> {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await client.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      const code = (error as { code?: unknown })?.code;
      if (code !== SERIALIZATION_CONFLICT || attempt === maxAttempts) {
        throw error;
      }
    }
  }

  throw new Error('Serializable transaction retry limit exceeded');
}
