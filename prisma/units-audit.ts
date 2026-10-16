import 'dotenv/config';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { canonicalUnit } from '../src/common/measurement-units';

// CSV for Excel: UTF-8 with BOM and «;» (Russian Excel). Dry run only: lists every stored spelling of Product.unit per company with
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

  const { groups, names } = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SET TRANSACTION READ ONLY`;
    const groups = await tx.product.groupBy({
      by: ['companyId', 'unit'],
      where: companyId ? { companyId } : {},
      _count: { _all: true },
      orderBy: [{ companyId: 'asc' }, { unit: 'asc' }],
    });
    const companies = await tx.company.findMany({ select: { id: true, name: true } });
    return { groups, names: new Map(companies.map((c) => [c.id, c.name])) };
  });

  const rows = groups.map((group) => {
    const stored = group.unit ?? '';
    const unit = canonicalUnit(stored);
    return {
      company: names.get(group.companyId ?? '') ?? group.companyId ?? '',
      stored_unit: stored,
      read_as: unit ?? stored,
      status: !stored.trim()
        ? 'пусто (показывается как шт)'
        : unit === stored
          ? 'правильно'
          : unit
            ? 'другое написание — читается верно'
            : 'неизвестная единица — проверить вручную',
      products: group._count._all,
    };
  });

  const columns = ['company', 'stored_unit', 'read_as', 'status', 'products'];
  const headers = ['Компания', 'Как записано', 'Читается как', 'Статус', 'Товаров'];
  mkdirSync(out, { recursive: true });
  const file = join(out, `${companyId ?? 'all'}-units.csv`);
  writeFileSync(
    file,
    [
      '\uFEFF' + headers.join(';'),
      ...rows.map((row) =>
        columns.map((column) => csvCell((row as any)[column])).join(';'),
      ),
    ].join('\n') + '\n',
  );

  console.table(rows);
  console.log(`Отчёт: ${file}. В базе ничего не изменено.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
