import { Prisma } from '@prisma/client';

type SerializableClient = {
  $transaction<T>(
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
    options: { isolationLevel: Prisma.TransactionIsolationLevel },
  ): Promise<T>;
};

const SERIALIZATION_CONFLICT = 'P2034';
// A raw query ($queryRaw, e.g. SELECT ... FOR UPDATE) surfaces the same
// Postgres conflict as P2010 with the SQLSTATE in meta.code.
const RAW_QUERY_FAILED = 'P2010';
const RETRYABLE_SQLSTATES = new Set(['40001', '40P01']);

export function isSerializationConflict(error: unknown) {
  const { code, meta } = (error ?? {}) as {
    code?: unknown;
    meta?: { code?: unknown };
  };
  if (code === SERIALIZATION_CONFLICT) return true;
  return (
    code === RAW_QUERY_FAILED &&
    typeof meta?.code === 'string' &&
    RETRYABLE_SQLSTATES.has(meta.code)
  );
}

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
      if (!isSerializationConflict(error) || attempt === maxAttempts) {
        throw error;
      }
      await backoff(attempt);
    }
  }

  throw new Error('Serializable transaction retry limit exceeded');
}
