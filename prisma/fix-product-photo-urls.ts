import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is not configured');
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

const DRY_RUN = process.argv.includes('--dry-run');
const UPLOADS_MARKER = '/uploads/';

// Converts any stored photo value that points at our own uploads directory
// into a relative path, regardless of which (possibly stale) host it was
// saved with — e.g. http://localhost:3001/uploads/products/x.jpg -> /uploads/products/x.jpg.
// Values that don't reference our uploads directory (external URLs, data URIs) are left untouched.
function toRelativePath(value: string): string | null {
  const markerIndex = value.indexOf(UPLOADS_MARKER);
  if (markerIndex === -1) {
    return null;
  }

  return value.slice(markerIndex);
}

async function main() {
  const candidates = await prisma.product.findMany({
    where: {
      photo: { contains: 'localhost' },
    },
    select: { id: true, publicId: true, name: true, photo: true },
  });

  console.log(`Found ${candidates.length} product(s) with a "localhost" photo URL`);

  const changes: { id: number; before: string; after: string }[] = [];
  for (const product of candidates) {
    const before = product.photo ?? '';
    const after = toRelativePath(before);
    if (after && after !== before) {
      changes.push({ id: product.id, before, after });
    }
  }

  for (const change of changes) {
    console.log(`- #${change.id}: "${change.before}" -> "${change.after}"`);
  }

  if (DRY_RUN || changes.length === 0) {
    console.log(DRY_RUN ? '\nDry run — no changes written.' : '\nNothing to update.');
    return;
  }

  await prisma.$transaction(
    changes.map((change) =>
      prisma.product.update({
        where: { id: change.id },
        data: { photo: change.after },
      }),
    ),
  );

  console.log(`\nUpdated ${changes.length} product(s) to relative photo paths.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
