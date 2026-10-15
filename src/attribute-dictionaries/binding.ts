import { randomUUID } from 'crypto';
import { AttributeValueType, Prisma, PrismaClient } from '@prisma/client';
import {
  DictionaryEntry,
  Match,
  matchCollection,
  matchLegacyColor,
  matchLegacySeason,
  matchLegacySize,
} from './legacy-matching';
import {
  AttributeCodeError,
  normalizeAttributeCode,
} from './normalize-attribute-code';
import { sizeGroupsFor } from './system-values';

// Binding a store's legacy colours/sizes/seasons to the shared dictionaries:
// audit (read-only CSV), apply (writes only the new link columns, logged) and
// rollback. Products, articles, barcodes and stock are never written; apply
// and rollback compare their checksum before and after and abort otherwise.

type Db = PrismaClient | Prisma.TransactionClient;

export type AuditEntity = 'color' | 'size' | 'season' | 'collection';

export type AuditRow = {
  company_id: string;
  entity: AuditEntity;
  legacy_id: string;
  old_value: string;
  old_code: string;
  old_hex: string;
  used_in: number;
  status: Match['status'] | 'linked';
  proposed_code: string;
  proposed_group: string;
  proposed_name: string;
  note: string;
  /** Filled by the owner: a code to use instead, or "skip". */
  approved_code: string;
};

export const AUDIT_COLUMNS: Array<keyof AuditRow> = [
  'company_id',
  'entity',
  'legacy_id',
  'old_value',
  'old_code',
  'old_hex',
  'used_in',
  'status',
  'proposed_code',
  'proposed_group',
  'proposed_name',
  'note',
  'approved_code',
];

export type ConflictRow = {
  product_id: number;
  article: string;
  product_name: string;
  variant_ids: string;
  color_code: string;
  size_code: string;
};

const LEGACY_TABLE = {
  color: 'ProductColor',
  size: 'ProductSize',
  season: 'ProductSeasonOption',
} as const;

const TYPE_BY_ENTITY: Record<AuditEntity, AttributeValueType> = {
  color: 'COLOR',
  size: 'SIZE',
  season: 'SEASON',
  collection: 'SEASON',
};

async function storeOf(db: Db, companyId: string) {
  const company = await db.company.findUnique({
    where: { id: companyId },
    select: { id: true, storeType: true },
  });
  const sizeGroups = company && sizeGroupsFor(company.storeType);
  if (!company || !sizeGroups) {
    throw new Error(`Company ${companyId} is not a clothing/shoe store`);
  }
  return { companyId, sizeGroups };
}

async function dictionaryOf(
  db: Db,
  companyId: string,
  type: AttributeValueType,
  sizeGroups: string[],
) {
  const rows = await db.attributeValue.findMany({
    where: {
      type,
      archivedAt: null,
      OR: [
        {
          companyId: null,
          ...(type === 'SIZE' ? { group: { in: sizeGroups } } : {}),
        },
        { companyId },
      ],
    },
    orderBy: [{ isDefault: 'desc' }, { sortOrder: 'asc' }],
  });
  return rows as DictionaryEntry[];
}

