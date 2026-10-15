import 'dotenv/config';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { hexKey, nameKey } from '../src/common/dictionary-names';
import { normalizeSizeCode } from '../src/common/resolve-size';

// Dry run only: lists duplicates that were created before the dictionaries
// compared values by one rule — colours (same HEX or name up to case/ё),
// sizes ("XXL" next to "2XL", "xl" next to "XL"), seasons, brands,
// categories, suppliers and attribute values — with how many goods use each
// row. Runs in a READ ONLY transaction; nothing is merged or deleted.
//   npm run dictionaries:duplicates -- [--company-id=<id>] [--out=./dictionary-duplicates]

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is not configured');
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});
const arg = (name: string) =>
  process.argv.find((item) => item.startsWith(`--${name}=`))?.split('=')[1];

type Row = {
  company_id: string;
  dictionary: string;
  group_key: string;
  id: string;
  value: string;
  code: string;
  is_active: string;
  used_by: number;
};

const csvCell = (value: unknown) => {
  const text = String(value ?? '');
  return /[",\n;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

function duplicates<T>(items: T[], key: (item: T) => string | null) {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const value = key(item);
    if (!value) continue;
    groups.set(value, [...(groups.get(value) ?? []), item]);
  }
  return [...groups.entries()].filter(([, group]) => group.length > 1);
}

async function main() {
  const out = arg('out') ?? './dictionary-duplicates';
  const companyId = arg('company-id');
  const where = companyId ? { companyId } : {};

  const rows = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SET TRANSACTION READ ONLY`;
    const result: Row[] = [];
    const push = (
      dictionary: string,
      groupKey: string,
      item: { id: string | number; companyId: string | null; isActive?: boolean },
      value: string,
      code: string,
      usedBy: number,
    ) =>
      result.push({
        company_id: item.companyId ?? '',
        dictionary,
        group_key: groupKey,
        id: String(item.id),
        value,
        code,
        is_active: item.isActive === false ? 'no' : 'yes',
        used_by: usedBy,
      });

    const colors = await tx.productColor.findMany({
      where,
      include: { _count: { select: { variants: true } } },
    });
    for (const [key, group] of [
      ...duplicates(colors, (c) => (hexKey(c.hex) ? `${c.companyId}|hex|${hexKey(c.hex)}` : null)),
      ...duplicates(colors, (c) => `${c.companyId}|name|${nameKey(c.name)}`),
    ])
      for (const c of group)
        push('color', key, c, `${c.name}${c.hex ? ` ${c.hex}` : ''}`, c.code, c._count.variants);

    const sizes = await tx.productSize.findMany({
      where,
      include: { _count: { select: { variants: true } } },
    });
    for (const [key, group] of duplicates(
      sizes,
      (s) => `${s.companyId}|${s.kind ?? s.type}|${normalizeSizeCode(s.name)}`,
    ))
      for (const s of group) push('size', key, s, s.name, s.code, s._count.variants);

    const seasons = await tx.productSeasonOption.findMany({
      where,
      include: { _count: { select: { products: true } } },
    });
    for (const [key, group] of duplicates(seasons, (s) => `${s.companyId}|${nameKey(s.nameRu)}`))
      for (const s of group) push('season', key, s, s.nameRu, s.code, s._count.products);

    for (const model of ['brand', 'category'] as const) {
      const items: Array<{ id: number; companyId: string; name: string; _count: { products: number } }> =
        await (tx as any)[model].findMany({
          where,
          include: { _count: { select: { products: true } } },
        });
      for (const [key, group] of duplicates(items, (i) => `${i.companyId}|${nameKey(i.name)}`))
        for (const i of group) push(model, key, i, i.name, '', i._count.products);
    }
    const suppliers = await tx.supplier.findMany({
      where,
      include: { _count: { select: { products: true } } },
    });
    for (const [key, group] of duplicates(suppliers, (i) => `${i.companyId}|${nameKey(i.name)}`))
      for (const i of group) push('supplier', key, i, i.name, '', i._count.products);

    const options = await tx.attributeOption.findMany({
      where: { ...where, legacyColorId: null, legacySizeId: null },
      include: {
        definition: { select: { name: true } },
        _count: { select: { variantValues: true, productValues: true } },
      },
    });
    for (const [key, group] of duplicates(options, (o) => `${o.definitionId}|${nameKey(o.value)}`))
      for (const o of group)
        push(
          `attribute:${o.definition.name}`,
          key,
          o,
          o.value,
          '',
          o._count.variantValues + o._count.productValues,
        );
    return result;
  });

  const columns: Array<keyof Row> = [
    'company_id',
    'dictionary',
    'group_key',
    'id',
    'value',
    'code',
    'is_active',
    'used_by',
  ];
  mkdirSync(out, { recursive: true });
  const file = join(out, `${companyId ?? 'all'}-duplicates.csv`);
  writeFileSync(
    file,
    [
      columns.join(','),
      ...rows.map((row) => columns.map((column) => csvCell(row[column])).join(',')),
    ].join('\n') + '\n',
  );
  const groups = new Set(rows.map((row) => `${row.dictionary}|${row.group_key}`));
  console.log(
    `${groups.size} duplicate groups, ${rows.length} rows → ${file}. Nothing in the database was changed.`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
