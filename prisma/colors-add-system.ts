import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { ensureSystemColors } from '../src/common/store-defaults';

// Gives every clothing/shoe store the 50 system colours it is missing.
// Only adds rows to ProductColor: existing colours, goods, barcodes and stock
// are not touched. A colour the store already has (same name, same HEX or a
// near-identical HEX) is skipped and listed.
//   npm run colors:add-system -- [--company-id=<id>]            (dry run)
//   npm run colors:add-system -- [--company-id=<id>] --apply    (writes)
// Undo: delete the colours the run listed with «+» (by name and HEX) that no
// variant uses yet. Running it again adds nothing new.

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is not configured');
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});
const arg = (name: string) =>
  process.argv.find((item) => item.startsWith(`--${name}=`))?.split('=')[1];

async function main() {
  const write = process.argv.includes('--apply');
  const companyId = arg('company-id');
  const companies = await prisma.company.findMany({
    where: {
      ...(companyId ? { id: companyId } : {}),
      storeType: { in: ['CLOTHING', 'SHOES', 'CLOTHING_SHOES'] },
    },
    select: { id: true, name: true },
  });
  if (!companies.length) throw new Error('No clothing/shoe company found');

  for (const company of companies) {
    const { added, skipped } = await prisma.$transaction((tx) =>
      ensureSystemColors(tx, company.id, { write }),
    );
    console.log(
      `\n${company.name} (${company.id}): ${write ? 'added' : 'would add'} ${added.length}, already present ${skipped.length}`,
    );
    for (const color of added) console.log(`  + ${color.name} ${color.hex}`);
    for (const color of skipped)
      console.log(`  = ${color.name} ${color.hex} → «${color.existing}»`);
  }
  if (!write) console.log('\nDry run: nothing written. Add --apply to write.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