/** Read-only proposal for every legacy value of the store and the variants that would collide. */
export async function auditCompany(db: Db, companyId: string) {
  const store = await storeOf(db, companyId);
  const [colorDict, sizeDict, seasonDict] = await Promise.all([
    dictionaryOf(db, companyId, 'COLOR', store.sizeGroups),
    dictionaryOf(db, companyId, 'SIZE', store.sizeGroups),
    dictionaryOf(db, companyId, 'SEASON', store.sizeGroups),
  ]);
  const rows: AuditRow[] = [];
  const row = (
    entity: AuditEntity,
    legacy: {
      id: string;
      value: string;
      code?: string | null;
      hex?: string | null;
      used: number;
    },
    match: Match | null,
    linkedCode?: string,
  ): AuditRow => ({
    company_id: companyId,
    entity,
    legacy_id: legacy.id,
    old_value: legacy.value,
    old_code: legacy.code ?? '',
    old_hex: legacy.hex ?? '',
    used_in: legacy.used,
    status: match ? match.status : 'linked',
    proposed_code: match ? (match.code ?? '') : (linkedCode ?? ''),
    proposed_group: match?.group ?? '',
    proposed_name: match?.value?.name ?? '',
    note: match ? match.note : 'уже привязан',
    approved_code: '',
  });

  const colors = await db.productColor.findMany({
    where: { companyId },
    include: { _count: { select: { variants: true } }, attributeValue: true },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });
  for (const color of colors) {
    const legacy = {
      id: color.id,
      value: color.name,
      code: color.code,
      hex: color.hex,
      used: color._count.variants,
    };
    rows.push(
      color.attributeValue
        ? row('color', legacy, null, color.attributeValue.code)
        : row('color', legacy, matchLegacyColor(color, colorDict)),
    );
  }

  const sizes = await db.productSize.findMany({
    where: { companyId },
    include: { _count: { select: { variants: true } }, attributeValue: true },
    orderBy: [{ type: 'asc' }, { sortOrder: 'asc' }],
  });
  for (const size of sizes) {
    const legacy = {
      id: size.id,
      value: size.name,
      code: size.code,
      used: size._count.variants,
    };
    rows.push(
      size.attributeValue
        ? row('size', legacy, null, size.attributeValue.code)
        : row(
            'size',
            legacy,
            matchLegacySize(size, sizeDict, store.sizeGroups),
          ),
    );
  }

  const seasons = await db.productSeasonOption.findMany({
    where: { companyId },
    include: { _count: { select: { products: true } }, attributeValue: true },
    orderBy: { sortOrder: 'asc' },
  });
  for (const season of seasons) {
    const legacy = {
      id: season.id,
      value: season.nameRu,
      code: season.code,
      used: season._count.products,
    };
    rows.push(
      season.attributeValue
        ? row('season', legacy, null, season.attributeValue.code)
        : row('season', legacy, matchLegacySeason(season, seasonDict)),
    );
  }

  const collections = await db.product.groupBy({
    by: ['collection'],
    where: { companyId, collection: { not: null } },
    _count: { _all: true },
  });
  for (const collection of collections) {
    const text = collection.collection?.trim();
    if (!text) continue;
    rows.push(
      row(
        'collection',
        {
          id: collection.collection!,
          value: collection.collection!,
          used: collection._count._all,
        },
        matchCollection(text, seasonDict),
      ),
    );
  }

  return { rows, conflicts: await conflictsOf(db, companyId, rows) };
}

/** Variants of one product that would share a colour+size pair after binding. */
async function conflictsOf(db: Db, companyId: string, rows: AuditRow[]) {
  const codeOf = new Map(
    rows
      .filter((row) => row.entity === 'color' || row.entity === 'size')
      .map((row) => [
        `${row.entity}:${row.legacy_id}`,
        row.approved_code || row.proposed_code,
      ]),
  );
  const variants = await db.productVariant.findMany({
    where: {
      companyId,
      OR: [{ colorId: { not: null } }, { sizeId: { not: null } }],
    },
    select: {
      id: true,
      productId: true,
      colorId: true,
      sizeId: true,
      product: { select: { article: true, name: true } },
    },
    orderBy: { productId: 'asc' },
  });
  const groups = new Map<string, typeof variants>();
  for (const variant of variants) {
    const color = variant.colorId
      ? (codeOf.get(`color:${variant.colorId}`) ?? `?${variant.colorId}`)
      : '';
    const size = variant.sizeId
      ? (codeOf.get(`size:${variant.sizeId}`) ?? `?${variant.sizeId}`)
      : '';
    const key = `${variant.productId}|${color}|${size}`;
    groups.set(key, [...(groups.get(key) ?? []), variant]);
  }
  const conflicts: ConflictRow[] = [];
  for (const [key, group] of groups) {
    if (group.length < 2) continue;
    const [, color, size] = key.split('|');
    conflicts.push({
      product_id: group[0].productId,
      article: group[0].product.article ?? '',
      product_name: group[0].product.name,
      variant_ids: group.map((variant) => variant.id).join(' '),
      color_code: color,
      size_code: size,
    });
  }
  return conflicts;
}

