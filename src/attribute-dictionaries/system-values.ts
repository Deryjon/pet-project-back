import { AttributeValueType, StoreType } from '@prisma/client';

// System values of the shared dictionaries (TZ 15.10.2026). Seeded once with
// companyId NULL; stores hide or reorder them through StoreAttributeSetting.

export type SystemValue = {
  type: AttributeValueType;
  code: string;
  name: string | null;
  group: string | null;
  sortOrder: number;
};

export const SIZE_GROUPS = [
  'LETTER',
  'NUM_BOTTOM',
  'NUM_TOP',
  'NUM_SHOES',
] as const;
export const SEASON_GROUPS = ['TIME_OF_YEAR', 'COLLECTION'] as const;
export type SizeGroup = (typeof SIZE_GROUPS)[number];
export type SeasonGroup = (typeof SEASON_GROUPS)[number];

export const SYSTEM_COLORS: Array<[name: string, hex: string]> = [
  ['Белый', '#FFFFFF'],
  ['Чёрный', '#000000'],
  ['Серый', '#808080'],
  ['Светло-серый', '#D3D3D3'],
  ['Тёмно-серый', '#404040'],
  ['Графитовый', '#36454F'],
  ['Бежевый', '#F5F5DC'],
  ['Молочный', '#FFF8E7'],
  ['Кремовый', '#FFFDD0'],
  ['Песочный', '#C2B280'],
  ['Коричневый', '#8B4513'],
  ['Шоколадный', '#5C3317'],
  ['Кофейный', '#6F4E37'],
  ['Карамельный', '#C68E17'],
  ['Красный', '#FF0000'],
  ['Тёмно-красный', '#8B0000'],
  ['Бордовый', '#800020'],
  ['Алый', '#FF2400'],
  ['Коралловый', '#FF7F50'],
  ['Терракотовый', '#E2725B'],
  ['Розовый', '#FFC0CB'],
  ['Ярко-розовый', '#FF1493'],
  ['Пудровый', '#E8BEAC'],
  ['Фуксия', '#FF00FF'],
  ['Оранжевый', '#FFA500'],
  ['Персиковый', '#FFDAB9'],
  ['Жёлтый', '#FFFF00'],
  ['Горчичный', '#E1AD01'],
  ['Лимонный', '#FFF44F'],
  ['Золотой', '#D4AF37'],
  ['Зелёный', '#008000'],
  ['Светло-зелёный', '#90EE90'],
  ['Тёмно-зелёный', '#006400'],
  ['Оливковый', '#808000'],
  ['Хаки', '#78866B'],
  ['Мятный', '#98FF98'],
  ['Изумрудный', '#50C878'],
  ['Бутылочный', '#006A4E'],
  ['Бирюзовый', '#40E0D0'],
  ['Голубой', '#87CEEB'],
  ['Синий', '#0000FF'],
  ['Тёмно-синий', '#000080'],
  ['Джинсовый', '#1560BD'],
  ['Васильковый', '#6495ED'],
  ['Фиолетовый', '#800080'],
  ['Сиреневый', '#C8A2C8'],
  ['Лавандовый', '#E6E6FA'],
  ['Баклажановый', '#614051'],
  ['Серебряный', '#C0C0C0'],
  ['Бронзовый', '#CD7F32'],
];

function range(from: number, to: number, step = 1) {
  const values: string[] = [];
  for (let value = from; value <= to; value += step) values.push(String(value));
  return values;
}

export const SYSTEM_SIZES: Record<SizeGroup, string[]> = {
  LETTER: ['XXS', 'XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL'],
  NUM_BOTTOM: range(30, 42),
  NUM_TOP: range(48, 58, 2),
  NUM_SHOES: range(35, 47),
};

export const TIME_OF_YEAR_CODES = [
  'SPRING',
  'SUMMER',
  'AUTUMN',
  'WINTER',
  'DEMI',
  'ALL',
];

/** Labels for legacy season rows; the interface translates codes itself. */
export const SEASON_LABELS: Record<string, { ru: string; uz: string }> = {
  SPRING: { ru: 'Весна', uz: 'Bahor' },
  SUMMER: { ru: 'Лето', uz: 'Yoz' },
  AUTUMN: { ru: 'Осень', uz: 'Kuz' },
  WINTER: { ru: 'Зима', uz: 'Qish' },
  DEMI: { ru: 'Демисезон', uz: 'Mavsumlararo' },
  ALL: { ru: 'Всесезон', uz: 'Barcha mavsum' },
};

/** SS/FW collections for the given year and the next one: 2026 → SS26 FW26 SS27 FW27. */
export function collectionCodes(year: number) {
  return [year, year + 1].flatMap((value) => {
    const yy = String(value % 100).padStart(2, '0');
    return [`SS${yy}`, `FW${yy}`];
  });
}

export function systemValues(year = new Date().getFullYear()): SystemValue[] {
  const colors = SYSTEM_COLORS.map(([name, hex], index) => ({
    type: 'COLOR' as const,
    code: hex,
    name,
    group: null,
    sortOrder: index * 10,
  }));
  let sizeOrder = 0;
  const sizes = SIZE_GROUPS.flatMap((group) =>
    SYSTEM_SIZES[group].map((code) => ({
      type: 'SIZE' as const,
      code,
      name: null,
      group,
      sortOrder: (sizeOrder += 10),
    })),
  );
  const seasons = [
    ...TIME_OF_YEAR_CODES.map((code, index) => ({
      type: 'SEASON' as const,
      code,
      name: null,
      group: 'TIME_OF_YEAR',
      sortOrder: index * 10,
    })),
    ...collectionCodes(year).map((code) => ({
      type: 'SEASON' as const,
      code,
      name: null,
      group: 'COLLECTION',
      sortOrder:
        1000 + Number(code.slice(2)) * 10 + (code.startsWith('FW') ? 5 : 0),
    })),
  ];
  return [...colors, ...sizes, ...seasons];
}

export const APPAREL_STORE_TYPES: StoreType[] = [
  'CLOTHING',
  'SHOES',
  'CLOTHING_SHOES',
];

/** Size groups a store type sees; null = the store has no dictionaries at all. */
export function sizeGroupsFor(storeType: StoreType): SizeGroup[] | null {
  switch (storeType) {
    case 'CLOTHING':
      return ['LETTER', 'NUM_BOTTOM', 'NUM_TOP'];
    case 'SHOES':
      return ['NUM_SHOES'];
    case 'CLOTHING_SHOES':
      return [...SIZE_GROUPS];
    default:
      return null;
  }
}
