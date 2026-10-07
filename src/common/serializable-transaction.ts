import { Prisma } from '@prisma/client';

type SerializableClient = {
  $transaction<T>(
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
    options: { isolationLevel: Prisma.TransactionIsolationLevel },
  ): Promise<T>;
};

const SERIALIZATION_CONFLICT = 'P2034';

// Concurrent sales of one product in different shops all update the same
// Product row through the stock trigger, so conflicts are expected under
// load: retry a few more times and spread the retries out (random jitter)
// so the competing transactions do not collide again in lockstep.
const DEFAULT_MAX_ATTEMPTS = 6;
const BASE_DELAY_MS = 15;

function backoff(attempt: number) {
  const ceiling = BASE_DELAY_MS * 2 ** (attempt - 1);
  return new Promise((resolve) =>
    setTimeout(resolve, ceiling / 2 + Math.random() * (ceiling / 2)),
  );
}

export async function runSerializableTransaction<T>(
  client: SerializableClient,
  operation: (tx: Prisma.TransactionClient) => Promise<T>,
  maxAttempts = DEFAULT_MAX_ATTEMPTS,
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
      await backoff(attempt);
    }
  }

  throw new Error('Serializable transaction retry limit exceeded');
}