/**
 * Checksum of what binding must never change for the company: products
 * (names, articles, SKUs, barcodes, legacy colour/size/season), variants and
 * stock. Equal before and after = the client data are identical.
 */
export async function dataChecksum(db: Db, companyId: string) {
  const [result] = await db.$queryRaw<
    Array<{
      products: string;
      variants: string;
      stocks: string;
      dictionaries: string;
      counts: string;
    }>
  >`
    SELECT
      (SELECT md5(coalesce(string_agg(concat_ws('|', id, name, article, sku, barcode, season::text,
         "seasonOptionId", "seasonYear", collection, quantity, "salePrice", "purchasePrice", "archivedAt", "updatedAt"), E'\\n' ORDER BY id), ''))
         FROM "Product" WHERE "companyId" = ${companyId}) AS products,
      (SELECT md5(coalesce(string_agg(concat_ws('|', id, "productId", "colorId", "sizeId", barcode, sku,
         "salePrice", "purchasePrice", "isActive", "isDefault", "updatedAt"), E'\\n' ORDER BY id), ''))
         FROM "ProductVariant" WHERE "companyId" = ${companyId}) AS variants,
      (SELECT md5(coalesce(string_agg(concat_ws('|', id, "variantId", "shopId", quantity, "salePrice", "purchasePrice"), E'\\n' ORDER BY id), ''))
         FROM "ProductVariantStock" WHERE "companyId" = ${companyId}) AS stocks,
      md5(concat_ws(E'\n',
        (SELECT string_agg(concat_ws('|', id, name, "nameRu", "nameUz", code, hex, "sortOrder", "isActive", "updatedAt"), E'\n' ORDER BY id)
           FROM "ProductColor" WHERE "companyId" = ${companyId}),
        (SELECT string_agg(concat_ws('|', id, name, "nameRu", "nameUz", code, kind::text, type::text, "sortOrder", "isActive", "updatedAt"), E'\n' ORDER BY id)
           FROM "ProductSize" WHERE "companyId" = ${companyId}),
        (SELECT string_agg(concat_ws('|', id, code, "nameRu", "nameUz", "sortOrder", "isActive", "updatedAt"), E'\n' ORDER BY id)
           FROM "ProductSeasonOption" WHERE "companyId" = ${companyId}))) AS dictionaries,
      concat_ws('/',
        (SELECT count(*) FROM "Product" WHERE "companyId" = ${companyId}),
        (SELECT count(*) FROM "ProductVariant" WHERE "companyId" = ${companyId}),
        (SELECT count(*) FROM "ProductVariantStock" WHERE "companyId" = ${companyId})) AS counts`;
  return result;
}

function sameChecksum(
  a: Awaited<ReturnType<typeof dataChecksum>>,
  b: typeof a,
) {
  return (
    a.products === b.products &&
    a.variants === b.variants &&
    a.stocks === b.stocks &&
    a.dictionaries === b.dictionaries
  );
}

class DryRun extends Error {}

export type ApplySummary = {
  batchId: string;
  applied: boolean;
  linkedLegacy: number;
  linkedVariants: number;
  linkedProducts: number;
  createdValues: number;
  skipped: Array<{ entity: string; legacy_id: string; reason: string }>;
  checksum: Awaited<ReturnType<typeof dataChecksum>>;
};

/**
 * Applies the reviewed audit CSV: for each row the owner's approved_code, or
 * the proposal of an exact/alias/new row. Manual rows without an approved
 * code and rows marked "skip" are left alone. Without `apply` everything runs
 * in a transaction that is rolled back (a dry run with the same counts).
 */
