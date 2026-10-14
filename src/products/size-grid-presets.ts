import { ProductSizeSystem, ProductSizeType } from '@prisma/client';

/** Ready-made size grids offered when creating clothing/shoe products. */
export const SIZE_GRID_PRESETS: Array<{
  key: string;
  name: string;
  type: ProductSizeType;
  system: ProductSizeSystem | null;
  sizes: string[];
}> = [
  {
    key: 'clothing_letter',
    name: 'Одежда XS–XXL',
    type: 'CLOTHING',
    system: null,
    sizes: ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
  },
  {
    key: 'shoes',
    name: 'Обувь 36–45',
    type: 'SHOES',
    system: 'EU',
    sizes: ['36', '37', '38', '39', '40', '41', '42', '43', '44', '45'],
  },
];

/** Basic palette created for a company that has no colours yet. */
export const DEFAULT_PRODUCT_COLORS: Array<{ name: string; code: string; hex: string }> = [
  { name: 'Чёрный', code: 'BLACK', hex: '#000000' },
  { name: 'Белый', code: 'WHITE', hex: '#FFFFFF' },
  { name: 'Серый', code: 'GREY', hex: '#808080' },
  { name: 'Бежевый', code: 'BEIGE', hex: '#D8C3A5' },
  { name: 'Коричневый', code: 'BROWN', hex: '#6B4226' },
  { name: 'Синий', code: 'BLUE', hex: '#1E40AF' },
  { name: 'Голубой', code: 'LIGHTBLUE', hex: '#60A5FA' },
  { name: 'Красный', code: 'RED', hex: '#DC2626' },
  { name: 'Розовый', code: 'PINK', hex: '#F472B6' },
  { name: 'Зелёный', code: 'GREEN', hex: '#16A34A' },
  { name: 'Хаки', code: 'KHAKI', hex: '#78866B' },
  { name: 'Жёлтый', code: 'YELLOW', hex: '#FACC15' },
];

/**
 * Size codes are unique per company across clothing and shoes, so shoe sizes
 * that start with a digit get an "S" ("S42"), clothing keeps its name ("M").
 */
export function presetSizeCode(type: ProductSizeType, name: string) {
  const base = name.toUpperCase().replace(/[^A-Z0-9.]/g, '');
  return type === 'SHOES' && /^\d/.test(base) ? `S${base}` : base;
}
