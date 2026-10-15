import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { rollbackCompany } from '../src/attribute-dictionaries/binding';

// Reverts the dictionary links written by attributes:apply and the product
// form (one batch, or all of the company) and turns useAttributeDictionaries
// off. Legacy data were never changed, so nothing else needs restoring.
//   npm run attributes:rollback -- --company-id=<id> [--batch=<batchId>] [--apply]

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is not configured');
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});
const arg = (name: string) =>
  process.argv.find((item) => item.startsWith(`--${name}=`))?.split('=')[1];

async function main() {
  const companyId = arg('company-id');
  if (!companyId)
    throw new Error('Usage: --company-id=<id> [--batch=<batchId>] [--apply]');
  const apply = process.argv.includes('--apply');
  const summary = await rollbackCompany(prisma, companyId, {
    apply,
    batchId: arg('batch'),
  });
  console.log(
    apply ? 'ROLLED BACK' : 'DRY RUN — nothing was written (add --apply)',
  );
  console.log(
    `batch ${summary.batchId}: ${summary.reverted} links reverted, flag off`,
  );
  console.log(`checksum unchanged: ${JSON.stringify(summary.checksum)}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
