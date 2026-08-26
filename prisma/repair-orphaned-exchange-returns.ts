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

const applyChanges = process.argv.includes('--apply');
const requestedParentId = Number(
  process.argv.find((arg) => arg.startsWith('--parent-id='))?.split('=')[1] ??
    0,
);

async function main() {
  const orphanedReturns = await prisma.sale.findMany({
    where: {
      saleType: 'return',
      parentSaleId: requestedParentId > 0 ? requestedParentId : { not: null },
      comment: {
        not: {
          startsWith: 'exchange-group:',
        },
      },
    },
    include: {
      items: true,
      parentSale: {
        include: {
          childSales: {
            select: {
              id: true,
              number: true,
              saleType: true,
              status: true,
              comment: true,
              createdAt: true,
            },
          },
        },
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  const candidates = [];

  for (const returnSale of orphanedReturns) {
    if (!returnSale.parentSale) {
      continue;
    }

    const siblingExchange = returnSale.parentSale.childSales.find(
      (child) => child.saleType === 'exchange',
    );

    if (siblingExchange) {
      continue;
    }

    const hasDeletedExchangeMovement = await prisma.stockMovement.findFirst({
      where: {
        externalId: {
          startsWith: 'DELETE-',
        },
        createdAt: {
          gte: new Date(returnSale.createdAt.getTime() - 5 * 60_000),
          lte: new Date(returnSale.createdAt.getTime() + 24 * 60 * 60_000),
        },
      },
      select: {
        id: true,
        externalId: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    if (!hasDeletedExchangeMovement) {
      continue;
    }

    candidates.push({
      returnSale,
      parentSale: returnSale.parentSale,
      deletedExchangeMovement: hasDeletedExchangeMovement,
    });
  }

  if (candidates.length === 0) {
    console.log('No orphaned exchange returns found.');
    return;
  }

  console.log(
    JSON.stringify(
      candidates.map(({ returnSale, parentSale, deletedExchangeMovement }) => ({
        parentSaleId: parentSale.id,
        parentNumber: parentSale.number,
        parentStatus: parentSale.status,
        orphanReturnId: returnSale.id,
        orphanReturnNumber: returnSale.number,
        orphanReturnCreatedAt: returnSale.createdAt,
        deletedExchangeMovement: deletedExchangeMovement.externalId,
      })),
      null,
      2,
    ),
  );

  if (!applyChanges) {
    console.log('Dry run only. Re-run with --apply to repair these records.');
    return;
  }

  await prisma.$transaction(async (tx) => {
    for (const { returnSale, parentSale } of candidates) {
      for (const item of returnSale.items) {
        if (!item.productId || !returnSale.branchCode) {
          continue;
        }

        await tx.productStock.updateMany({
          where: {
            productId: item.productId,
            branchCode: returnSale.branchCode,
          },
          data: {
            quantity: {
              decrement: Number(item.quantity),
            },
          },
        });
      }

      await tx.sale.delete({
        where: {
          id: returnSale.id,
        },
      });

      const childSalesCount = await tx.sale.count({
        where: {
          parentSaleId: parentSale.id,
        },
      });

      if (childSalesCount === 0 && !parentSale.isDraft) {
        await tx.sale.update({
          where: {
            id: parentSale.id,
          },
          data: {
            status: 'paid',
          },
        });
      }
    }
  });

  console.log(`Repaired ${candidates.length} orphaned exchange return(s).`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