export async function applyCompany(
  db: PrismaClient,
  companyId: string,
  rows: AuditRow[],
  options: { apply: boolean },
): Promise<ApplySummary> {
  const batchId = randomUUID();
  const summary: ApplySummary = {
    batchId,
    applied: false,
    linkedLegacy: 0,
    linkedVariants: 0,
    linkedProducts: 0,
    createdValues: 0,
    skipped: [],
    checksum: await dataChecksum(db, companyId),
  };
  const skip = (row: AuditRow, reason: string) =>
    summary.skipped.push({
      entity: row.entity,
      legacy_id: row.legacy_id,
      reason,
    });

  try {
    await db.$transaction(
      async (tx) => {
        const store = await storeOf(tx, companyId);
        const before = await dataChecksum(tx, companyId);
        const logs: Prisma.AttributeBindingLogCreateManyInput[] = [];
        const log = (
          entity: string,
          entityId: string,
          field: string,
          sourceText: string | null,
          oldValueId: string | null,
          newValueId: string,
        ) =>
          logs.push({
            batchId,
            companyId,
            action: 'APPLY',
            entity,
            entityId,
            field,
            sourceText,
            oldValueId,
            newValueId,
          });

        for (const row of rows) {
          if (row.company_id && row.company_id !== companyId) continue;
          if (row.status === 'linked') continue;
          const approved = row.approved_code.trim();
          if (approved.toLowerCase() === 'skip') {
            skip(row, 'skip в approved_code');
            continue;
          }
          const raw =
            approved || (row.status === 'manual' ? '' : row.proposed_code);
          if (!raw) {
            skip(row, 'нужен ручной выбор (approved_code пуст)');
            continue;
          }
          const type = TYPE_BY_ENTITY[row.entity];
          let code: string;
          try {
            code = normalizeAttributeCode(type, raw);
          } catch (error) {
            if (error instanceof AttributeCodeError) {
              skip(row, `код ${raw}: ${error.message}`);
              continue;
            }
            throw error;
          }
          const group =
            row.entity === 'color'
              ? null
              : row.entity === 'collection'
                ? 'COLLECTION'
                : row.entity === 'season'
                  ? 'TIME_OF_YEAR'
                  : row.proposed_group || null;
          const value = await findOrCreateValue(
            tx,
            store,
            type,
            code,
            group,
            row,
            summary,
          );
          if (!value) {
            skip(row, `размер ${code}: укажите группу (proposed_group)`);
            continue;
          }

          if (row.entity === 'collection') {
            const products = await tx.$queryRaw<Array<{ id: number }>>`
              UPDATE "Product" SET "collectionValueId" = ${value.id}
              WHERE "companyId" = ${companyId} AND collection = ${row.legacy_id} AND "collectionValueId" IS NULL
              RETURNING id`;
            products.forEach((product) =>
              log(
                'Product',
                String(product.id),
                'collectionValueId',
                row.old_value,
                null,
                value.id,
              ),
            );
            summary.linkedProducts += products.length;
            continue;
          }

          // Raw SQL: only the link column changes, updatedAt stays as it was.
          const legacyTable = Prisma.raw(`"${LEGACY_TABLE[row.entity]}"`);
          const legacyUpdated = await tx.$executeRaw`
            UPDATE ${legacyTable} SET "attributeValueId" = ${value.id}
            WHERE id = ${row.legacy_id} AND "companyId" = ${companyId} AND "attributeValueId" IS NULL`;
          if (!legacyUpdated) {
            skip(row, 'строка уже привязана или не найдена');
            continue;
          }
          log(
            LEGACY_TABLE[row.entity],
            row.legacy_id,
            'attributeValueId',
            row.old_value,
            null,
            value.id,
          );
          summary.linkedLegacy += 1;

          if (row.entity === 'season') {
            const products = await tx.$queryRaw<Array<{ id: number }>>`
              UPDATE "Product" SET "seasonValueId" = ${value.id}
              WHERE "companyId" = ${companyId} AND "seasonOptionId" = ${row.legacy_id} AND "seasonValueId" IS NULL
              RETURNING id`;
            products.forEach((product) =>
              log(
                'Product',
                String(product.id),
                'seasonValueId',
                row.old_value,
                null,
                value.id,
              ),
            );
            summary.linkedProducts += products.length;
          } else {
            const field =
              row.entity === 'color' ? 'colorValueId' : 'sizeValueId';
            const legacyField = row.entity === 'color' ? 'colorId' : 'sizeId';
            const variants = await tx.$queryRaw<Array<{ id: string }>>`
              UPDATE "ProductVariant" SET ${Prisma.raw(`"${field}"`)} = ${value.id}
              WHERE "companyId" = ${companyId} AND ${Prisma.raw(`"${legacyField}"`)} = ${row.legacy_id}
                AND ${Prisma.raw(`"${field}"`)} IS NULL
              RETURNING id`;
            variants.forEach((variant) =>
              log(
                'ProductVariant',
                variant.id,
                field,
                row.old_value,
                null,
                value.id,
              ),
            );
            summary.linkedVariants += variants.length;
          }
        }

        for (let index = 0; index < logs.length; index += 1000) {
          await tx.attributeBindingLog.createMany({
            data: logs.slice(index, index + 1000),
          });
        }
        const after = await dataChecksum(tx, companyId);
        if (!sameChecksum(before, after)) {
          throw new Error('Данные товаров изменились бы — применение отменено');
        }
        if (!options.apply) throw new DryRun();
      },
      { timeout: 10 * 60 * 1000, maxWait: 60 * 1000 },
    );
    summary.applied = true;
  } catch (error) {
    if (!(error instanceof DryRun)) throw error;
  }
  return summary;
}

