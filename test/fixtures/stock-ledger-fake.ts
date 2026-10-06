// In-memory stand-in for the stock tables used by unit tests. It mirrors the
// PostgreSQL ledger: every ProductVariantStock quantity change moves
// ProductStock (per product and shop) and Product.quantity by the same delta,
// and direct writes of ProductStock.quantity are rejected.

type Row = Record<string, any>;

export type LedgerSeed = {
  companyId?: string;
  products: Array<Row & { id: number }>;
  variants?: Array<Row & { id: string; productId: number }>;
  // Without variantId the stock belongs to the product's default variant.
  stocks?: Array<
    Row & {
      productId: number;
      shopId: string;
      branchCode: string;
      quantity: number;
      variantId?: string;
    }
  >;
};

function matches(row: Row, where: Row = {}): boolean {
  return Object.entries(where).every(([key, condition]) => {
    if (key === 'OR') return (condition as Row[]).some((c) => matches(row, c));
    if (key === 'AND') return (condition as Row[]).every((c) => matches(row, c));
    const value = row[key];
    if (condition && typeof condition === 'object' && !(condition instanceof Date)) {
      if ('gte' in condition) return value >= condition.gte;
      if ('gt' in condition) return value > condition.gt;
      if ('in' in condition) return condition.in.includes(value);
      if ('notIn' in condition) return !condition.notIn.includes(value);
      if ('not' in condition) return value !== condition.not;
      return false;
    }
    return value === condition;
  });
}

function pick(row: Row | null | undefined, select?: Row) {
  if (!row) return null;
  if (!select) return { ...row };
  return Object.fromEntries(Object.keys(select).map((key) => [key, row[key]]));
}

function clean(row: Row | undefined) {
  if (!row) return null;
  const { __table, ...rest } = row;
  return rest;
}

