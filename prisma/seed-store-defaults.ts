import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DEFAULT_COLORS = [
  { code: 'BLK', nameRu: 'Чёрный', nameUz: 'Qora', hex: '#000000' },
  { code: 'WHT', nameRu: 'Белый', nameUz: 'Oq', hex: '#FFFFFF' },
  { code: 'GRY', nameRu: 'Серый', nameUz: 'Kulrang', hex: '#808080' },
  { code: 'GRF', nameRu: 'Графит', nameUz: 'Grafit', hex: '#3A3A3C' },
  { code: 'MLK', nameRu: 'Молочный', nameUz: 'Sutrang', hex: '#F5F0E6' },
  { code: 'BEG', nameRu: 'Бежевый', nameUz: 'Bej', hex: '#D8C3A5' },
  { code: 'BRN', nameRu: 'Коричневый', nameUz: 'Jigarrang', hex: '#6F4E37' },
  { code: 'NVY', nameRu: 'Тёмно-синий', nameUz: "To'q ko'k", hex: '#1F2A44' },
  { code: 'BLU', nameRu: 'Синий', nameUz: "Ko'k", hex: '#1E5BC6' },
  { code: 'LBL', nameRu: 'Голубой', nameUz: 'Havorang', hex: '#8EC5FF' },
  { code: 'RED', nameRu: 'Красный', nameUz: 'Qizil', hex: '#D32F2F' },
  { code: 'BRD', nameRu: 'Бордовый', nameUz: 'Bordo', hex: '#7B1E2B' },
  { code: 'PNK', nameRu: 'Розовый', nameUz: 'Pushti', hex: '#F4A7C0' },
  { code: 'PRP', nameRu: 'Фиолетовый', nameUz: 'Binafsha', hex: '#7E57C2' },
  { code: 'GRN', nameRu: 'Зелёный', nameUz: 'Yashil', hex: '#2E7D32' },
  { code: 'KHK', nameRu: 'Хаки', nameUz: 'Xaki', hex: '#7C7A4F' },
  { code: 'OLV', nameRu: 'Оливковый', nameUz: 'Zaytunrang', hex: '#708238' },
  { code: 'YLW', nameRu: 'Жёлтый', nameUz: 'Sariq', hex: '#F9D71C' },
  { code: 'ORG', nameRu: 'Оранжевый', nameUz: "To'q sariq", hex: '#F57C00' },
  { code: 'MLT', nameRu: 'Мультиколор', nameUz: 'Rang-barang', hex: null },
];

const DEFAULT_SIZES_CLOTHING = [
  { code: 'XXS', name: 'XXS', sortOrder: 0, kind: 'CLOTHING' },
  { code: 'XS', name: 'XS', sortOrder: 1, kind: 'CLOTHING' },
  { code: 'S', name: 'S', sortOrder: 2, kind: 'CLOTHING' },
  { code: 'M', name: 'M', sortOrder: 3, kind: 'CLOTHING' },
  { code: 'L', name: 'L', sortOrder: 4, kind: 'CLOTHING' },
  { code: 'XL', name: 'XL', sortOrder: 5, kind: 'CLOTHING' },
  { code: '2XL', name: '2XL', sortOrder: 6, kind: 'CLOTHING' },
  { code: '3XL', name: '3XL', sortOrder: 7, kind: 'CLOTHING' },
  { code: '4XL', name: '4XL', sortOrder: 8, kind: 'CLOTHING' },
  { code: '5XL', name: '5XL', sortOrder: 9, kind: 'CLOTHING' },
  { code: 'R40', name: '40 (RU)', sortOrder: 10, kind: 'CLOTHING' },
  { code: 'R42', name: '42 (RU)', sortOrder: 11, kind: 'CLOTHING' },
  { code: 'R44', name: '44 (RU)', sortOrder: 12, kind: 'CLOTHING' },
  { code: 'R46', name: '46 (RU)', sortOrder: 13, kind: 'CLOTHING' },
  { code: 'R48', name: '48 (RU)', sortOrder: 14, kind: 'CLOTHING' },
  { code: 'R50', name: '50 (RU)', sortOrder: 15, kind: 'CLOTHING' },
  { code: 'R52', name: '52 (RU)', sortOrder: 16, kind: 'CLOTHING' },
  { code: 'R54', name: '54 (RU)', sortOrder: 17, kind: 'CLOTHING' },
  { code: 'R56', name: '56 (RU)', sortOrder: 18, kind: 'CLOTHING' },
  { code: 'R58', name: '58 (RU)', sortOrder: 19, kind: 'CLOTHING' },
  { code: 'R60', name: '60 (RU)', sortOrder: 20, kind: 'CLOTHING' },
  { code: 'ONE', name: 'ONE', sortOrder: 21, kind: 'CLOTHING' },
];

