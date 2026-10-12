import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

// Clears the "<article>-NN" codes the catalog used to generate for colour/size
// variants of apparel companies: variants share the product article and differ
// by barcode. Only codes of exactly that generated shape are touched; codes
// typed by people are reported and kept. Dry run unless --apply is passed.

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is not configured');
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

const applyChanges = process.argv.includes('--apply');
const requestedCompanyId = process.argv
  .find((arg) => arg.startsWith('--company-id='))
  ?.split('=')[1];

const APPAREL_STORE_TYPES = ['CLOTHING', 'SHOES', 'CLOTHING_SHOES'];

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function isGeneratedCode(
  sku: string,
  product: { id: number; article: string | null; sku: string | null },
) {
  const bases = [product.sku, product.article, `P${product.id}`].filter(
    (base): base is string => Boolean(base),
  );
  return bases.some((base) =>
    new RegExp(`^${escapeRegExp(base)}-\\d{2,}$`).test(sku),
  );
}

async function main() {
  const companies = await prisma.company.findMany({
    where: {
      ...(requestedCompanyId ? { id: requestedCompanyId } : {}),
      storeType: { in: APPAREL_STORE_TYPES as never },
    },
    select: { id: true, name: true },
  });

  let clearedTotal = 0;
  for (const company of companies) {
    const variants = await prisma.productVariant.findMany({
      where: {
        companyId: company.id,
        isDefault: false,
        sku: { not: null },
        OR: [{ colorId: { not: null } }, { sizeId: { not: null } }],
      },
      select: {
        id: true,
        sku: true,
        barcode: true,
        product: { select: { id: true, article: true, sku: true } },
      },
    });

    const generated = variants.filter((variant) =>
      isGeneratedCode(variant.sku ?? '', variant.product),
    );
    const kept = variants.filter(
      (variant) =>
        !generated.includes(variant) && variant.sku !== variant.product.article,
    );

    console.log(
      JSON.stringify(
        {
          company: { id: company.id, name: company.name },
          mode: applyChanges ? 'apply' : 'dry-run',
          toClear: generated.length,
          keptCustomCodes: kept.length,
          toClearList: generated.map((variant) => ({
            variantId: variant.id,
            productId: variant.product.id,
            article: variant.product.article,
            sku: variant.sku,
            barcode: variant.barcode,
          })),
          keptCustomCodesList: kept.map((variant) => ({
            variantId: variant.id,
            productId: variant.product.id,
            sku: variant.sku,
          })),
        },
        null,
        2,
      ),
    );

    if (applyChanges && generated.length) {
      const result = await prisma.productVariant.updateMany({
        where: {
          companyId: company.id,
          id: { in: generated.map((variant) => variant.id) },
        },
        data: { sku: null },
      });
      clearedTotal += result.count;
    }
  }

  console.log(
    applyChanges
      ? `Cleared ${clearedTotal} variant codes.`
      : 'Dry run: nothing was changed. Re-run with --apply to clear the codes listed above.',
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
