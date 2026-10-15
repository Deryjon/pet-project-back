import { Prisma, StoreType } from '@prisma/client';
import {
  SIMILAR_COLOR_DISTANCE,
  colorDistance,
} from '../attribute-dictionaries/normalize-attribute-code';
import { SYSTEM_COLORS } from '../attribute-dictionaries/system-values';
import { hexKey, nameKey } from './dictionary-names';

export const APPAREL_STORE_TYPES: StoreType[] = [
  'CLOTHING',
  'SHOES',
  'CLOTHING_SHOES',
];

export const DEFAULT_PRODUCT_COLORS = [
  ['BLK', 'Чёрный', 'Qora', '#000000'],
  ['WHT', 'Белый', 'Oq', '#FFFFFF'],
  ['GRY', 'Серый', 'Kulrang', '#808080'],
  ['GRF', 'Графит', 'Grafit', '#3A3A3C'],
  ['MLK', 'Молочный', 'Sutrang', '#F5F0E6'],
  ['BEG', 'Бежевый', 'Bej', '#D8C3A5'],
  ['BRN', 'Коричневый', 'Jigarrang', '#6F4E37'],
  ['NVY', 'Тёмно-синий', "To'q ko'k", '#1F2A44'],
  ['BLU', 'Синий', "Ko'k", '#1E5BC6'],
  ['LBL', 'Голубой', 'Havorang', '#8EC5FF'],
  ['RED', 'Красный', 'Qizil', '#D32F2F'],
  ['BRD', 'Бордовый', 'Bordo', '#7B1E2B'],
  ['PNK', 'Розовый', 'Pushti', '#F4A7C0'],
  ['PRP', 'Фиолетовый', 'Binafsha', '#7E57C2'],
  ['GRN', 'Зелёный', 'Yashil', '#2E7D32'],
  ['KHK', 'Хаки', 'Xaki', '#7C7A4F'],
  ['OLV', 'Оливковый', 'Zaytunrang', '#708238'],
  ['YLW', 'Жёлтый', 'Sariq', '#F9D71C'],
  ['ORG', 'Оранжевый', "To'q sariq", '#F57C00'],
  ['MLT', 'Мультиколор', 'Rang-barang', null],
] as const;

export const DEFAULT_PRODUCT_SEASONS = [
  ['SUMMER', 'Лето', 'Yoz'],
  ['WINTER', 'Зима', 'Qish'],
  ['DEMI', 'Демисезон', 'Mavsumlararo'],
  ['ALL', 'Всесезон', 'Barcha mavsum'],
] as const;

function clothingSizes() {
  return ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL'].map((code) => ({
    code,
    name: code,
  }));
}

function shoeSizes() {
  return Array.from({ length: 10 }, (_, index) => {
    const value = 36 + index;
    return { code: String(value), name: String(value) };
  });
}

type StoredColor = { id: string; name: string; nameRu: string | null; hex: string | null };

/**
 * The 50 system colours (TZ 15.10.2026) a store is missing. A system colour
 * the store already has — same name, same HEX or a near-identical HEX — is
 * not added again; existing colours are never changed.
 */
export function missingSystemColors(stored: StoredColor[]) {
  const added: Array<{ name: string; hex: string }> = [];
  const skipped: Array<{ name: string; hex: string; existing: string }> = [];
  const known = stored.map((color) => ({
    label: color.name,
    keys: [color.name, color.nameRu].filter(Boolean).map(nameKey),
    hex: hexKey(color.hex),
  }));
  for (const [name, hex] of SYSTEM_COLORS) {
    const twin = known.find(
      (color) =>
        color.keys.includes(nameKey(name)) ||
        (color.hex &&
          (color.hex === hex || colorDistance(color.hex, hex) < SIMILAR_COLOR_DISTANCE)),
    );
    if (twin) {
      skipped.push({ name, hex, existing: twin.label });
      continue;
    }
    // Not added to `known`: several system colours are close to each other on
    // purpose, only the store's own colours count as "already there".
    added.push({ name, hex });
  }
  return { added, skipped };
}

/** Adds the missing system colours; returns what was added and skipped. */
export async function ensureSystemColors(
  tx: Prisma.TransactionClient,
  companyId: string,
  options: { write: boolean } = { write: true },
) {
  const stored = await tx.productColor.findMany({
    where: { companyId },
    select: { id: true, name: true, nameRu: true, hex: true, code: true, sortOrder: true },
  });
  const result = missingSystemColors(stored);
  if (!options.write || !result.added.length) return result;
  const takenCodes = new Set(stored.map((color) => color.code));
  const order = Math.max(0, ...stored.map((color) => color.sortOrder)) + 10;
  await tx.productColor.createMany({
    data: result.added.map(({ name, hex }, index) => {
      // Same code scheme as the dictionary link (legacy-link.ts).
      const base = `D${hex.slice(1)}`;
      return {
        companyId,
        code: takenCodes.has(base) ? `${base}.2` : base,
        name,
        nameRu: name,
        nameUz: name,
        hex,
        sortOrder: order + index * 10,
        isActive: true,
      };
    }),
    skipDuplicates: true,
  });
  return result;
}

export async function seedStoreDefaults(
  tx: Prisma.TransactionClient,
  companyId: string,
  storeType: StoreType,
) {
  if (!APPAREL_STORE_TYPES.includes(storeType)) return;

  await tx.productColor.createMany({
    data: DEFAULT_PRODUCT_COLORS.map(
      ([code, nameRu, nameUz, hex], sortOrder) => ({
        companyId,
        code,
        name: nameRu,
        nameRu,
        nameUz,
        hex,
        sortOrder,
        isActive: true,
      }),
    ),
    skipDuplicates: true,
  });
  await ensureSystemColors(tx, companyId);

  const sizes = [
    ...((['CLOTHING', 'CLOTHING_SHOES'] as StoreType[]).includes(storeType)
      ? clothingSizes().map((item) => ({ ...item, kind: 'CLOTHING' as const }))
      : []),
    ...((['SHOES', 'CLOTHING_SHOES'] as StoreType[]).includes(storeType)
      ? shoeSizes().map((item) => ({ ...item, kind: 'SHOES' as const }))
      : []),
  ];
  await tx.productSize.createMany({
    data: sizes.map((item, sortOrder) => ({
      companyId,
      code: item.code,
      name: item.name,
      nameRu: item.name,
      nameUz: item.name,
      kind: item.kind,
      type: item.kind,
      sortOrder,
      isActive: true,
    })),
    skipDuplicates: true,
  });

  await tx.productSeasonOption.createMany({
    data: DEFAULT_PRODUCT_SEASONS.map(([code, nameRu, nameUz], sortOrder) => ({
      companyId,
      code,
      nameRu,
      nameUz,
      sortOrder,
      isActive: true,
    })),
    skipDuplicates: true,
  });
}
