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
    name: 'Одежда XS–3XL',
    type: 'CLOTHING',
    system: null,
    sizes: ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL'],
  },
  {
    key: 'clothing_numeric',
    name: 'Одежда 40–58',
    type: 'CLOTHING',
    system: null,
    sizes: ['40', '42', '44', '46', '48', '50', '52', '54', '56', '58'],
  },
  {
    key: 'shoes',
    name: 'Обувь 35–46',
    type: 'SHOES',
    system: 'EU',
    sizes: ['35', '36', '37', '38', '39', '40', '41', '42', '43', '44', '45', '46'],
  },
  {
    key: 'kids',
    name: 'Детская 86–164',
    type: 'CLOTHING',
    system: null,
    sizes: ['86', '92', '98', '104', '110', '116', '122', '128', '134', '140', '146', '152', '158', '164'],
  },
];

/** Basic palette created for a company that has no colours yet. */
export const DEFAULT_PRODUCT_COLORS: Array<{ name: string; code: string }> = [
  { name: 'Чёрный', code: '#000000' },
  { name: 'Белый', code: '#FFFFFF' },
  { name: 'Серый', code: '#808080' },
  { name: 'Бежевый', code: '#D8C3A5' },
  { name: 'Коричневый', code: '#6B4226' },
  { name: 'Синий', code: '#1E40AF' },
  { name: 'Голубой', code: '#60A5FA' },
  { name: 'Красный', code: '#DC2626' },
  { name: 'Розовый', code: '#F472B6' },
  { name: 'Зелёный', code: '#16A34A' },
  { name: 'Хаки', code: '#78866B' },
  { name: 'Жёлтый', code: '#FACC15' },
];
