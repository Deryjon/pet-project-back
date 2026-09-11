import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { randomUUID } from 'crypto';
import { companyContext } from '../fixtures/request-context';
import { PrismaService } from '../../src/prisma/prisma.service';

export function database() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url || !new URL(url).pathname.startsWith('/konkurent_test_current_'))
    throw new Error('Run through test/postgres/run.cjs');
  const pool = new Pool({ connectionString: url, max: 8 });
  const client = new PrismaClient({ adapter: new PrismaPg(pool) });
  return {
    client,
    close: async () => {
      await client.$disconnect();
      await pool.end();
    },
  };
}

export async function fixture(db: PrismaClient, quantity = 1) {
  const key = randomUUID();
  const company = await db.company.create({
    data: { login: key, subdomain: key, name: 'Test company' },
  });
  const shop = await db.shop.create({
    data: { companyId: company.id, name: 'Test shop', branchCode: '001' },
  });
  const user = await db.user.create({
    data: {
      firstName: 'Test',
      lastName: 'User',
      phoneNumber: key,
      passwordHash: 'unused',
      companyId: company.id,
      currentShopId: shop.id,
    },
  });
  const product = await db.product.create({
    data: {
      companyId: company.id,
      name: 'Test product',
      quantity,
      salePrice: 10,
      purchasePrice: 4,
    },
  });
  if (quantity >= 0)
    await db.productStock.create({
      data: {
        productId: product.id,
        shopId: shop.id,
        branchCode: shop.branchCode,
        quantity,
        salePrice: 10,
        purchasePrice: 4,
      },
    });
  const paymentType = await db.paymentType.create({
    data: { companyId: company.id, name: 'Cash', isCash: true },
  });
  const customer = await db.client.create({
    data: {
      companyId: company.id,
      code: key,
      firstName: 'Customer',
      phone: key,
    },
  });
  const context = companyContext({
    companyId: company.id,
    userId: user.id,
    currentShopId: shop.id,
    currentBranchCode: shop.branchCode,
    allowedShopIds: [shop.id],
    allowedBranchCodes: [shop.branchCode],
  });
  return { company, shop, user, product, paymentType, customer, context };
}

export async function order(
  db: PrismaClient,
  f: Awaited<ReturnType<typeof fixture>>,
  paid = true,
) {
  return db.order.create({
    data: {
      companyId: f.company.id,
      shopId: f.shop.id,
      userId: f.user.id,
      orderNumber: randomUUID(),
      customerId: f.customer.id,
      totalPrice: 10,
      paidAmount: paid ? 10 : 0,
      items: {
        create: {
          productId: f.product.id,
          quantity: 1,
          price: 10,
          totalPrice: 10,
        },
      },
      ...(paid
        ? {
            payments: {
              create: { paymentTypeId: f.paymentType.id, amount: 10 },
            },
          }
        : {}),
    },
  });
}

/** Uses real PostgreSQL transactions, synchronizing their first snapshots to force overlap. */
export function overlappingTransactions(client: PrismaClient) {
  let arrivals = 0,
    attempts = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const proxy = new Proxy(client, {
    get(target, property) {
      if (property === '$transaction')
        return (operation: any, options: any) =>
          target.$transaction(async (tx) => {
            attempts++;
            if (arrivals < 2) {
              await tx.$queryRaw`SELECT count(*) FROM "ProductStock"`;
              arrivals++;
              if (arrivals === 2) release();
              let timer: ReturnType<typeof setTimeout>;
              try {
                await Promise.race([
                  gate,
                  new Promise((_, reject) => {
                    timer = setTimeout(
                      () =>
                        reject(
                          new Error('Second transaction did not reach barrier'),
                        ),
                      3000,
                    );
                  }),
                ]);
              } finally {
                clearTimeout(timer!);
              }
            }
            return operation(tx);
          }, options);
      const value = Reflect.get(target, property);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  return {
    prisma: proxy as unknown as PrismaService,
    attempts: () => attempts,
  };
}
