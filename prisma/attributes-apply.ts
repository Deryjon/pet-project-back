import 'dotenv/config';
import { readFileSync } from 'fs';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import {
  applyCompany,
  auditRowsFromCsv,
} from '../src/attribute-dictionaries/binding';

// Links the store's legacy colours/sizes/seasons/collections to the shared
// dictionaries from the CSV the owner reviewed (attributes:audit output).
// Writes only the new link columns, each change into AttributeBindingLog;
// names, articles, barcodes and stock are compared before/after and the run
// aborts if anything else would change. Without --apply it is a dry run.
//   pg_dump first!
//   npm run attributes:apply -- --company-id=<id> --csv=<reviewed.csv> [--apply]
// The flag useAttributeDictionaries is turned on separately (platform admin).

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is not configured');
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});
const arg = (name: string) =>
  process.argv.find((item) => item.startsWith(`--${name}=`))?.split('=')[1];

async function main() {
  const companyId = arg('company-id');
  const csv = arg('csv');
  if (!companyId || !csv)
    throw new Error('Usage: --company-id=<id> --csv=<reviewed.csv> [--apply]');
  const apply = process.argv.includes('--apply');
  const rows = auditRowsFromCsv(readFileSync(csv, 'utf8'));
  const foreign = rows.filter(
    (row) => row.company_id && row.company_id !== companyId,
  );
  if (foreign.length)
    throw new Error(`The CSV has ${foreign.length} rows of another company`);

  const summary = await applyCompany(prisma, companyId, rows, { apply });
  console.log(
    apply ? 'APPLIED' : 'DRY RUN — nothing was written (add --apply)',
  );
  console.log(
    `batch ${summary.batchId}: legacy rows ${summary.linkedLegacy}, variants ${summary.linkedVariants}, ` +
      `products ${summary.linkedProducts}, new store values ${summary.createdValues}, skipped ${summary.skipped.length}`,
  );
  for (const skipped of summary.skipped)
    console.log(
      `  skip ${skipped.entity} ${skipped.legacy_id}: ${skipped.reason}`,
    );
  console.log(`checksum unchanged: ${JSON.stringify(summary.checksum)}`);
  if (apply)
    console.log(
      `Rollback: npm run attributes:rollback -- --company-id=${companyId} --batch=${summary.batchId} --apply`,
    );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