export function createStockLedgerFake(seed: LedgerSeed) {
  const companyId = seed.companyId ?? 'company-1';
  let sequence = 0;
  const nextId = (prefix: string) => `${prefix}-${++sequence}`;

  const products = seed.products.map((p) => ({
    companyId,
    quantity: 0,
    purchasePrice: null,
    salePrice: null,
    sku: null,
    barcode: null,
    archivedAt: null,
    ...p,
  }));
  const variants: Row[] = (seed.variants ?? []).map((v) => ({
    companyId,
    isDefault: false,
    isActive: true,
    colorId: null,
    sizeId: null,
    purchasePrice: null,
    salePrice: null,
    createdAt: new Date(0),
    ...v,
  }));
  const variantStocks: Row[] = [];
  const shopStocks: Row[] = [];
  const movements: Row[] = [];
  let shopStockId = 0;

  const defaultVariantOf = (productId: number) => {
    let variant = variants.find((v) => v.productId === productId && v.isDefault);
    if (!variant) {
      variant = {
        id: `default-${productId}`,
        companyId,
        productId,
        isDefault: true,
        isActive: true,
        colorId: null,
        sizeId: null,
        createdAt: new Date(0),
      };
      variants.push(variant);
    }
    return variant;
  };

  // The ledger trigger.
  const ledger = (variantId: string, shopId: string, branchCode: string, delta: number) => {
    if (!delta) return;
    const variant = variants.find((v) => v.id === variantId);
    if (!variant) return;
    let shop = shopStocks.find(
      (s) => s.productId === variant.productId && s.shopId === shopId,
    );
    if (!shop) {
      shop = {
        __table: 'shop',
        id: ++shopStockId,
        productId: variant.productId,
        shopId,
        branchCode,
        quantity: 0,
        purchasePrice: null,
        salePrice: null,
        lowStockNotifiedAt: null,
      };
      shopStocks.push(shop);
    }
    shop.quantity += delta;
    const product = products.find((p) => p.id === variant.productId);
    if (product) product.quantity += delta;
  };

  const setVariantQuantity = (row: Row, quantity: number) => {
    const delta = quantity - row.quantity;
    row.quantity = quantity;
    ledger(row.variantId, row.shopId, row.branchCode, delta);
  };

  const applyData = (row: Row, data: Row) => {
    for (const [key, value] of Object.entries(data)) {
      if (key !== 'quantity') row[key] = value;
    }
    if (data.quantity === undefined) return;
    const q = data.quantity;
    const next =
      typeof q === 'object'
        ? row.quantity + (q.increment ?? 0) - (q.decrement ?? 0)
        : Number(q);
    if (row.__table === 'shop') {
      if (next !== row.quantity) {
        throw new Error('ProductStock.quantity follows ProductVariantStock');
      }
      return;
    }
    setVariantQuantity(row, next);
  };

  const insertVariantStock = (data: Row) => {
    const row = {
      __table: 'variant',
      id: nextId('vs'),
      companyId,
      purchasePrice: null,
      salePrice: null,
      ...data,
      quantity: 0,
    };
    variantStocks.push(row);
    setVariantQuantity(row, Number(data.quantity ?? 0));
    return row;
  };

  for (const stock of seed.stocks ?? []) {
    const { variantId, ...rest } = stock;
    insertVariantStock({
      ...rest,
      variantId: variantId ?? defaultVariantOf(stock.productId).id,
    });
    // Seeded data has a shop row (with its prices) even at zero quantity.
    let shop = shopStocks.find(
      (s) => s.productId === stock.productId && s.shopId === stock.shopId,
    );
    if (!shop) {
      shop = {
        __table: 'shop',
        id: ++shopStockId,
        productId: stock.productId,
        shopId: stock.shopId,
        branchCode: stock.branchCode,
        quantity: 0,
        purchasePrice: null,
        salePrice: null,
        lowStockNotifiedAt: null,
      };
      shopStocks.push(shop);
    }
    shop.purchasePrice = stock.purchasePrice ?? shop.purchasePrice;
    shop.salePrice = stock.salePrice ?? shop.salePrice;
    shop.lowStockNotifiedAt = stock.lowStockNotifiedAt ?? null;
  }

  const variantStockWhere = (where: Row) => {
    const { variantId_shopId, variant, ...rest } = where;
    return (row: Row) =>
      (!variantId_shopId ||
        (row.variantId === variantId_shopId.variantId &&
          row.shopId === variantId_shopId.shopId)) &&
      (!variant ||
        matches(variants.find((v) => v.id === row.variantId) ?? {}, variant)) &&
      matches(row, rest);
  };
  const shopStockWhere = (where: Row) => {
    const { productId_shopId, productId_branchCode, product, ...rest } = where;
    return (row: Row) =>
      (!productId_shopId ||
        (row.productId === productId_shopId.productId &&
          row.shopId === productId_shopId.shopId)) &&
      (!productId_branchCode ||
        (row.productId === productId_branchCode.productId &&
          row.branchCode === productId_branchCode.branchCode)) &&
      (!product ||
        matches(products.find((p) => p.id === row.productId) ?? {}, product)) &&
      matches(row, rest);
  };

  const tx = {
    product: {
      findFirst: jest.fn(async ({ where, select }: Row) =>
        pick(products.find((p) => matches(p, where)), select),
      ),
      findUnique: jest.fn(async ({ where, select }: Row) =>
        pick(products.find((p) => p.id === where.id), select),
      ),
      update: jest.fn(async ({ where, data }: Row) => {
        const product = products.find((p) => p.id === where.id)!;
        Object.assign(product, data);
        return { ...product };
      }),
    },
    productVariant: {
      findFirst: jest.fn(async ({ where, select }: Row) =>
        pick(
          variants
            .filter((v) => matches(v, where))
            .sort((a, b) => a.createdAt - b.createdAt)[0],
          select,
        ),
      ),
      findUnique: jest.fn(async ({ where, select }: Row) =>
        pick(variants.find((v) => v.id === where.id), select),
      ),
      create: jest.fn(async ({ data, select }: Row) => {
        const variant = {
          id: nextId('variant'),
          isActive: true,
          colorId: null,
          sizeId: null,
          createdAt: new Date(),
          ...data,
        };
        variants.push(variant);
        return pick(variant, select);
      }),
    },
    productVariantStock: {
      findUnique: jest.fn(async ({ where, select }: Row) =>
        pick(clean(variantStocks.find(variantStockWhere(where))), select),
      ),
      findMany: jest.fn(async ({ where }: Row = {}) =>
        variantStocks.filter(variantStockWhere(where ?? {})).map(clean),
      ),
      updateMany: jest.fn(async ({ where, data }: Row) => {
        const rows = variantStocks.filter(variantStockWhere(where));
        rows.forEach((row) => applyData(row, data));
        return { count: rows.length };
      }),
      upsert: jest.fn(async ({ where, create, update }: Row) => {
        const row = variantStocks.find(variantStockWhere(where));
        if (row) {
          applyData(row, update);
          return clean(row);
        }
        return clean(insertVariantStock(create));
      }),
      create: jest.fn(async ({ data }: Row) => clean(insertVariantStock(data))),
      deleteMany: jest.fn(async ({ where }: Row) => {
        const rows = variantStocks.filter(variantStockWhere(where));
        for (const row of rows) {
          setVariantQuantity(row, 0);
          variantStocks.splice(variantStocks.indexOf(row), 1);
        }
        return { count: rows.length };
      }),
      aggregate: jest.fn(async ({ where }: Row) => ({
        _sum: {
          quantity: variantStocks
            .filter(variantStockWhere(where))
            .reduce((sum, row) => sum + row.quantity, 0),
        },
      })),
    },
    productStock: {
      findUnique: jest.fn(async ({ where, select }: Row) =>
        pick(clean(shopStocks.find(shopStockWhere(where))), select),
      ),
      findFirst: jest.fn(async ({ where, select }: Row) =>
        pick(clean(shopStocks.find(shopStockWhere(where))), select),
      ),
      findFirstOrThrow: jest.fn(async ({ where }: Row) => {
        const row = shopStocks.find(shopStockWhere(where));
        if (!row) throw new Error('ProductStock not found');
        return clean(row);
      }),
      findMany: jest.fn(async ({ where }: Row = {}) =>
        shopStocks.filter(shopStockWhere(where ?? {})).map(clean),
      ),
      update: jest.fn(async ({ where, data }: Row) => {
        const row = shopStocks.find((s) => s.id === where.id)!;
        applyData(row, data);
        return clean(row);
      }),
      updateMany: jest.fn(async ({ where, data }: Row) => {
        const rows = shopStocks.filter(shopStockWhere(where));
        rows.forEach((row) => applyData(row, data));
        return { count: rows.length };
      }),
      upsert: jest.fn(async ({ where, create, update }: Row) => {
        const row = shopStocks.find(shopStockWhere(where));
        if (row) {
          applyData(row, update);
          return clean(row);
        }
        if (Number(create.quantity ?? 0) !== 0) {
          throw new Error('ProductStock.quantity follows ProductVariantStock');
        }
        const created = {
          __table: 'shop',
          id: ++shopStockId,
          lowStockNotifiedAt: null,
          ...create,
        };
        shopStocks.push(created);
        return clean(created);
      }),
      aggregate: jest.fn(async ({ where }: Row) => ({
        _sum: {
          quantity: shopStocks
            .filter(shopStockWhere(where))
            .reduce((sum, row) => sum + row.quantity, 0),
        },
      })),
    },
    stockMovement: {
      create: jest.fn(async ({ data }: Row) => {
        const movement = { id: nextId('movement'), ...data };
        movements.push(movement);
        return { id: movement.id };
      }),
    },
  };

  return {
    tx,
    products,
    variants,
    variantStocks,
    shopStocks,
    movements,
    defaultVariantOf,
    shopQuantity: (productId: number, shopId: string) =>
      shopStocks.find((s) => s.productId === productId && s.shopId === shopId)
        ?.quantity ?? 0,
    variantQuantity: (variantId: string, shopId: string) =>
      variantStocks.find((s) => s.variantId === variantId && s.shopId === shopId)
        ?.quantity ?? 0,
  };
}
