import { Prisma, StoreType } from '@prisma/client';

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
  const letters = [
    'XXS',
    'XS',
    'S',
    'M',
    'L',
    'XL',
    '2XL',
    '3XL',
    '4XL',
    '5XL',
  ];
  const russian = Array.from({ length: 11 }, (_, index) =>
    String(40 + index * 2),
  );
  return [
    ...letters.map((code) => ({ code, name: code })),
    ...russian.map((value) => ({ code: `R${value}`, name: `${value} (RU)` })),
    { code: 'ONE', name: 'ONE' },
  ];
}

function shoeSizes() {
  return Array.from({ length: 23 }, (_, index) => {
    const value = 35 + index / 2;
    return { code: String(value), name: String(value) };
  });
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
