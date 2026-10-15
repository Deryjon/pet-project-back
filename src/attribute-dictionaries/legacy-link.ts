import { randomUUID } from 'crypto';
import { ConflictException } from '@nestjs/common';
import { AttributeValue, Prisma } from '@prisma/client';
import {
  matchLegacyColor,
  matchLegacySeason,
  matchLegacySize,
} from './legacy-matching';
import { SEASON_LABELS } from './system-values';

export type LegacyLink =
  | {
      kind: 'color' | 'size' | 'season';
      legacyId: string;
      legacyCode: string;
      pending?: false;
    }
  | { kind: 'collection'; collection: string; pending?: false }
  /** No legacy row yet; one is created on write. */
  | { kind: 'color' | 'size' | 'season'; pending: true };

type Store = { companyId: string; sizeGroups: string[] };

async function freeCode(
  base: string,
  find: (code: string) => Promise<unknown>,
) {
  for (let index = 1; index < 100; index += 1) {
    const code = index === 1 ? base : `${base}.${index}`;
    if (!(await find(code))) return code;
  }
  throw new ConflictException(
    'Не удалось подобрать код для старого справочника',
  );
}

/**
 * The legacy colour/size/season row standing for a dictionary value, so the
 * product form and the import keep saving colorId/sizeId/seasonOptionId while
 * the goods get the dictionary link (DB triggers). Reuses the row linked
 * before, then an unlinked row that matches (linking it and its goods), and
 * creates a row only when none does. Without `write` nothing is changed: an
 * unlinked match or a missing row is reported as it would be used.
 * A collection has no legacy row: the product keeps the code as text.
 */
