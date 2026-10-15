import 'dotenv/config';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { canonicalUnit } from '../src/common/measurement-units';

// Dry run only: lists every stored spelling of Product.unit per company with
// the unit it is read as ("штука" → "шт") and how many products carry it.
// It runs in a READ ONLY transaction and changes nothing: old spellings are
// already read as the canonical unit by the app, so no rewrite is needed.
//   npm run units:audit -- [--company-id=<id>] [--out=./units-audit]

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is not configured');
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});
const arg = (name: string) =>
  process.argv.find((item) => item.startsWith(`--${name}=`))?.split('=')[1];

const csvCell = (value: unknown) => {
  const text = String(value ?? '');
  return /[",\n;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

async function main() {
  const out = arg('out') ?? './units-audit';
  const companyId = arg('company-id');

  const groups = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SET TRANSACTION READ ONLY`;
    return tx.product.groupBy({
      by: ['companyId', 'unit'],
      where: companyId ? { companyId } : {},
      _count: { _all: true },
      orderBy: [{ companyId: 'asc' }, { unit: 'asc' }],
    });
  });

  const rows = groups.map((group) => {
    const stored = group.unit ?? '';
    const unit = canonicalUnit(stored);
    return {
      company_id: group.companyId ?? '',
      stored_unit: stored,
      read_as: unit ?? stored,
      status: !stored.trim()
        ? 'empty (shown as шт)'
        : unit === stored
          ? 'canonical'
          : unit
            ? 'alias'
            : 'unknown — check manually',
      products: group._count._all,
    };
  });

  const columns = ['company_id', 'stored_unit', 'read_as', 'status', 'products'];
  mkdirSync(out, { recursive: true });
  const file = join(out, `${companyId ?? 'all'}-units.csv`);
  writeFileSync(
    file,
    [
      columns.join(','),
      ...rows.map((row) =>
        columns.map((column) => csvCell((row as any)[column])).join(','),
      ),
    ].join('\n') + '\n',
  );

  console.table(rows);
  console.log(`Written ${file}. Nothing in the database was changed.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
