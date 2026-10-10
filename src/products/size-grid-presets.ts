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