async function findOrCreateValue(
  tx: Prisma.TransactionClient,
  store: { companyId: string; sizeGroups: string[] },
  type: AttributeValueType,
  code: string,
  group: string | null,
  row: AuditRow,
  summary: ApplySummary,
) {
  const candidates = await tx.attributeValue.findMany({
    where: {
      type,
      code,
      OR: [
        {
          companyId: null,
          ...(type === 'SIZE' ? { group: { in: store.sizeGroups } } : {}),
        },
        { companyId: store.companyId },
      ],
    },
    orderBy: [{ isDefault: 'desc' }],
  });
  const matching = group
    ? candidates.filter(
        (value) => value.group === group || value.group === null,
      )
    : candidates;
  if (
    matching.length === 1 ||
    (matching.length > 1 && !group && type !== 'SIZE')
  )
    return matching[0];
  if (matching.length > 1) return null;
  if (type === 'SIZE' && (!group || !store.sizeGroups.includes(group)))
    return null;
  summary.createdValues += 1;
  return tx.attributeValue.create({
    data: {
      type,
      companyId: store.companyId,
      code,
      group,
      // A colour keeps the store's own name as its optional label.
      name: type === 'COLOR' ? row.old_value.slice(0, 60) || null : null,
      isDefault: false,
      sortOrder: 1000,
    },
  });
}

export type RollbackSummary = {
  batchId: string;
  applied: boolean;
  reverted: number;
  checksum: Awaited<ReturnType<typeof dataChecksum>>;
};

const ROLLBACK_TABLES: Record<
  string,
  { table: string; key: 'string' | 'int' }
> = {
  ProductColor: { table: 'ProductColor', key: 'string' },
  ProductSize: { table: 'ProductSize', key: 'string' },
  ProductSeasonOption: { table: 'ProductSeasonOption', key: 'string' },
  ProductVariant: { table: 'ProductVariant', key: 'string' },
  Product: { table: 'Product', key: 'int' },
};
const ROLLBACK_FIELDS = new Set([
  'attributeValueId',
  'colorValueId',
  'sizeValueId',
  'seasonValueId',
  'collectionValueId',
]);

/**
 * Reverts the logged links of one batch (or all batches of the company) to
 * their previous value and turns the company flag off. Only a column still
 * holding the logged value is reverted. Values the store created stay.
 */