export async function ensureLegacyLink(
  tx: Prisma.TransactionClient,
  store: Store,
  value: AttributeValue,
  options: { write: boolean; batchId?: string },
): Promise<LegacyLink> {
  const { companyId } = store;
  const id = value.id;
  const entry = [value];
  const batchId = options.batchId ?? randomUUID();
  const log = (entity: string, entityId: string, sourceText: string | null) =>
    tx.attributeBindingLog.create({
      data: {
        batchId,
        companyId,
        action: 'LINK',
        entity,
        entityId,
        field: 'attributeValueId',
        sourceText,
        newValueId: id,
      },
    });
  const usable = (status: string) => status === 'exact' || status === 'alias';

  if (value.type === 'COLOR') {
    const linked = await tx.productColor.findFirst({
      where: { companyId, attributeValueId: id },
    });
    if (linked)
      return { kind: 'color', legacyId: linked.id, legacyCode: linked.code };
    const candidates = await tx.productColor.findMany({
      where: { companyId, attributeValueId: null },
      orderBy: [{ isActive: 'desc' }, { sortOrder: 'asc' }],
    });
    const match = candidates.find((row) => {
      const result = matchLegacyColor(row, entry);
      return result.value?.id === id && usable(result.status);
    });
    if (match && !options.write)
      return { kind: 'color', legacyId: match.id, legacyCode: match.code };
    if (!options.write) return { kind: 'color', pending: true };
    if (match) {
      await tx.productColor.update({
        where: { id: match.id },
        data: { attributeValueId: id },
      });
      await log('ProductColor', match.id, match.name);
      await tx.productVariant.updateMany({
        where: { companyId, colorId: match.id, colorValueId: null },
        data: { colorValueId: id },
      });
      return { kind: 'color', legacyId: match.id, legacyCode: match.code };
    }
    const label = value.name ?? value.code;
    const name = (await tx.productColor.findFirst({
      where: { companyId, name: label },
    }))
      ? `${label} ${value.code}`
      : label;
    const created = await tx.productColor.create({
      data: {
        companyId,
        code: await freeCode(`D${value.code.slice(1)}`, (code) =>
          tx.productColor.findFirst({ where: { companyId, code } }),
        ),
        name,
        nameRu: name,
        nameUz: name,
        hex: value.code,
        sortOrder: value.sortOrder,
        attributeValueId: id,
      },
    });
    await log('ProductColor', created.id, null);
    return { kind: 'color', legacyId: created.id, legacyCode: created.code };
  }

  if (value.type === 'SIZE') {
    const linked = await tx.productSize.findFirst({
      where: { companyId, attributeValueId: id },
    });
    if (linked)
      return { kind: 'size', legacyId: linked.id, legacyCode: linked.code };
    const kind = value.group === 'NUM_SHOES' ? 'SHOES' : 'CLOTHING';
    const candidates = await tx.productSize.findMany({
      where: { companyId, attributeValueId: null },
      orderBy: [{ isActive: 'desc' }, { sortOrder: 'asc' }],
    });
    const match = candidates.find((row) => {
      const result = matchLegacySize(row, entry, store.sizeGroups);
      return result.value?.id === id && usable(result.status);
    });
    if (match && !options.write)
      return { kind: 'size', legacyId: match.id, legacyCode: match.code };
    if (!options.write) return { kind: 'size', pending: true };
    if (match) {
      await tx.productSize.update({
        where: { id: match.id },
        data: { attributeValueId: id },
      });
      await log('ProductSize', match.id, match.name);
      await tx.productVariant.updateMany({
        where: { companyId, sizeId: match.id, sizeValueId: null },
        data: { sizeValueId: id },
      });
      return { kind: 'size', legacyId: match.id, legacyCode: match.code };
    }
    const name = (await tx.productSize.findFirst({
      where: { companyId, type: kind, name: value.code },
    }))
      ? `${value.code} (${value.group ?? kind})`
      : value.code;
    const created = await tx.productSize.create({
      data: {
        companyId,
        code: await freeCode(
          kind === 'SHOES' ? `S${value.code}` : value.code,
          (code) => tx.productSize.findFirst({ where: { companyId, code } }),
        ),
        name,
        nameRu: name,
        nameUz: name,
        kind,
        type: kind,
        sortOrder: value.sortOrder,
        attributeValueId: id,
      },
    });
    await log('ProductSize', created.id, null);
    return { kind: 'size', legacyId: created.id, legacyCode: created.code };
  }

  if (value.group === 'COLLECTION')
    return { kind: 'collection', collection: value.code };

  const linked = await tx.productSeasonOption.findFirst({
    where: { companyId, attributeValueId: id },
  });
  if (linked)
    return { kind: 'season', legacyId: linked.id, legacyCode: linked.code };
  const candidates = await tx.productSeasonOption.findMany({
    where: { companyId, attributeValueId: null },
  });
  const match = candidates.find((row) => {
    const result = matchLegacySeason(row, entry);
    return result.value?.id === id && usable(result.status);
  });
  if (match && !options.write)
    return { kind: 'season', legacyId: match.id, legacyCode: match.code };
  if (!options.write) return { kind: 'season', pending: true };
  if (match) {
    await tx.productSeasonOption.update({
      where: { id: match.id },
      data: { attributeValueId: id },
    });
    await log('ProductSeasonOption', match.id, match.nameRu);
    await tx.product.updateMany({
      where: { companyId, seasonOptionId: match.id, seasonValueId: null },
      data: { seasonValueId: id },
    });
    return { kind: 'season', legacyId: match.id, legacyCode: match.code };
  }
  const label = SEASON_LABELS[value.code];
  const created = await tx.productSeasonOption.create({
    data: {
      companyId,
      code: await freeCode(value.code, (code) =>
        tx.productSeasonOption.findFirst({ where: { companyId, code } }),
      ),
      nameRu: value.name ?? label?.ru ?? value.code,
      nameUz: value.name ?? label?.uz ?? value.code,
      sortOrder: value.sortOrder,
      attributeValueId: id,
    },
  });
  await log('ProductSeasonOption', created.id, null);
  return { kind: 'season', legacyId: created.id, legacyCode: created.code };
}
