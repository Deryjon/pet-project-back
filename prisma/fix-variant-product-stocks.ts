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

// Read-only unless --apply is passed.
const APPLY = process.argv.includes('--apply');

// Sales and transfers decrement both ProductStock and ProductVariantStock, so
// for a colour/size product ProductStock in a shop must equal the sum of its
// active variant stocks there. Products created through the catalog form got
// ProductStock = 0 (the form sent no product-level quantity), which made them
// unsellable ("Недостаточно остатка").
//
// - ProductStock < variant sum: the creation bug. ProductStock is raised to
//   the variant sum (variants hold the quantities the user actually entered).
// - ProductStock > variant sum: the product was sold without choosing a
//   colour/size, so the variants are overstated. Which size left the shop is
//   unknown — these are only reported and need a stock count.
async function fixVariantProductStocks() {
  const products = await prisma.product.findMany({
    where: {
      variants: {
        some: {
          isActive: true,
          OR: [{ colorId: { not: null } }, { sizeId: { not: null } }],
        },
      },
    },
    select: {
      id: true,
      name: true,
      companyId: true,
      stocks: true,
      variants: {
        where: {
          isActive: true,
          OR: [{ colorId: { not: null } }, { sizeId: { not: null } }],
        },
        select: { stocks: true },
      },
    },
  });

  console.log(`Found ${products.length} product(s) with colour/size variants`);

  const fixes: Array<{
    productId: number;
    shopId: string;
    branchCode: string;
    stockId: number | null;
    before: number;
    after: number;
    purchasePrice: number | null;
    salePrice: number | null;
  }> = [];
  const needsCount: string[] = [];

  for (const product of products) {
    const byShop = new Map<
      string,
      { branchCode: string; quantity: number; purchasePrice: number | null; salePrice: number | null }
    >();
    for (const stock of product.variants.flatMap((variant) => variant.stocks)) {
      const entry = byShop.get(stock.shopId) ?? {
        branchCode: stock.branchCode,
        quantity: 0,
        purchasePrice: stock.purchasePrice,
        salePrice: stock.salePrice,
      };
      entry.quantity += stock.quantity;
      byShop.set(stock.shopId, entry);
    }

    const shopIds = new Set([...byShop.keys(), ...product.stocks.map((s) => s.shopId)]);
    for (const shopId of shopIds) {
      const variantSum = byShop.get(shopId)?.quantity ?? 0;
      const productStock = product.stocks.find((s) => s.shopId === shopId);
      const current = productStock?.quantity ?? 0;
      if (current === variantSum) continue;

      const label = `#${product.id} "${product.name}" shop ${productStock?.branchCode ?? byShop.get(shopId)?.branchCode}`;
      if (current > variantSum) {
        needsCount.push(`${label}: total ${current} > sizes ${variantSum}`);
        continue;
      }
      const entry = byShop.get(shopId)!;
      fixes.push({
        productId: product.id,
        shopId,
        branchCode: productStock?.branchCode ?? entry.branchCode,
        stockId: productStock?.id ?? null,
        before: current,
        after: variantSum,
        purchasePrice: entry.purchasePrice,
        salePrice: entry.salePrice,
      });
      console.log(`- ${label}: ${current} -> ${variantSum}`);
    }
  }

  if (needsCount.length) {
    console.log(
      `\n${needsCount.length} shop row(s) sold without a colour/size — run a stock count (not changed):`,
    );
    for (const line of needsCount) console.log(`  ! ${line}`);
  }

  if (!APPLY || fixes.length === 0) {
    console.log(
      fixes.length === 0
        ? '\nNothing to fix.'
        : `\nDry run — ${fixes.length} row(s) would change. Re-run with --apply to write.`,
    );
    return;
  }

  const productIds = [...new Set(fixes.map((fix) => fix.productId))];
  await prisma.$transaction(async (tx) => {
    for (const fix of fixes) {
      if (fix.stockId) {
        await tx.productStock.update({
          where: { id: fix.stockId },
          data: { quantity: fix.after },
        });
      } else {
        await tx.productStock.create({
          data: {
            productId: fix.productId,
            shopId: fix.shopId,
            branchCode: fix.branchCode,
            quantity: fix.after,
            purchasePrice: fix.purchasePrice,
            salePrice: fix.salePrice,
          },
        });
      }
    }
    for (const productId of productIds) {
      const total = await tx.productStock.aggregate({
        where: { productId },
        _sum: { quantity: true },
      });
      await tx.product.update({
        where: { id: productId },
        data: { quantity: total._sum.quantity ?? 0 },
      });
    }
  }, { timeout: 120_000 });

  console.log(`\nUpdated ${fixes.length} stock row(s) across ${productIds.length} product(s).`);
}

fixVariantProductStocks()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
