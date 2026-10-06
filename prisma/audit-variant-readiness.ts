import 'dotenv/config';
import { Client } from 'pg';
import {
  auditVariantReadiness,
  repairVariantReadiness,
} from './lib/variant-readiness';

// Read-only unless --apply is passed. --company=<id> limits it to one tenant.
const APPLY = process.argv.includes('--apply');
const companyId =
  process.argv.find((arg) => arg.startsWith('--company='))?.slice(10) || null;

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not configured');
  }
  const client = new Client({ connectionString });
  await client.connect();
  const sql = async (text: string, params?: unknown[]) =>
    (await client.query(text, params)).rows;

  try {
    console.log('Before:', await auditVariantReadiness(sql, companyId));
    if (!APPLY) {
      console.log('\nDry run. Re-run with --apply to repair.');
      return;
    }

    await client.query('BEGIN');
    try {
      const repair = await repairVariantReadiness(sql, companyId);
      await client.query('COMMIT');
      console.log('\nRepaired:', repair);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
    console.log('\nAfter:', await auditVariantReadiness(sql, companyId));
    console.log(
      '\naxisStockAboveVariants rows were sold without a size and need a stock count;' +
        ' the remaining counters need a manual decision.',
    );
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