const DEFAULT_SIZES_SHOES = [
  { code: '35', name: '35', sortOrder: 0, kind: 'SHOES' },
  { code: '35.5', name: '35.5', sortOrder: 1, kind: 'SHOES' },
  { code: '36', name: '36', sortOrder: 2, kind: 'SHOES' },
  { code: '36.5', name: '36.5', sortOrder: 3, kind: 'SHOES' },
  { code: '37', name: '37', sortOrder: 4, kind: 'SHOES' },
  { code: '37.5', name: '37.5', sortOrder: 5, kind: 'SHOES' },
  { code: '38', name: '38', sortOrder: 6, kind: 'SHOES' },
  { code: '38.5', name: '38.5', sortOrder: 7, kind: 'SHOES' },
  { code: '39', name: '39', sortOrder: 8, kind: 'SHOES' },
  { code: '39.5', name: '39.5', sortOrder: 9, kind: 'SHOES' },
  { code: '40', name: '40', sortOrder: 10, kind: 'SHOES' },
  { code: '40.5', name: '40.5', sortOrder: 11, kind: 'SHOES' },
  { code: '41', name: '41', sortOrder: 12, kind: 'SHOES' },
  { code: '41.5', name: '41.5', sortOrder: 13, kind: 'SHOES' },
  { code: '42', name: '42', sortOrder: 14, kind: 'SHOES' },
  { code: '42.5', name: '42.5', sortOrder: 15, kind: 'SHOES' },
  { code: '43', name: '43', sortOrder: 16, kind: 'SHOES' },
  { code: '43.5', name: '43.5', sortOrder: 17, kind: 'SHOES' },
  { code: '44', name: '44', sortOrder: 18, kind: 'SHOES' },
  { code: '44.5', name: '44.5', sortOrder: 19, kind: 'SHOES' },
  { code: '45', name: '45', sortOrder: 20, kind: 'SHOES' },
  { code: '45.5', name: '45.5', sortOrder: 21, kind: 'SHOES' },
  { code: '46', name: '46', sortOrder: 22, kind: 'SHOES' },
];

async function seedForCompany(companyId: string, storeType: string) {
  console.log(`Seeding defaults for company ${companyId} (${storeType})`);

  // Create default colors
  for (const color of DEFAULT_COLORS) {
    const existing = await prisma.productColor.findFirst({
      where: { companyId, code: color.code },
    });

    if (!existing) {
      await prisma.productColor.create({
        data: {
          companyId,
          code: color.code,
          name: color.nameRu,
          hex: color.hex,
          isActive: true,
        },
      });
    }
  }

  // Create default sizes based on storeType
  const sizes = ['CLOTHING', 'CLOTHING_SHOES'].includes(storeType)
    ? [...DEFAULT_SIZES_CLOTHING]
    : [];

  if (['SHOES', 'CLOTHING_SHOES'].includes(storeType)) {
    sizes.push(...DEFAULT_SIZES_SHOES);
  }

  for (const size of sizes) {
    const existing = await prisma.productSize.findFirst({
      where: { companyId, code: size.code },
    });

    if (!existing) {
      await prisma.productSize.create({
        data: {
          companyId,
          code: size.code,
          name: size.name,
          kind: size.kind as 'CLOTHING' | 'SHOES',
          type: 'OTHER',
          sortOrder: size.sortOrder,
          isActive: true,
        },
      });
    }
  }

  console.log(`✓ Seeded defaults for company ${companyId}`);
}

async function main() {
  try {
    const companies = await prisma.company.findMany({
      where: {
        storeType: {
          in: ['CLOTHING', 'SHOES', 'CLOTHING_SHOES'],
        },
      },
    });

    for (const company of companies) {
      await seedForCompany(company.id, company.storeType);
    }

    console.log('✓ Seeding completed');
  } catch (error) {
    console.error('Error during seeding:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