export async function rollbackCompany(
  db: PrismaClient,
  companyId: string,
  options: { apply: boolean; batchId?: string },
): Promise<RollbackSummary> {
  const batchId = randomUUID();
  const summary: RollbackSummary = {
    batchId,
    applied: false,
    reverted: 0,
    checksum: await dataChecksum(db, companyId),
  };
  try {
    await db.$transaction(
      async (tx) => {
        const before = await dataChecksum(tx, companyId);
        const logs = await tx.attributeBindingLog.findMany({
          where: {
            companyId,
            action: { in: ['APPLY', 'LINK'] },
            ...(options.batchId ? { batchId: options.batchId } : {}),
          },
          orderBy: { createdAt: 'desc' },
        });
        const rollbackLogs: Prisma.AttributeBindingLogCreateManyInput[] = [];
        for (const entry of logs) {
          const target = ROLLBACK_TABLES[entry.entity];
          if (!target || !ROLLBACK_FIELDS.has(entry.field)) continue;
          const id =
            target.key === 'int' ? Number(entry.entityId) : entry.entityId;
          // Identifiers come from the fixed maps above, never from the log text.
          const count = await tx.$executeRawUnsafe(
            `UPDATE "${target.table}" SET "${entry.field}" = $1 WHERE id = $2 AND "${entry.field}" = $3`,
            entry.oldValueId,
            id,
            entry.newValueId,
          );
          if (count) {
            summary.reverted += count;
            rollbackLogs.push({
              batchId,
              companyId,
              action: 'ROLLBACK',
              entity: entry.entity,
              entityId: entry.entityId,
              field: entry.field,
              sourceText: entry.batchId,
              oldValueId: entry.newValueId,
              newValueId: entry.oldValueId,
            });
          }
        }
        for (let index = 0; index < rollbackLogs.length; index += 1000) {
          await tx.attributeBindingLog.createMany({
            data: rollbackLogs.slice(index, index + 1000),
          });
        }
        await tx.company.update({
          where: { id: companyId },
          data: { useAttributeDictionaries: false },
        });
        const after = await dataChecksum(tx, companyId);
        if (!sameChecksum(before, after))
          throw new Error('Данные товаров изменились бы — откат отменён');
        if (!options.apply) throw new DryRun();
      },
      { timeout: 10 * 60 * 1000, maxWait: 60 * 1000 },
    );
    summary.applied = true;
  } catch (error) {
    if (!(error instanceof DryRun)) throw error;
  }
  return summary;
}

// ---- CSV ---------------------------------------------------------------------

function csvCell(value: unknown) {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\n\r;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv<T extends Record<string, unknown>>(
  rows: T[],
  columns: Array<keyof T>,
) {
  // BOM: Excel opens the UTF-8 file with Cyrillic intact.
  return (
    '\uFEFF' +
    [
      columns.join(','),
      ...rows.map((row) =>
        columns.map((column) => csvCell(row[column])).join(','),
      ),
    ].join('\n') +
    '\n'
  );
}

export function parseCsv(text: string): Array<Record<string, string>> {
  const source = text.replace(/^\uFEFF/, '');
  const records: string[][] = [];
  let field = '';
  let record: string[] = [];
  let quoted = false;
  // Excel saves with ";" in some locales.
  const firstLine = source.split(/\r?\n/, 1)[0];
  const separator =
    firstLine.split(';').length > firstLine.split(',').length ? ';' : ',';
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quoted) {
      if (char === '"' && source[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === separator) {
      record.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && source[index + 1] === '\n') index += 1;
      record.push(field);
      records.push(record);
      record = [];
      field = '';
    } else field += char;
  }
  if (field || record.length) {
    record.push(field);
    records.push(record);
  }
  const [header, ...body] = records.filter((row) =>
    row.some((cell) => cell.trim()),
  );
  if (!header) return [];
  return body.map((cells) =>
    Object.fromEntries(
      header.map((name, index) => [name.trim(), cells[index] ?? '']),
    ),
  );
}

export function auditRowsFromCsv(text: string): AuditRow[] {
  return parseCsv(text).map((record) => ({
    company_id: record.company_id ?? '',
    entity: record.entity as AuditEntity,
    legacy_id: record.legacy_id ?? '',
    old_value: record.old_value ?? '',
    old_code: record.old_code ?? '',
    old_hex: record.old_hex ?? '',
    used_in: Number(record.used_in) || 0,
    status: (record.status ?? 'manual') as AuditRow['status'],
    proposed_code: record.proposed_code ?? '',
    proposed_group: record.proposed_group ?? '',
    proposed_name: record.proposed_name ?? '',
    note: record.note ?? '',
    approved_code: record.approved_code ?? '',
  }));
}
