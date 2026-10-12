import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

// Read-only report for apparel companies: variants carrying their own codes
// instead of the model article, and models split into several products with
// different articles. It never writes; a repair is planned from its output.

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is not configured');
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

const requestedCompanyId = process.argv
  .find((arg) => arg.startsWith('--company-id='))
  ?.split('=')[1];

const APPAREL_STORE_TYPES = ['CLOTHING', 'SHOES', 'CLOTHING_SHOES'];

async function main() {
  const companies = await prisma.company.findMany({
    where: {
      ...(requestedCompanyId ? { id: requestedCompanyId } : {}),
      storeType: { in: APPAREL_STORE_TYPES as never },
    },
    select: { id: true, name: true },
  });

  for (const company of companies) {
    const products = await prisma.product.findMany({
      where: { companyId: company.id, archivedAt: null },
      select: {
        id: true,
        name: true,
        article: true,
        brandId: true,
        variants: {
          where: { isActive: true, isDefault: false },
          select: {
            id: true,
            sku: true,
            barcode: true,
            color: { select: { code: true } },
            size: { select: { code: true } },
          },
        },
      },
    });

    const ownCodeVariants = products.flatMap((product) =>
      product.variants
        .filter((variant) => variant.sku && variant.sku !== product.article)
        .map((variant) => ({
          productId: product.id,
          article: product.article,
          variantId: variant.id,
          variantSku: variant.sku,
          barcode: variant.barcode,
          color: variant.color?.code ?? null,
          size: variant.size?.code ?? null,
        })),
    );

    const byModel = new Map<string, typeof products>();
    for (const product of products) {
      const key = `${product.name.trim().toLowerCase()}\u0000${product.brandId ?? ''}`;
      byModel.set(key, [...(byModel.get(key) ?? []), product]);
    }
    const splitModels = [...byModel.values()]
      .filter(
        (group) =>
          group.length > 1 &&
          new Set(group.map((product) => product.article)).size > 1,
      )
      .map((group) => ({
        name: group[0].name,
        products: group.map((product) => ({
          id: product.id,
          article: product.article,
          variants: product.variants.length,
        })),
      }));

    console.log(
      JSON.stringify(
        {
          company: { id: company.id, name: company.name },
          productsChecked: products.length,
          variantsWithOwnCode: ownCodeVariants.length,
          splitModelGroups: splitModels.length,
          variantsWithOwnCodeSample: ownCodeVariants.slice(0, 50),
          splitModelsSample: splitModels.slice(0, 50),
        },
        null,
        2,
      ),
    );
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
