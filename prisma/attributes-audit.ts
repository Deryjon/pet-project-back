import 'dotenv/config';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import {
  AUDIT_COLUMNS,
  auditCompany,
  dataChecksum,
  toCsv,
} from '../src/attribute-dictionaries/binding';

// Dry run only: proposes a dictionary code for every legacy colour, size,
// season and collection of the store and writes CSV files for the owner.
// It runs in a READ ONLY transaction, so it cannot write to the database.
//   npm run attributes:audit -- --company-id=<id> [--out=./attributes-audit]
// Then: the owner reviews <company>-attributes.csv (approved_code: another
// code or "skip"), and attributes:apply takes the reviewed file.

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is not configured');
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});
const arg = (name: string) =>
  process.argv.find((item) => item.startsWith(`--${name}=`))?.split('=')[1];

async function main() {
  const out = arg('out') ?? './attributes-audit';
  const companyId = arg('company-id');
  const companies = await prisma.company.findMany({
    where: {
      ...(companyId ? { id: companyId } : {}),
      storeType: { in: ['CLOTHING', 'SHOES', 'CLOTHING_SHOES'] },
    },
    select: { id: true, name: true },
  });
  if (!companies.length) throw new Error('No clothing/shoe company found');
  mkdirSync(out, { recursive: true });

  for (const company of companies) {
    const { rows, conflicts, checksum } = await prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SET TRANSACTION READ ONLY`;
        return {
          ...(await auditCompany(tx, company.id)),
          checksum: await dataChecksum(tx, company.id),
        };
      },
    );
    const base = join(out, `${company.id}-attributes`);
    writeFileSync(`${base}.csv`, toCsv(rows, AUDIT_COLUMNS));
    writeFileSync(
      `${base}-conflicts.csv`,
      toCsv(conflicts, [
        'product_id',
        'article',
        'product_name',
        'variant_ids',
        'color_code',
        'size_code',
      ]),
    );
    writeFileSync(
      `${base}-checksum.json`,
      JSON.stringify(
        { companyId: company.id, at: new Date(), ...checksum },
        null,
        2,
      ),
    );
    const count = (status: string) =>
      rows.filter((row) => row.status === status).length;
    console.log(
      `${company.name} (${company.id}): ${rows.length} values — exact ${count('exact')}, alias ${count('alias')}, ` +
        `new ${count('new')}, manual ${count('manual')}, linked ${count('linked')}; ` +
        `${conflicts.length} variant conflicts → ${base}.csv`,
    );
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
