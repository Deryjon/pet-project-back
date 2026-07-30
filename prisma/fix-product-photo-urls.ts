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

async function fixProductPhotoUrls() {
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

// User.avatarUrl is stored (and served) as an absolute URL — see
// buildAvatarUrl() in users.service.ts — unlike Product.photo it isn't
// rebuilt from a relative path at read time, so the fix here replaces the
// stale host with the current APP_URL rather than stripping it down to a
// relative path.
function toRebasedAvatarUrl(value: string, origin: string): string | null {
  const markerIndex = value.indexOf(UPLOADS_MARKER);
  if (markerIndex === -1) {
    return null;
  }

  return `${origin}${value.slice(markerIndex)}`;
}

async function fixUserAvatarUrls() {
  const origin = process.env.APP_URL?.trim();
  if (!origin) {
    console.log(
      '\nAPP_URL is not set in this environment — skipping User.avatarUrl backfill ' +
        '(nothing to rebase avatar URLs onto). Set APP_URL and re-run.',
    );
    return;
  }

  const candidates = await prisma.user.findMany({
    where: {
      avatarUrl: { contains: 'localhost' },
    },
    select: { id: true, firstName: true, lastName: true, avatarUrl: true },
  });

  console.log(`\nFound ${candidates.length} user(s) with a "localhost" avatarUrl`);

  const changes: { id: number; before: string; after: string }[] = [];
  for (const user of candidates) {
    const before = user.avatarUrl ?? '';
    const after = toRebasedAvatarUrl(before, origin);
    if (after && after !== before) {
      changes.push({ id: user.id, before, after });
    }
  }

  for (const change of changes) {
    console.log(`- user #${change.id}: "${change.before}" -> "${change.after}"`);
  }

  if (DRY_RUN || changes.length === 0) {
    console.log(DRY_RUN ? 'Dry run — no changes written.' : 'Nothing to update.');
    return;
  }

  await prisma.$transaction(
    changes.map((change) =>
      prisma.user.update({
        where: { id: change.id },
        data: { avatarUrl: change.after },
      }),
    ),
  );

  console.log(`Updated ${changes.length} user(s) avatarUrl to the current APP_URL.`);
}

async function main() {
  await fixProductPhotoUrls();
  await fixUserAvatarUrls();
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
