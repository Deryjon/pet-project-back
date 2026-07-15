import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, Prisma } from '@prisma/client';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is not configured');
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

const SYNONYMS = ['unit', 'countable', 'piece', 'pieces', 'pcs', 'pc'];
const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  const candidates = await prisma.product.findMany({
    where: {
      OR: [
        { unit: { in: SYNONYMS, mode: 'insensitive' } },
        { unit: { in: SYNONYMS.map((s) => s.toUpperCase()) } },
      ],
    },
    select: { id: true, publicId: true, name: true, unit: true, metadata: true },
  });

  console.log(`Found ${candidates.length} product(s) with unit in [${SYNONYMS.join(', ')}]`);

  for (const product of candidates) {
    console.log(`- #${product.id} ${product.name} (unit="${product.unit}")`);
  }

  if (DRY_RUN || candidates.length === 0) {
    console.log(DRY_RUN ? '\nDry run — no changes written.' : '\nNothing to update.');
    return;
  }

  for (const product of candidates) {
    const metadata =
      product.metadata && typeof product.metadata === 'object' && !Array.isArray(product.metadata)
        ? (product.metadata as Record<string, unknown>)
        : {};

    const shortName = metadata.measurement_unit_short_name;
    const needsMetadataFix =
      typeof shortName === 'string' && SYNONYMS.includes(shortName.toLowerCase());

    await prisma.product.update({
      where: { id: product.id },
      data: {
        unit: 'шт',
        ...(needsMetadataFix
          ? {
              metadata: {
                ...metadata,
                measurement_unit_short_name: 'шт',
                measurement_unit_name: 'Штука',
              } as Prisma.InputJsonValue,
            }
          : {}),
      },
    });
  }

  console.log(`\nUpdated ${candidates.length} product(s) to unit="шт".`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
