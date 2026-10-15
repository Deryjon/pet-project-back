import { AttributeValue, Prisma, PrismaClient } from '@prisma/client';
import { ensureLegacyLink } from './legacy-link';
import {
  normalizeColorCode,
  normalizeSizeCode,
} from './normalize-attribute-code';
import { sizeGroupsFor } from './system-values';

type Db = Prisma.TransactionClient | PrismaClient;

export type ImportDictionaryRow = {
  colorCode?: string | null;
  colorName?: string | null;
  sizeName?: string | null;
};

/**
 * Excel import of a store with useAttributeDictionaries: a colour or size of
 * the file is resolved through the shared dictionary ("2хл" → 2XL, "#fff" →
 * Белый) and rewritten to the code of its legacy row, which the import then
 * finds as before. A colour the legacy dictionary already knows is left as
 * is. Without `write` (preview) nothing is created; `colorPending` /
 * `sizePending` mean the legacy row will be created on import.
 * Stores without the flag are untouched.
 */
export async function applyDictionaryToImportRow(
  db: Db,
  companyId: string,
  row: ImportDictionaryRow,
  options: { write: boolean },
) {
  const result = { colorPending: false, sizePending: false };
  const company = await db.company.findUnique({
    where: { id: companyId },
    select: { storeType: true, useAttributeDictionaries: true },
  });
  const sizeGroups = company && sizeGroupsFor(company.storeType);
  if (!company?.useAttributeDictionaries || !sizeGroups) return result;
  const store = { companyId, sizeGroups };
  const visible = (
    extra: Prisma.AttributeValueWhereInput,
  ): Prisma.AttributeValueWhereInput => ({
    isActive: true,
    archivedAt: null,
    OR: [{ companyId: null }, { companyId }],
    ...extra,
  });
  // Writes run in the caller's import transaction.
  const link = (value: AttributeValue) =>
    ensureLegacyLink(db, store, value, options);

  const rawColor = (row.colorCode ?? row.colorName)?.trim();
  if (rawColor) {
    const legacy = await db.productColor.findFirst({
      where: {
        companyId,
        isActive: true,
        OR: [
          { code: rawColor.toUpperCase() },
          { name: { equals: rawColor, mode: 'insensitive' } },
          { nameRu: { equals: rawColor, mode: 'insensitive' } },
        ],
      },
      select: { id: true },
    });
    if (!legacy) {
      let hex: string | null = null;
      try {
        hex = normalizeColorCode(rawColor);
      } catch {
        hex = null;
      }
      const candidates = await db.attributeValue.findMany({
        where: visible({
          type: 'COLOR',
          ...(hex
            ? { code: hex }
            : { name: { equals: rawColor, mode: 'insensitive' } }),
        }),
        orderBy: { isDefault: 'desc' },
        take: 2,
      });
      if (candidates.length === 1 || (hex && candidates.length)) {
        const linked = await link(candidates[0]);
        if ('legacyCode' in linked) {
          row.colorCode = linked.legacyCode;
          row.colorName = linked.legacyCode;
        } else {
          result.colorPending = true;
        }
      }
    }
  }

  if (row.sizeName?.trim()) {
    let code: string | null = null;
    try {
      code = normalizeSizeCode(row.sizeName);
    } catch {
      code = null;
    }
    if (code) {
      const candidates = await db.attributeValue.findMany({
        where: visible({
          type: 'SIZE',
          code,
          OR: [{ companyId: null, group: { in: sizeGroups } }, { companyId }],
        }),
        orderBy: { isDefault: 'desc' },
      });
      // "42" in a clothing+shoes store is ambiguous: left to the legacy rules.
      if (candidates.length === 1) {
        const linked = await link(candidates[0]);
        if ('legacyCode' in linked) row.sizeName = linked.legacyCode;
        else result.sizePending = true;
      }
    }
  }
  return result;
}
