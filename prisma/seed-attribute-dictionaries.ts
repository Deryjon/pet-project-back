import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { seedSystemAttributeValues } from '../src/attribute-dictionaries/seed-system-values';

// Seeds the system colours, sizes and seasons (companyId NULL). Safe to run
// again: existing values are skipped, nothing of the stores is touched.
// Run yearly to add the next SS/FW collections:
//   npm run attributes:seed [-- --year=2027]

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is not configured');

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});
const yearArg = process.argv
  .find((arg) => arg.startsWith('--year='))
  ?.split('=')[1];

async function main() {
  const year = yearArg ? Number(yearArg) : new Date().getFullYear();
  if (!Number.isInteger(year)) throw new Error('--year must be a number');
  const inserted = await seedSystemAttributeValues(prisma, year);
  const total = await prisma.attributeValue.count({
    where: { companyId: null },
  });
  console.log(
    `System attribute values: ${inserted} inserted, ${total} in total.`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
