import {
  BadRequestException,
  InternalServerErrorException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ClientDebtStatus, Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { CompanySettingsService } from '../company-settings/company-settings.service';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';

const COMPANY_ID = process.env.COMPANY_ID ?? '';
const DEFAULT_PRODUCT_TYPE_ID =
  process.env.DEFAULT_PRODUCT_TYPE_ID ?? '69e939aa-9b8f-46a9-b605-8b2675475b7b';
const DEFAULT_MEASUREMENT_UNIT = {
  id: '12a69bc0-c575-4586-9f0f-76e8295d4139',
  name: 'Штука',
  company_id: '',
  short_name: 'шт',
  precision: '1',
  is_editable: false,
  is_default: false,
};
const SHOP_BY_BRANCH_CODE: Record<
  string,
  { shop_id: string; shop_name: string; id?: string; aliases?: string[] }
> = {};

@Injectable()
export class SalesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly companySettingsService: CompanySettingsService,
    private readonly usersService: UsersService,
  ) {}

  private async getRequestContext(authorization?: string) {
    return authorization
      ? this.usersService.getRequestContext(authorization)
      : null;
  }

  private extractMeasurementUnitShortName(metadata: unknown) {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
      return undefined;
    }

    const shortName = (metadata as Record<string, unknown>)
      .measurement_unit_short_name;
    return typeof shortName === 'string' && shortName.trim().length > 0
      ? shortName.trim()
      : undefined;
  }

  private resolveMeasurementType(
    value: string | undefined | null,
    measurementUnitShortName?: string | null,
  ) {
    const normalizedValue =
      typeof value === 'string' && value.trim().length > 0
        ? value.trim()
        : undefined;
    const normalizedShortName =
      typeof measurementUnitShortName === 'string' &&
      measurementUnitShortName.trim().length > 0
        ? measurementUnitShortName.trim()
        : undefined;

    if (
      !normalizedValue ||
      normalizedValue.toLowerCase() === 'unit' ||
      normalizedValue.toLowerCase() === 'countable'
    ) {
      return normalizedShortName ?? normalizedValue ?? '';
    }

    return normalizedValue;
  }

  private resolveMeasurementUnitFromMetadata(
    metadata: unknown,
    companyId: string,
  ) {
    const metadataObject =
      metadata && typeof metadata === 'object' && !Array.isArray(metadata)
        ? (metadata as Record<string, unknown>)
        : {};

    const measurementUnitId =
      typeof metadataObject.measurement_unit_id === 'string' &&
      metadataObject.measurement_unit_id.trim().length > 0
        ? metadataObject.measurement_unit_id.trim()
        : DEFAULT_MEASUREMENT_UNIT.id;
    const measurementUnitName =
      typeof metadataObject.measurement_unit_name === 'string' &&
      metadataObject.measurement_unit_name.trim().length > 0
        ? metadataObject.measurement_unit_name.trim()
        : DEFAULT_MEASUREMENT_UNIT.name;
    const measurementUnitShortName =
      this.extractMeasurementUnitShortName(metadata) ??
      DEFAULT_MEASUREMENT_UNIT.short_name;
    const measurementUnitPrecision =
      typeof metadataObject.measurement_unit_precision === 'string' &&
      metadataObject.measurement_unit_precision.trim().length > 0
        ? metadataObject.measurement_unit_precision.trim()
        : DEFAULT_MEASUREMENT_UNIT.precision;

    return {
      ...DEFAULT_MEASUREMENT_UNIT,
      id: measurementUnitId,
      name: measurementUnitName,
      company_id: companyId,
      short_name: measurementUnitShortName,
      precision: measurementUnitPrecision,
      is_default: measurementUnitId === DEFAULT_MEASUREMENT_UNIT.id,
    };
  }

  async findAll(authorization?: string) {
    const context = await this.getRequestContext(authorization);
    const sales = await this.prisma.sale.findMany({
      where: {
        AND: [this.buildSaleScope(context) ?? {}, { isDraft: false }],
      },
      include: {
        user: true,
        items: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
    const shopLookup = await this.buildShopLookupByBranchCodes(
      sales
        .map((sale) => sale.branchCode)
        .filter((value): value is string => !!value),
      context?.companyId,
    );
    const paymentTypeLookup = await this.buildPaymentTypeLookup(
      context?.companyId,
    );

    return sales.map((sale) =>
      this.toSaleListItem(sale, context, shopLookup, paymentTypeLookup),
    );
  }

  async createDraft(authorization?: string) {
    const context = await this.getRequestContext(authorization);
    const sale = await this.getOrCreateOpenSale(context);

    return this.toDraftSummary(sale);
  }

  async findParkedSales(authorization?: string) {
    return this.findDraftSales(authorization);
  }

  async findDraftSales(authorization?: string) {
    const context = await this.getRequestContext(authorization);
    const sales = await this.prisma.sale.findMany({
      where: {
        AND: [
          this.buildSaleScope(context) ?? {},
          {
            isDraft: true,
            status: {
              in: ['draft', 'parked'],
            },
            items: {
              some: {},
            },
          },
        ],
      },
      include: {
        user: true,
        items: true,
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });
    const shopLookup = await this.buildShopLookupByBranchCodes(
      sales
        .map((sale) => sale.branchCode)
        .filter((value): value is string => !!value),
      context?.companyId,
    );
    const paymentTypeLookup = await this.buildPaymentTypeLookup(
      context?.companyId,
    );

    return sales.map((sale) =>
      this.toSaleListItem(sale, context, shopLookup, paymentTypeLookup),
    );
  }

  async createOrder(body: Record<string, unknown>, authorization?: string) {
    const context = await this.getRequestContext(authorization);
    const shopId = this.optionalString(body.shop_id) ?? '';
    const sale = await this.getOrCreateOpenSale(context, shopId);

    return {
      session_id: randomUUID(),
      status_code: 200,
      id: String(sale.id),
      error: {
        code: '',
        message: '',
      },
      data: {
        id: String(sale.id),
        order_number: sale.number,
        order_type: 'SALE',
      },
      correlation_id: randomUUID(),
      topic: 'v2.order_service.order.created',
    };
  }

  async findOrder(id: string, authorization?: string) {
    const context = await this.getRequestContext(authorization);
    const saleId = this.parseEntityId(id, 'order id');
    const sale = await this.prisma.sale.findUnique({
      where: { id: saleId },
      include: {
        user: true,
        items: {
          include: {
            product: {
              include: {
                category: true,
                brand: true,
                stocks: true,
              },
            },
          },
        },
      },
    });

    if (!sale) {
      throw new NotFoundException('Order not found');
    }

    this.assertSaleAccess(sale, context);
    const shopLookup = await this.buildShopLookupByBranchCodes(
      sale.branchCode ? [sale.branchCode] : [],
      context?.companyId,
    );
    return this.toV2OrderResponse(sale, context, shopLookup);
  }

  async findOrderDraftDebt(id: string, authorization?: string) {
    const context = await this.getRequestContext(authorization);
    const saleId = this.parseOptionalEntityId(id);

    if (!saleId) {
      return this.emptyOrderDraftDebt(id);
    }

    const sale = await this.prisma.sale.findUnique({
      where: { id: saleId },
      select: {
        id: true,
        companyId: true,
        branchCode: true,
        payableTotal: true,
        total: true,
        isDraft: true,
      },
    });

    if (!sale) {
      return this.emptyOrderDraftDebt(id);
    }

    this.assertSaleAccess(sale, context);
    return this.emptyOrderDraftDebt(
      String(sale.id),
      sale.payableTotal || sale.total,
    );
  }

  async searchOrders(
    query: Record<string, string | undefined>,
    authorization?: string,
  ) {
    const context = await this.getRequestContext(authorization);
    const safePage = Math.max(1, Number(query.page) || 1);
    const safeLimit = Math.min(Math.max(1, Number(query.limit) || 50), 100);
    const onlyDeleted = query.only_deleted === 'true';
    const where = this.buildOrderSearchWhere(query, context);

    if (onlyDeleted) {
      return {
        count: 0,
        orders_sorted_by_date_list: [],
      };
    }

    const [count, sales] = await this.prisma.$transaction([
      this.prisma.sale.count({ where }),
      this.prisma.sale.findMany({
        where,
        include: {
          user: true,
          items: {
            include: {
              product: {
                include: {
                  category: true,
                  brand: true,
                  stocks: true,
                },
              },
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
        skip: (safePage - 1) * safeLimit,
        take: safeLimit,
      }),
    ]);

    const shopLookup = await this.buildShopLookupByBranchCodes(
      sales
        .map((sale) => sale.branchCode)
        .filter((value): value is string => !!value),
      context?.companyId,
    );

    const grouped = new Map<string, unknown[]>();
    for (const sale of sales) {
      const date = this.formatDate(sale.createdAt, sale.companyId);
      const orders = grouped.get(date) ?? [];
      orders.push(await this.toV2OrderResponse(sale, context, shopLookup));
      grouped.set(date, orders);
    }

    return {
      count,
      orders_sorted_by_date_list: [...grouped.entries()].map(
        ([date, orders]) => ({
          date,
          orders,
        }),
      ),
    };
  }

  async searchOrderStats( 
    query: Record<string, string | undefined>,
    authorization?: string,
  ) {
    const context = await this.getRequestContext(authorization);
    const onlyDeleted = query.only_deleted === 'true';
    const where = this.buildOrderSearchWhere(query, context);

    if (onlyDeleted) {
      return this.emptyOrderSearchStats();
    }

    const sales = await this.prisma.sale.findMany({
      where,
      include: {
        items: {
          include: {
            product: true,
          },
        },
      },
    });

    const paymentTypeLookup = await this.buildPaymentTypeLookup(
      context?.companyId,
    );
    const paymentStats = new Map<
      string,
      {
        company_payment_type_id: string;
        company_payment_type: {
          id: string;
          name: string;
          payment_type_id: string;
        };
        sum: number;
      }
    >();
    let totalProducts = 0;
    let totalServices = 0;
    let totalTransactionsSum = 0;
    let totalReturnedMeasurementValue = 0;
    let totalReturnedSum = 0;
    let totalExchangesCount = 0;
    let totalReturnalsCount = 0;

    for (const sale of sales) {
      const saleAmount = this.getSignedSaleAmount(sale);
      totalTransactionsSum += saleAmount;

      if ((sale as any).saleType === 'return') {
        totalReturnalsCount += 1;
        totalReturnedSum += sale.payableTotal || sale.total || 0;
      }

      if ((sale as any).saleType === 'exchange') {
        totalExchangesCount += 1;
      }

      for (const item of sale.items) {
        if (
          item.product?.productType === '5a0e556a-15f8-47ac-ae07-46972f3c6ab4'
        ) {
          totalServices += item.quantity;
        } else {
          totalProducts += item.quantity;
        }

        if ((sale as any).saleType === 'return') {
          totalReturnedMeasurementValue += item.quantity;
        }
      }

      const paymentTypeId = sale.paymentMethod ?? '';
      if (!paymentTypeId) {
        continue;
      }

      const paymentType = paymentTypeLookup.get(paymentTypeId);
      const existing = paymentStats.get(paymentTypeId);
      const sum = saleAmount;

      if (existing) {
        existing.sum += sum;
      } else {
        paymentStats.set(paymentTypeId, {
          company_payment_type_id: paymentTypeId,
          company_payment_type: {
            id: paymentTypeId,
            name: paymentType?.name ?? paymentTypeId,
            payment_type_id: paymentType?.payment_type_id ?? '',
          },
          sum,
        });
      }
    }

    return {
      ...this.emptyOrderSearchStats(),
      total_products_measurement_value: totalProducts,
      total_services_measurement_value: totalServices,
      total_returned_measurement_value: totalReturnedMeasurementValue,
      total_returnals_count: totalReturnalsCount,
      total_exchanges_count: totalExchangesCount,
      total_returnals_sum: totalReturnedSum,
      total_transactions_sum: totalTransactionsSum,
      payment_types_stats: [...paymentStats.values()],
      count: sales.length,
    };
  }

  async findProductsForNewSale(
    args: {
      page: number;
      limit: number;
      search?: string;
      shopId?: string;
    },
    authorization?: string,
  ) {
    const context = await this.getRequestContext(authorization);
    const safePage = Math.max(1, args.page);
    const safeLimit = Math.min(Math.max(1, args.limit), 100);
    const branchCode = await this.resolveScopedBranchCode(args.shopId, context);

    const where: any = args.search
      ? {
          OR: [
            { name: { contains: args.search, mode: 'insensitive' as const } },
            { sku: { contains: args.search, mode: 'insensitive' as const } },
            {
              barcode: { contains: args.search, mode: 'insensitive' as const },
            },
          ],
        }
      : {};

    if (context?.userType === 'company' && context.companyId) {
      where.companyId = context.companyId;
    }

    if (branchCode) {
      where.stocks = {
        some: {
          branchCode,
          quantity: {
            gt: 0,
          },
        },
      };
    } else if (context?.allowedBranchCodes?.length) {
      where.stocks = {
        some: {
          branchCode: {
            in: context.allowedBranchCodes,
          },
          quantity: {
            gt: 0,
          },
        },
      };
    } else {
      where.stocks = {
        some: {
          quantity: {
            gt: 0,
          },
        },
      };
    }

    const [count, products] = await this.prisma.$transaction([
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({
        where,
        include: {
          category: true,
          brand: true,
          stocks: true,
        },
        orderBy: {
          id: 'desc',
        },
        skip: (safePage - 1) * safeLimit,
        take: safeLimit,
      }),
    ]);

    const currencyCode =
      this.companySettingsService.getDefaultCurrencyIsoCode();
    const normalizedProducts = products.map((product) =>
      this.toNewSaleProductResponse(product, branchCode, context),
    );
    const totals = normalizedProducts.reduce(
      (acc, product) => {
        const measurementValue =
          this.toNumber(
            (product.measurement_values as Record<string, unknown>)
              ?.total_measurement_value,
          ) ?? 0;
        const retailPrice = this.toNumber(product.retail_price) ?? 0;
        const supplyPrice = this.toNumber(product.supply_price) ?? 0;

        acc.totalMeasurementValue += measurementValue;
        acc.totalRetailPrice += measurementValue * retailPrice;
        acc.totalSupplyPrice += measurementValue * supplyPrice;
        acc.zeroLeftCount += measurementValue <= 0 ? 1 : 0;
        acc.smallLeftCount +=
          measurementValue > 0 && measurementValue <= 5 ? 1 : 0;
        return acc;
      },
      {
        totalMeasurementValue: 0,
        totalRetailPrice: 0,
        totalSupplyPrice: 0,
        zeroLeftCount: 0,
        smallLeftCount: 0,
      },
    );

    return {
      products: normalizedProducts,
      count,
      statistics: {
        total_products_count: count,
        total_measurement_value: totals.totalMeasurementValue,
        total_retail_price: totals.totalRetailPrice,
        total_supply_price: totals.totalSupplyPrice,
        total_prices_by_currency: [
          {
            currency: currencyCode,
            total_retail_price: totals.totalRetailPrice,
            total_supply_price: totals.totalSupplyPrice,
          },
        ],
        total_products_scalable_count: 0,
      },
      statistics_by_status: {
        total_measurement_value: totals.totalMeasurementValue,
        total_active_measurement_value: totals.totalMeasurementValue,
        total_inactive_measurement_value: 0,
        measurement_value: {
          total: totals.totalMeasurementValue,
          measurement_units: [
            {
              measurement_unit: DEFAULT_MEASUREMENT_UNIT.short_name,
              measurement_value: totals.totalMeasurementValue,
            },
          ],
        },
        active_measurement_value: {
          total: totals.totalMeasurementValue,
          measurement_units: [
            {
              measurement_unit: DEFAULT_MEASUREMENT_UNIT.short_name,
              measurement_value: totals.totalMeasurementValue,
            },
          ],
        },
        inactive_measurement_value: {
          total: 0,
          measurement_units: [
            {
              measurement_unit: DEFAULT_MEASUREMENT_UNIT.short_name,
              measurement_value: 0,
            },
          ],
        },
        small_left_count: totals.smallLeftCount,
        zero_left_count: totals.zeroLeftCount,
        count,
      },
      fields: null,
    };
  }

  async payOrder(
    id: string,
    body: Record<string, unknown>,
    authorization?: string,
  ) {
    const context = await this.getRequestContext(authorization);
    const saleId = this.parseEntityId(id, 'order id');
    const sale = await this.prisma.sale.findUnique({
      where: { id: saleId },
      include: {
        items: {
          include: {
            product: {
              include: {
                stocks: true,
              },
            },
          },
        },
      },
    });

    if (!sale) {
      throw new NotFoundException('Order not found');
    }

    this.assertSaleAccess(sale, context);

    if (!sale.isDraft) {
      return {
        order_type: 'SALE',
        should_print_cheque: true,
      };
    }

    await this.recalculateSale(sale.id);

    await this.finalizeSaleItemSnapshots(
      sale.id,
      sale.branchCode,
      sale.userId ?? null,
      sale.companyId ?? context?.companyId ?? null,
    );

    await this.writeOffSaleItemsFromStock(sale);

    const requestedPaymentMethod =
      this.optionalString(
        Array.isArray(body.payments) &&
          body.payments[0] &&
          typeof body.payments[0] === 'object'
          ? (body.payments[0] as Record<string, unknown>)
              .company_payment_type_id
          : undefined,
      ) ?? this.optionalString(body.payment_method);
    const paymentMethod = await this.resolvePaymentMethod(
      requestedPaymentMethod,
      context?.companyId,
    );
    const resolvedClient = await this.resolveSaleClientPayload(
      body,
      sale.companyId ?? context?.companyId ?? null,
      {
        clientId: (sale as any).clientId ?? null,
        clientName: sale.clientName ?? null,
      },
    );

    await this.prisma.$transaction(async (tx) => {
      const updatedSale = await tx.sale.update({
        where: { id: sale.id },
        data: {
          status: 'paid',
          isDraft: false,
          paymentMethod,
          clientId: resolvedClient.clientId,
          clientName: resolvedClient.clientName,
          parkNote: null,
          paidAt: new Date(),
        } as any,
      });
      await this.createDebtForFinalizedSale(tx, updatedSale, body, context);
      await this.refreshClientSalesAggregates(
        tx,
        updatedSale.companyId ?? context?.companyId ?? null,
        (updatedSale as any).clientId ?? null,
      );
    });

    return {
      order_type: 'SALE',
      should_print_cheque: true,
    };
  }

  async updatePaymentMethod(
    id: string,
    body: Record<string, unknown>,
    authorization?: string,
  ) {
    const context = await this.getRequestContext(authorization);
    const saleId = this.parseEntityId(id, 'order id');
    const sale = await this.prisma.sale.findUnique({
      where: { id: saleId },
      include: {
        user: true,
        items: true,
      },
    });

    if (!sale) {
      throw new NotFoundException('Order not found');
    }

    this.assertSaleAccess(sale, context);

    const requestedPaymentMethod =
      this.optionalString(
        Array.isArray(body.payments) &&
          body.payments[0] &&
          typeof body.payments[0] === 'object'
          ? (body.payments[0] as Record<string, unknown>)
              .company_payment_type_id
          : undefined,
      ) ?? this.optionalString(body.payment_method);
    const requestedSellerId =
      this.toInt(body.user_id) ?? this.toInt(body.seller_id);

    if (!requestedPaymentMethod && !requestedSellerId) {
      throw new BadRequestException('payment_method or user_id is required');
    }

    let resolvedSellerId: number | undefined;

    if (requestedSellerId) {
      const seller = await this.prisma.user.findFirst({
        where: {
          id: requestedSellerId,
          ...(sale.companyId ? { companyId: sale.companyId } : {}),
        },
      });

      if (!seller) {
        throw new NotFoundException('Seller not found');
      }

      resolvedSellerId = seller.id;
    }

    const updatedSale = await this.prisma.sale.update({
      where: { id: sale.id },
      data: {
        ...(requestedPaymentMethod
          ? {
              paymentMethod: await this.resolvePaymentMethod(
                requestedPaymentMethod,
                context?.companyId,
              ),
            }
          : {}),
        ...(resolvedSellerId ? { userId: resolvedSellerId } : {}),
      },
      include: {
        user: true,
        items: true,
      },
    });

    return this.toSaleListItem(updatedSale, context);
  }

  async processReturn(
    id: string,
    body: Record<string, unknown>,
    authorization?: string,
  ) {
    const context = await this.getRequestContext(authorization);
    const originalSale = await this.findBaseSaleForAdjustment(id, context);
    const sellerId = await this.resolveSellerIdForAdjustment(
      originalSale,
      body,
      context,
    );
    const returnItems = await this.prepareAdjustmentItems(
      originalSale,
      body.items,
      'items',
    );

    const returnSale = await this.createAdjustmentSale({
      originalSale,
      saleType: 'return',
      status: 'returned',
      items: returnItems,
      sellerId,
      paymentMethod:
        this.optionalString(body.payment_method) ??
        originalSale.paymentMethod ??
        undefined,
    });

    await this.applyStockDelta(originalSale.branchCode, returnItems, 1, {
      companyId: originalSale.companyId,
      userId: sellerId ?? originalSale.userId,
      externalId: returnSale.number,
      movementType: 'RETURN',
    });
    await this.syncProductsQuantity(returnItems);
    await this.refreshBaseSaleStatus(originalSale.id);

    return {
      success: true,
      type: 'return',
      original_order_id: String(originalSale.id),
      return_order: this.toSaleListItem(returnSale, context),
    };
  }

  async processExchange(
    id: string,
    body: Record<string, unknown>,
    authorization?: string,
  ) {
    const context = await this.getRequestContext(authorization);
    const originalSale = await this.findBaseSaleForAdjustment(id, context);
    const sellerId = await this.resolveSellerIdForAdjustment(
      originalSale,
      body,
      context,
    );
    const returnItems = await this.prepareAdjustmentItems(
      originalSale,
      body.return_items,
      'return_items',
    );
    const exchangeItems = await this.prepareNewExchangeItems(
      originalSale,
      body.new_items,
      returnItems,
      context,
    );

    const returnSale = await this.createAdjustmentSale({
      originalSale,
      saleType: 'return',
      status: 'returned',
      items: returnItems,
      sellerId,
      paymentMethod:
        this.optionalString(body.return_payment_method) ??
        this.optionalString(body.payment_method) ??
        originalSale.paymentMethod ??
        undefined,
    });

    const exchangeSale = await this.createAdjustmentSale({
      originalSale,
      saleType: 'exchange',
      status: 'paid',
      items: exchangeItems,
      sellerId,
      paymentMethod:
        this.optionalString(body.exchange_payment_method) ??
        this.optionalString(body.payment_method) ??
        originalSale.paymentMethod ??
        undefined,
    });

    await this.applyStockDelta(originalSale.branchCode, returnItems, 1, {
      companyId: originalSale.companyId,
      userId: sellerId ?? originalSale.userId,
      externalId: returnSale.number,
      movementType: 'RETURN',
    });
    await this.applyStockDelta(originalSale.branchCode, exchangeItems, -1, {
      companyId: originalSale.companyId,
      userId: sellerId ?? originalSale.userId,
      externalId: exchangeSale.number,
      movementType: 'SALE',
    });
    await this.syncProductsQuantity([...returnItems, ...exchangeItems]);
    await this.refreshBaseSaleStatus(originalSale.id);

    return {
      success: true,
      type: 'exchange',
      original_order_id: String(originalSale.id),
      returned_total: returnSale.payableTotal,
      exchange_total: exchangeSale.payableTotal,
      balance_due: Number(
        (
          (exchangeSale.payableTotal ?? 0) - (returnSale.payableTotal ?? 0)
        ).toFixed(2),
      ),
      return_order: this.toSaleListItem(returnSale, context),
      exchange_order: this.toSaleListItem(exchangeSale, context),
    };
  }

  async findDraft(id: number, authorization?: string) {
    const context = await this.getRequestContext(authorization);
    const sale = await this.findSaleOrThrow(id);
    this.assertSaleAccess(sale, context);
    return this.toDraftResponse(sale);
  }

  async addItem(
    id: number,
    body: Record<string, unknown>,
    authorization?: string,
  ) {
    const context = await this.getRequestContext(authorization);
    const productId = this.toInt(body.product_id);
    const quantity = this.toNumber(body.quantity) ?? 1;
    const salePrice = this.toNumber(body.sale_price);

    if (!productId) {
      throw new BadRequestException('product_id is required');
    }

    if (!salePrice) {
      throw new BadRequestException('sale_price is required');
    }

    const sale = await this.findSaleOrThrow(id);
    this.assertSaleAccess(sale, context);
    if (!sale.isDraft) {
      throw new BadRequestException('Cannot update paid sale');
    }

    const product = await this.prisma.product.findFirst({
      where: this.buildProductScope(
        {
          id: productId,
        },
        context,
      ),
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    const existingItem = await this.prisma.saleItem.findFirst({
      where: {
        saleId: id,
        productId,
      },
    });

    if (existingItem) {
      await this.prisma.saleItem.update({
        where: { id: existingItem.id },
        data: {
          quantity: existingItem.quantity + quantity,
          sellerId: sale.userId ?? undefined,
          salePrice,
          lineTotal: (existingItem.quantity + quantity) * salePrice,
          retailPriceAtSale: (existingItem.quantity + quantity) * salePrice,
          finalPrice: (existingItem.quantity + quantity) * salePrice,
          supplyPriceAtSale:
            (existingItem.quantity + quantity) * (product.purchasePrice ?? 0),
          profitAtSale:
            (existingItem.quantity + quantity) * salePrice -
            (existingItem.quantity + quantity) * (product.purchasePrice ?? 0),
          markupAtSale:
            product.purchasePrice && product.purchasePrice > 0
              ? salePrice / product.purchasePrice
              : null,
        } as any,
      });
    } else {
      await this.prisma.saleItem.create({
        data: {
          saleId: id,
          productId,
          name: product.name,
          barcode: product.barcode,
          sku: product.sku,
          quantity,
          sellerId: sale.userId ?? undefined,
          salePrice,
          lineTotal: quantity * salePrice,
          retailPriceAtSale: quantity * salePrice,
          finalPrice: quantity * salePrice,
          supplyPriceAtSale: quantity * (product.purchasePrice ?? 0),
          profitAtSale:
            quantity * salePrice - quantity * (product.purchasePrice ?? 0),
          markupAtSale:
            product.purchasePrice && product.purchasePrice > 0
              ? salePrice / product.purchasePrice
              : null,
        } as any,
      });
    }

    await this.recalculateSale(id);
    return this.findDraft(id, authorization);
  }

  async removeItem(id: number, itemId: number, authorization?: string) {
    const context = await this.getRequestContext(authorization);
    const sale = await this.findSaleOrThrow(id);
    this.assertSaleAccess(sale, context);

    if (!sale.isDraft) {
      throw new BadRequestException('Cannot update paid sale');
    }

    const item = await this.prisma.saleItem.findFirst({
      where: {
        id: itemId,
        saleId: id,
      },
    });

    if (!item) {
      throw new NotFoundException('Sale item not found');
    }

    await this.prisma.saleItem.delete({
      where: { id: itemId },
    });

    await this.recalculateSale(id);
    return this.findDraft(id, authorization);
  }

  async updateItem(
    id: number,
    itemId: number,
    body: Record<string, unknown>,
    authorization?: string,
  ) {
    const context = await this.getRequestContext(authorization);
    const sale = await this.findSaleOrThrow(id);
    this.assertSaleAccess(sale, context);

    if (!sale.isDraft) {
      throw new BadRequestException('Cannot update paid sale');
    }

    const item = await this.prisma.saleItem.findFirst({
      where: {
        id: itemId,
        saleId: id,
      },
    });

    if (!item) {
      throw new NotFoundException('Sale item not found');
    }

    const quantity = this.toNumber(body.quantity);
    if (!quantity || quantity <= 0) {
      throw new BadRequestException('quantity must be greater than 0');
    }

    const salePrice = this.toNumber(body.sale_price) ?? item.salePrice;
    const product = item.productId
      ? await this.prisma.product.findFirst({
          where: this.buildProductScope(
            {
              id: item.productId,
            },
            context,
          ),
        })
      : null;
    const purchasePrice = product?.purchasePrice ?? 0;

    await this.prisma.saleItem.update({
      where: { id: itemId },
      data: {
        quantity,
        salePrice,
        sellerId: sale.userId ?? item.sellerId ?? undefined,
        lineTotal: quantity * salePrice,
        retailPriceAtSale: quantity * salePrice,
        finalPrice: quantity * salePrice,
        supplyPriceAtSale: quantity * purchasePrice,
        profitAtSale: quantity * salePrice - quantity * purchasePrice,
        markupAtSale:
          purchasePrice > 0 ? salePrice / purchasePrice : null,
      } as any,
    });

    await this.recalculateSale(id);
    return this.findDraft(id, authorization);
  }

  async updateDiscount(
    id: number,
    body: Record<string, unknown>,
    authorization?: string,
  ) {
    const context = await this.getRequestContext(authorization);
    const sale = await this.findSaleOrThrow(id);
    this.assertSaleAccess(sale, context);

    if (!sale.isDraft) {
      throw new BadRequestException('Cannot update paid sale');
    }

    const discountPercent = this.toNumber(body.discount_percent) ?? 0;
    const discountAmount = this.toNumber(body.discount_amount);

    await this.prisma.sale.update({
      where: { id },
      data: {
        discountPercent,
        discountAmount: discountAmount ?? 0,
      },
    });

    await this.recalculateSale(id);
    return this.findDraft(id, authorization);
  }

  async attachClient(
    id: number,
    body: Record<string, unknown>,
    authorization?: string,
  ) {
    const context = await this.getRequestContext(authorization);
    const sale = await this.findSaleOrThrow(id);
    this.assertSaleAccess(sale, context);

    if (!sale.isDraft) {
      throw new BadRequestException('Cannot update paid sale');
    }

    const rawClientId =
      this.optionalString(body.client_id) ??
      this.optionalString(body.customer_id) ??
      this.optionalString(body.clientId) ??
      this.optionalString(body.customerId);

    if (!rawClientId) {
      throw new BadRequestException('client_id is required');
    }

    const client = await this.findClientForSaleOrThrow(
      rawClientId,
      sale.companyId ?? context?.companyId ?? null,
    );

    await this.prisma.sale.update({
      where: { id },
      data: {
        clientId: client.id,
        clientName: this.buildClientDisplayName(client),
      } as any,
    });

    return this.findDraft(id, authorization);
  }

  async pay(id: number, body: Record<string, unknown>, authorization?: string) {
    const context = await this.getRequestContext(authorization);
    const sale = await this.findSaleOrThrow(id);
    this.assertSaleAccess(sale, context);

    if (!sale.isDraft) {
      return this.toSaleListItem(sale, context);
    }

    await this.recalculateSale(id);

    const branchCode =
      (await this.resolveScopedBranchCode(
        this.optionalString(body.branch_code),
        context,
      )) ?? sale.branchCode;

    await this.finalizeSaleItemSnapshots(
      id,
      branchCode,
      sale.userId ?? context?.userId ?? null,
      sale.companyId ?? context?.companyId ?? null,
    );

    await this.writeOffSaleItemsFromStock(sale, branchCode);

    const resolvedClient = await this.resolveSaleClientPayload(
      body,
      sale.companyId ?? context?.companyId ?? null,
      {
        clientId: (sale as any).clientId ?? null,
        clientName: sale.clientName ?? null,
      },
    );

    const paymentMethod = await this.resolvePaymentMethod(
      this.optionalString(body.payment_method),
      context?.companyId,
    );

    const updatedSale = await this.prisma.$transaction(async (tx) => {
      const persistedSale = await tx.sale.update({
        where: { id },
        data: {
          status: 'paid',
          isDraft: false,
          paymentMethod,
          clientId: resolvedClient.clientId,
          clientName: resolvedClient.clientName,
          parkNote: null,
          branchCode,
          paidAt: new Date(),
        } as any,
      });
      await this.createDebtForFinalizedSale(tx, persistedSale, body, context);
      await this.refreshClientSalesAggregates(
        tx,
        persistedSale.companyId ?? context?.companyId ?? null,
        (persistedSale as any).clientId ?? null,
      );
      return tx.sale.findUniqueOrThrow({
        where: { id },
        include: {
          user: true,
          items: true,
        },
      });
    });

    return this.toSaleListItem(updatedSale as any, context);
  }

  async parkDraft(
    id: number,
    body: Record<string, unknown>,
    authorization?: string,
  ) {
    const context = await this.getRequestContext(authorization);
    const sale = await this.findSaleOrThrow(id);
    this.assertSaleAccess(sale, context);

    if (!sale.isDraft) {
      throw new BadRequestException('Only draft sale can be closed');
    }

    const hasItems = sale.items.length > 0;
    if (!hasItems) {
      await this.prisma.sale.delete({
        where: { id },
      });

      return {
        success: true,
        action: 'deleted',
        id,
      };
    }

    const updatedSale = await this.prisma.sale.update({
      where: { id },
      data: {
        status: 'draft',
        parkNote:
          this.optionalString(body.park_note) ??
          this.optionalString(body.note) ??
          (sale as any).parkNote ??
          null,
      } as any,
      include: {
        user: true,
        items: true,
      },
    });
    const shouldCreateNewDraft = this.toBoolean(body.create_new_draft) ?? false;

    if (!shouldCreateNewDraft) {
      return {
        success: true,
        action: 'drafted',
        sale: this.toDraftResponse(updatedSale as any),
      };
    }

    const newDraft = await this.getOrCreateOpenSale(
      context,
      sale.branchCode ?? undefined,
    );

    return {
      parked_sale: this.toDraftResponse(updatedSale as any),
      new_draft: this.toDraftSummary(newDraft),
    };
  }

  async resumeParkedSale(id: number, authorization?: string) {
    const context = await this.getRequestContext(authorization);
    const sale = await this.findSaleOrThrow(id);
    this.assertSaleAccess(sale, context);

    if (
      !sale.isDraft ||
      !['draft', 'parked', 'open'].includes(sale.status ?? '')
    ) {
      throw new BadRequestException('Only draft sale can be resumed');
    }

    await this.normalizeOpenSalesForContext(
      context,
      sale.branchCode ?? undefined,
      sale.id,
    );

    const updatedSale = await this.prisma.sale.update({
      where: { id },
      data: {
        status: 'open',
        userId: context?.userId ?? sale.userId ?? undefined,
        branchCode: context?.currentBranchCode ?? sale.branchCode ?? undefined,
      },
      include: {
        user: true,
        items: true,
      },
    });

    return this.toDraftResponse(updatedSale);
  }

  async removeDraft(id: number, authorization?: string) {
    const context = await this.getRequestContext(authorization);
    const sale = await this.findSaleOrThrow(id);
    this.assertSaleAccess(sale, context);

    await this.prisma.sale.delete({
      where: { id },
    });

    return {
      success: true,
      id: sale.id,
    };
  }

  async removeOrder(id: string, authorization?: string) {
    const context = await this.getRequestContext(authorization);
    const saleId = this.parseEntityId(id, 'order id');
    const sale = (await this.prisma.sale.findUnique({
      where: { id: saleId },
      include: {
        items: {
          include: {
            product: {
              include: {
                stocks: true,
              },
            },
          },
        },
        user: true,
      },
    })) as any;

    if (!sale) {
      throw new NotFoundException('Order not found');
    }

    this.assertSaleAccess(sale, context);

    if (sale.parentSaleId) {
      throw new BadRequestException(
        'Return or exchange documents cannot be deleted separately',
      );
    }

    const childSalesCount = await this.prisma.sale.count({
      where: {
        parentSaleId: sale.id,
      } as any,
    });

    if (childSalesCount > 0) {
      throw new BadRequestException(
        'Order with returns or exchanges cannot be deleted',
      );
    }

    if (!sale.isDraft) {
      await this.restoreSaleStock(sale);
    }

    await this.prisma.sale.delete({
      where: { id: sale.id },
    });

    return {
      success: true,
      id: sale.id,
    };
  }

  private async findBaseSaleForAdjustment(id: string, context: any) {
    const saleId = this.parseEntityId(id, 'order id');
    const sale = await this.prisma.sale.findUnique({
      where: { id: saleId },
      include: {
        user: true,
        items: {
          include: {
            product: {
              include: {
                category: true,
                brand: true,
                stocks: true,
              },
            },
          },
        },
      },
    });

    if (!sale) {
      throw new NotFoundException('Order not found');
    }

    this.assertSaleAccess(sale, context);

    if (sale.isDraft) {
      throw new BadRequestException(
        'Only paid orders can be returned or exchanged',
      );
    }

    if ((sale as any).saleType && (sale as any).saleType !== 'sale') {
      throw new BadRequestException(
        'Returns and exchanges are allowed only for original sales',
      );
    }

    return sale as any;
  }

  private async resolveSellerIdForAdjustment(
    originalSale: { companyId?: string | null; userId?: number | null },
    body: Record<string, unknown>,
    context: any,
  ) {
    const requestedSellerId =
      this.toInt(body.user_id) ?? this.toInt(body.seller_id);

    if (!requestedSellerId) {
      return originalSale.userId ?? context?.userId ?? undefined;
    }

    const seller = await this.prisma.user.findFirst({
      where: {
        id: requestedSellerId,
        ...(originalSale.companyId
          ? { companyId: originalSale.companyId }
          : {}),
      },
    });

    if (!seller) {
      throw new NotFoundException('Seller not found');
    }

    return seller.id;
  }

  private async prepareAdjustmentItems(
    originalSale: {
      id: number;
      items: Array<{
        id: number;
        productId: number | null;
        name: string;
        barcode: string | null;
        sku: string | null;
        quantity: number;
        salePrice: number;
      }>;
    },
    rawItems: unknown,
    fieldName: string,
  ) {
    if (!Array.isArray(rawItems) || rawItems.length === 0) {
      throw new BadRequestException(
        `${fieldName} must contain at least one item`,
      );
    }

    const returnableQuantities =
      await this.getReturnableQuantities(originalSale);
    const normalizedItems: Array<{
      productId: number;
      name: string;
      barcode: string | null;
      sku: string | null;
      quantity: number;
      salePrice: number;
      lineTotal: number;
    }> = [];

    for (const rawItem of rawItems) {
      if (!rawItem || typeof rawItem !== 'object') {
        throw new BadRequestException(`${fieldName} contains invalid item`);
      }

      const record = rawItem as Record<string, unknown>;
      const productId = this.toInt(record.product_id) ?? this.toInt(record.id);
      const quantity = this.toNumber(record.quantity);

      if (!productId || !quantity || quantity <= 0) {
        throw new BadRequestException(
          `${fieldName} items require product_id and positive quantity`,
        );
      }

      const originalItem = originalSale.items.find(
        (item) => item.productId === productId,
      );

      if (!originalItem) {
        throw new BadRequestException(
          `Product ${productId} is not present in the original sale`,
        );
      }

      const availableQuantity = returnableQuantities.get(productId) ?? 0;
      const alreadyRequestedQuantity =
        normalizedItems.find((item) => item.productId === productId)
          ?.quantity ?? 0;

      if (alreadyRequestedQuantity + quantity > availableQuantity) {
        throw new BadRequestException(
          `Return quantity for product ${productId} exceeds available amount`,
        );
      }

      normalizedItems.push({
        productId,
        name: originalItem.name,
        barcode: originalItem.barcode,
        sku: originalItem.sku,
        quantity,
        salePrice: originalItem.salePrice,
        lineTotal: Number((quantity * originalItem.salePrice).toFixed(2)),
      });
    }

    return normalizedItems;
  }

  private async prepareNewExchangeItems(
    originalSale: { companyId?: string | null; branchCode: string | null },
    rawItems: unknown,
    returnItems: Array<{ productId: number; quantity: number }>,
    context: any,
  ) {
    if (!Array.isArray(rawItems) || rawItems.length === 0) {
      throw new BadRequestException('new_items must contain at least one item');
    }

    const normalizedItems: Array<{
      productId: number;
      name: string;
      barcode: string | null;
      sku: string | null;
      quantity: number;
      salePrice: number;
      lineTotal: number;
    }> = [];

    for (const rawItem of rawItems) {
      if (!rawItem || typeof rawItem !== 'object') {
        throw new BadRequestException('new_items contains invalid item');
      }

      const record = rawItem as Record<string, unknown>;
      const productId = this.toInt(record.product_id) ?? this.toInt(record.id);
      const quantity = this.toNumber(record.quantity);

      if (!productId || !quantity || quantity <= 0) {
        throw new BadRequestException(
          'new_items require product_id and positive quantity',
        );
      }

      const product = await this.prisma.product.findFirst({
        where: this.buildProductScope({ id: productId }, context),
      });

      if (!product) {
        throw new NotFoundException(`Product ${productId} not found`);
      }

      const salePrice =
        this.toNumber(record.sale_price) ?? product.salePrice ?? 0;

      if (salePrice <= 0) {
        throw new BadRequestException(
          `Sale price for product ${productId} must be greater than 0`,
        );
      }

      const stock = originalSale.branchCode
        ? await this.prisma.productStock.findFirst({
            where: {
              productId,
              branchCode: originalSale.branchCode,
            },
          })
        : null;

      const availableQuantity = stock?.quantity ?? product.quantity ?? 0;
      const quantityReturnedInSameExchange = returnItems
        .filter((item) => item.productId === productId)
        .reduce((sum, item) => sum + item.quantity, 0);
      const alreadyRequestedQuantity =
        normalizedItems.find((item) => item.productId === productId)
          ?.quantity ?? 0;

      if (
        alreadyRequestedQuantity + quantity >
        availableQuantity + quantityReturnedInSameExchange
      ) {
        throw new BadRequestException(
          `Not enough stock for exchange product ${productId}`,
        );
      }

      normalizedItems.push({
        productId,
        name: product.name,
        barcode: product.barcode,
        sku: product.sku,
        quantity,
        salePrice,
        lineTotal: Number((quantity * salePrice).toFixed(2)),
      });
    }

    return normalizedItems;
  }

  private async getReturnableQuantities(originalSale: {
    id: number;
    items: Array<{ productId: number | null; quantity: number }>;
  }) {
    const returns = await this.prisma.sale.findMany({
      where: {
        parentSaleId: originalSale.id,
        saleType: 'return',
      } as any,
      include: {
        items: true,
      },
    });

    const returnedMap = new Map<number, number>();
    for (const returnSale of returns as any[]) {
      for (const item of returnSale.items) {
        if (!item.productId) {
          continue;
        }

        returnedMap.set(
          item.productId,
          (returnedMap.get(item.productId) ?? 0) + item.quantity,
        );
      }
    }

    const returnableMap = new Map<number, number>();
    for (const item of originalSale.items) {
      if (!item.productId) {
        continue;
      }

      returnableMap.set(
        item.productId,
        item.quantity - (returnedMap.get(item.productId) ?? 0),
      );
    }

    return returnableMap;
  }

  private async createAdjustmentSale(args: {
    originalSale: any;
    saleType: 'return' | 'exchange';
    status: string;
    items: Array<{
      productId: number;
      name: string;
      barcode: string | null;
      sku: string | null;
      quantity: number;
      salePrice: number;
      lineTotal: number;
    }>;
    sellerId?: number;
    paymentMethod?: string;
  }) {
    const total = args.items.reduce((sum, item) => sum + item.lineTotal, 0);
    const paymentMethod = await this.resolvePaymentMethod(
      args.paymentMethod,
      args.originalSale.companyId,
    );

    const createdSale = await this.prisma.sale.create({
      data: {
        companyId: args.originalSale.companyId ?? undefined,
        number: this.generateOrderNumber(),
        saleType: args.saleType,
        status: args.status,
        payableTotal: total,
        total,
        paymentMethod,
        clientId: args.originalSale.clientId ?? undefined,
        clientName: args.originalSale.clientName ?? undefined,
        branchCode: args.originalSale.branchCode ?? undefined,
        isDraft: false,
        userId: args.sellerId,
        parentSaleId: args.originalSale.id,
        paidAt: new Date(),
        items: {
          create: args.items.map((item) => ({
            productId: item.productId,
            name: item.name,
            barcode: item.barcode,
            sku: item.sku,
            quantity: item.quantity,
            sellerId: args.sellerId,
            salePrice: item.salePrice,
            lineTotal: item.lineTotal,
            retailPriceAtSale: item.lineTotal,
            finalPrice: item.lineTotal,
          })),
        },
      } as any,
      include: {
        user: true,
        items: true,
      },
    });

    await this.finalizeSaleItemSnapshots(
      createdSale.id,
      args.originalSale.branchCode ?? null,
      args.sellerId ?? args.originalSale.userId ?? null,
      args.originalSale.companyId ?? null,
    );

    const sale = await this.prisma.sale.findUnique({
      where: { id: createdSale.id },
      include: {
        user: true,
        items: true,
      },
    });

    if (!sale) {
      throw new InternalServerErrorException('Adjustment sale was not created');
    }

    return sale;
  }

  private async applyStockDelta(
    branchCode: string | null,
    items: Array<{ productId: number; quantity: number; salePrice: number }>,
    multiplier: 1 | -1,
    meta?: {
      companyId?: string | null;
      userId?: number | null;
      externalId?: string | null;
      movementType?: 'SALE' | 'RETURN';
    },
  ) {
    if (!branchCode) {
      return;
    }
    const shopId = await this.resolveShopIdForBranchCode(
      branchCode,
      meta?.companyId ?? null,
    );

    for (const item of items) {
      const stock = await this.prisma.productStock.findFirst({
        where: {
          productId: item.productId,
          branchCode,
        },
      });

      if (stock) {
        const beforeQuantity = stock.quantity;
        const afterQuantity = stock.quantity + item.quantity * multiplier;
        await this.prisma.productStock.update({
          where: { id: stock.id },
          data: {
            quantity: afterQuantity,
          },
        });

        if (shopId && meta?.companyId && meta?.userId && meta?.movementType) {
          await this.createStockMovement(this.prisma, {
            companyId: meta.companyId,
            shopId,
            productId: item.productId,
            type: meta.movementType,
            quantity: item.quantity,
            beforeQuantity,
            afterQuantity,
            createdById: meta.userId,
            externalId: meta.externalId ?? '',
            supplyPrice: stock.purchasePrice ?? 0,
            retailPrice: item.salePrice,
            newRetailPrice: item.salePrice,
            fromRetailPrice: stock.salePrice ?? 0,
            fromSupplyPrice: stock.purchasePrice ?? 0,
          });
        }
      } else {
        const product = await this.prisma.product.findUnique({
          where: { id: item.productId },
          select: {
            purchasePrice: true,
            salePrice: true,
          },
        });

        await this.prisma.productStock.create({
          data: {
            productId: item.productId,
            branchCode,
            quantity: item.quantity * multiplier,
            purchasePrice: product?.purchasePrice ?? 0,
            salePrice: item.salePrice,
          },
        });

        if (shopId && meta?.companyId && meta?.userId && meta?.movementType) {
          await this.createStockMovement(this.prisma, {
            companyId: meta.companyId,
            shopId,
            productId: item.productId,
            type: meta.movementType,
            quantity: item.quantity,
            beforeQuantity: 0,
            afterQuantity: item.quantity * multiplier,
            createdById: meta.userId,
            externalId: meta.externalId ?? '',
            supplyPrice: product?.purchasePrice ?? 0,
            retailPrice: item.salePrice,
            newRetailPrice: item.salePrice,
            fromRetailPrice: product?.salePrice ?? 0,
            fromSupplyPrice: product?.purchasePrice ?? 0,
          });
        }
      }
    }
  }

  private async syncProductsQuantity(items: Array<{ productId: number }>) {
    const uniqueProductIds = [...new Set(items.map((item) => item.productId))];

    for (const productId of uniqueProductIds) {
      const product = await this.prisma.product.findUnique({
        where: { id: productId },
        include: { stocks: true },
      });

      if (!product) {
        continue;
      }

      await this.prisma.product.update({
        where: { id: productId },
        data: {
          quantity: product.stocks.reduce(
            (sum, stock) => sum + stock.quantity,
            0,
          ),
        },
      });
    }
  }

  private async resolveShopIdForBranchCode(
    branchCode: string,
    companyId?: string | null,
  ) {
    const shop = await this.prisma.shop.findFirst({
      where: {
        branchCode,
        ...(companyId ? { companyId } : {}),
      },
      select: {
        id: true,
      },
    });

    return shop?.id ?? null;
  }

  private getMovementDisplay(type: 'SALE' | 'RETURN'): {
    code: string;
    label: string;
  } {
    switch (type) {
      case 'RETURN':
        return { code: 'return', label: 'Возврат' };
      case 'SALE':
      default:
        return { code: 'sale', label: 'Продажа' };
    }
  }

  private async createStockMovement(
    tx: Prisma.TransactionClient | PrismaService,
    input: {
      companyId: string;
      shopId: string;
      productId: number;
      type: 'SALE' | 'RETURN';
      quantity: number;
      beforeQuantity: number;
      afterQuantity: number;
      createdById: number;
      externalId: string;
      supplyPrice: number;
      retailPrice: number;
      newRetailPrice: number;
      fromRetailPrice: number;
      fromSupplyPrice: number;
    },
  ) {
    const display = this.getMovementDisplay(input.type);

    await tx.stockMovement.create({
      data: {
        companyId: input.companyId,
        shopId: input.shopId,
        productId: input.productId,
        type: input.type,
        displayTypeCode: display.code,
        displayTypeLabel: display.label,
        externalId: input.externalId,
        quantity: input.quantity,
        loadedMeasurementValue: input.afterQuantity,
        beforeQuantity: input.beforeQuantity,
        afterQuantity: input.afterQuantity,
        fromShopId: input.shopId,
        toShopId: input.shopId,
        supplyPrice: input.supplyPrice,
        retailPrice: input.retailPrice,
        newRetailPrice: input.newRetailPrice,
        fromRetailPrice: input.fromRetailPrice,
        fromSupplyPrice: input.fromSupplyPrice,
        createdById: input.createdById,
      },
    });
  }

  private async refreshBaseSaleStatus(saleId: number) {
    const originalSale = await this.prisma.sale.findUnique({
      where: { id: saleId },
      include: {
        items: true,
      },
    });

    if (!originalSale) {
      return;
    }

    const childSales = await this.prisma.sale.findMany({
      where: {
        parentSaleId: saleId,
      } as any,
      include: {
        items: true,
      },
    });

    const returnedMap = new Map<number, number>();
    let hasExchange = false;

    for (const childSale of childSales as any[]) {
      if (childSale.saleType === 'exchange') {
        hasExchange = true;
      }

      if (childSale.saleType !== 'return') {
        continue;
      }

      for (const item of childSale.items) {
        if (!item.productId) {
          continue;
        }

        returnedMap.set(
          item.productId,
          (returnedMap.get(item.productId) ?? 0) + item.quantity,
        );
      }
    }

    let hasReturnedItems = false;
    let fullyReturned = true;

    for (const item of originalSale.items) {
      if (!item.productId) {
        continue;
      }

      const returnedQuantity = returnedMap.get(item.productId) ?? 0;
      if (returnedQuantity > 0) {
        hasReturnedItems = true;
      }

      if (returnedQuantity < item.quantity) {
        fullyReturned = false;
      }
    }

    let status = originalSale.status;
    if (hasReturnedItems) {
      if (hasExchange) {
        status = fullyReturned ? 'exchanged' : 'partially_exchanged';
      } else {
        status = fullyReturned ? 'returned' : 'partially_returned';
      }
    }

    await this.prisma.sale.update({
      where: { id: saleId },
      data: {
        status,
      },
    });
  }

  private async recalculateSale(id: number) {
    const sale = await this.prisma.sale.findUnique({
      where: { id },
      include: {
        items: true,
      },
    });

    if (!sale) {
      throw new NotFoundException('Sale not found');
    }

    const total = sale.items.reduce((sum, item) => sum + item.lineTotal, 0);
    const percentDiscount = (total * sale.discountPercent) / 100;
    const flatDiscount = sale.discountAmount;
    const payableTotal = Math.max(0, total - percentDiscount - flatDiscount);

    await this.prisma.sale.update({
      where: { id },
      data: {
        total,
        payableTotal,
      },
    });
  }

  private async finalizeSaleItemSnapshots(
    saleId: number,
    branchCode?: string | null,
    sellerId?: number | null,
    companyId?: string | null,
  ) {
    const sale = await this.prisma.sale.findUnique({
      where: { id: saleId },
      include: {
        items: true,
      },
    });

    if (!sale || !sale.items.length) {
      return;
    }

    const effectiveBranchCode = branchCode ?? sale.branchCode;
    const sellerSettings =
      sellerId &&
      (await (this.prisma as any).sellerSalarySettings?.findUnique?.({
        where: { userId: sellerId },
      }));
    const retailTotal = sale.items.reduce(
      (sum, item) => sum + item.lineTotal,
      0,
    );
    const flatDiscount = sale.discountAmount || 0;
    const percentDiscount = sale.discountPercent || 0;

    for (const item of sale.items as any[]) {
      const retailPriceAtSale = Number(
        item.lineTotal || item.quantity * item.salePrice || 0,
      );
      const percentPart = retailPriceAtSale * (percentDiscount / 100);
      const flatPart =
        retailTotal > 0 ? (flatDiscount * retailPriceAtSale) / retailTotal : 0;
      const discountAmount = Number((percentPart + flatPart).toFixed(2));
      const finalPrice = Number(
        Math.max(0, retailPriceAtSale - discountAmount).toFixed(2),
      );

      let unitSupplyPrice = 0;
      if (typeof item.productId === 'number') {
        const stock = effectiveBranchCode
          ? await this.prisma.productStock.findFirst({
              where: {
                productId: item.productId,
                branchCode: effectiveBranchCode,
              },
            })
          : null;
        const product = await this.prisma.product.findUnique({
          where: { id: item.productId },
          select: {
            purchasePrice: true,
          },
        });
        unitSupplyPrice = stock?.purchasePrice ?? product?.purchasePrice ?? 0;
      }

      const supplyPriceAtSale = Number(
        (unitSupplyPrice * item.quantity).toFixed(2),
      );
      const profitAtSale = Number((finalPrice - supplyPriceAtSale).toFixed(2));
      const markupAtSale =
        supplyPriceAtSale > 0
          ? Number((finalPrice / supplyPriceAtSale).toFixed(4))
          : null;
      const sellerBonusAmount = Number(
        this.calculateSellerBonusAmount(
          {
            finalPrice,
            profitAtSale,
          },
          sellerSettings,
        ).toFixed(2),
      );

      await this.prisma.saleItem.update({
        where: { id: item.id },
        data: {
          sellerId: sellerId ?? item.sellerId ?? undefined,
          retailPriceAtSale,
          discountAmount,
          finalPrice,
          supplyPriceAtSale,
          profitAtSale,
          markupAtSale,
          sellerBonusAmount,
        } as any,
      });
    }
  }

  private async writeOffSaleItemsFromStock(
    sale: {
      id: number;
      number: string;
      companyId?: string | null;
      userId?: number | null;
      branchCode: string | null;
      items: {
        productId: number | null;
        quantity: number;
        salePrice: number;
      }[];
    },
    branchCodeOverride?: string | null,
  ) {
    const branchCode = branchCodeOverride ?? sale.branchCode;
    if (!branchCode) {
      return;
    }
    const shopId = await this.resolveShopIdForBranchCode(
      branchCode,
      sale.companyId ?? null,
    );
    if (!shopId || !sale.companyId || !sale.userId) {
      return;
    }
    const companyId = sale.companyId;
    const createdById = sale.userId;

    const productIds = [
      ...new Set(
        sale.items
          .map((item) => item.productId)
          .filter((value): value is number => typeof value === 'number'),
      ),
    ];

    if (!productIds.length) {
      return;
    }

    await this.prisma.$transaction(async (tx) => {
      for (const item of sale.items) {
        if (!item.productId) {
          continue;
        }

        const stock = await tx.productStock.findFirst({
          where: {
            productId: item.productId,
            branchCode,
          },
        });

        if (stock) {
          const beforeQuantity = stock.quantity;
          const afterQuantity = stock.quantity - item.quantity;
          await tx.productStock.update({
            where: { id: stock.id },
            data: {
              quantity: {
                decrement: item.quantity,
              },
            },
          });

          await this.createStockMovement(tx, {
            companyId,
            shopId,
            productId: item.productId,
            type: 'SALE',
            quantity: item.quantity,
            beforeQuantity,
            afterQuantity,
            createdById,
            externalId: sale.number,
            supplyPrice: stock.purchasePrice ?? 0,
            retailPrice: item.salePrice,
            newRetailPrice: item.salePrice,
            fromRetailPrice: stock.salePrice ?? 0,
            fromSupplyPrice: stock.purchasePrice ?? 0,
          });
          continue;
        }

        const product = await tx.product.findUnique({
          where: { id: item.productId },
          select: {
            purchasePrice: true,
            salePrice: true,
          },
        });

        await tx.productStock.create({
          data: {
            productId: item.productId,
            branchCode,
            quantity: -item.quantity,
            purchasePrice: product?.purchasePrice ?? 0,
            salePrice: item.salePrice,
          },
        });

        await this.createStockMovement(tx, {
          companyId,
          shopId,
          productId: item.productId,
          type: 'SALE',
          quantity: item.quantity,
          beforeQuantity: 0,
          afterQuantity: -item.quantity,
          createdById,
          externalId: sale.number,
          supplyPrice: product?.purchasePrice ?? 0,
          retailPrice: item.salePrice,
          newRetailPrice: item.salePrice,
          fromRetailPrice: product?.salePrice ?? 0,
          fromSupplyPrice: product?.purchasePrice ?? 0,
        });
      }

      for (const productId of productIds) {
        const totalStock = await tx.productStock.aggregate({
          where: { productId },
          _sum: {
            quantity: true,
          },
        });

        await tx.product.update({
          where: { id: productId },
          data: {
            quantity: totalStock._sum.quantity ?? 0,
          },
        });
      }
    });
  }

  private async restoreSaleStock(sale: {
    id?: number;
    number?: string;
    companyId?: string | null;
    userId?: number | null;
    branchCode: string | null;
    items: Array<{
      productId: number | null;
      quantity: number;
      salePrice: number;
      product?: {
        purchasePrice: number | null;
      } | null;
    }>;
  }) {
    const branchCode = sale.branchCode;
    if (!branchCode) {
      return;
    }
    const shopId = await this.resolveShopIdForBranchCode(
      branchCode,
      sale.companyId ?? null,
    );
    if (!shopId || !sale.companyId || !sale.userId) {
      return;
    }
    const companyId = sale.companyId;
    const createdById = sale.userId;

    const productIds = [
      ...new Set(
        sale.items
          .map((item) => item.productId)
          .filter((value): value is number => typeof value === 'number'),
      ),
    ];

    if (!productIds.length) {
      return;
    }

    await this.prisma.$transaction(async (tx) => {
      for (const item of sale.items) {
        if (!item.productId) {
          continue;
        }

        const stock = await tx.productStock.findFirst({
          where: {
            productId: item.productId,
            branchCode,
          },
        });

        if (stock) {
          const beforeQuantity = stock.quantity;
          const afterQuantity = stock.quantity + item.quantity;
          await tx.productStock.update({
            where: { id: stock.id },
            data: {
              quantity: {
                increment: item.quantity,
              },
            },
          });

          await this.createStockMovement(tx, {
            companyId,
            shopId,
            productId: item.productId,
            type: 'RETURN',
            quantity: item.quantity,
            beforeQuantity,
            afterQuantity,
            createdById,
            externalId: sale.number ?? '',
            supplyPrice: stock.purchasePrice ?? 0,
            retailPrice: item.salePrice,
            newRetailPrice: item.salePrice,
            fromRetailPrice: stock.salePrice ?? 0,
            fromSupplyPrice: stock.purchasePrice ?? 0,
          });
          continue;
        }

        const product = await tx.product.findUnique({
          where: { id: item.productId },
          select: {
            purchasePrice: true,
            salePrice: true,
          },
        });

        await tx.productStock.create({
          data: {
            productId: item.productId,
            branchCode,
            quantity: item.quantity,
            purchasePrice:
              item.product?.purchasePrice ?? product?.purchasePrice ?? 0,
            salePrice: item.salePrice,
          },
        });

        await this.createStockMovement(tx, {
          companyId,
          shopId,
          productId: item.productId,
          type: 'RETURN',
          quantity: item.quantity,
          beforeQuantity: 0,
          afterQuantity: item.quantity,
          createdById,
          externalId: sale.number ?? '',
          supplyPrice:
            item.product?.purchasePrice ?? product?.purchasePrice ?? 0,
          retailPrice: item.salePrice,
          newRetailPrice: item.salePrice,
          fromRetailPrice: product?.salePrice ?? 0,
          fromSupplyPrice:
            item.product?.purchasePrice ?? product?.purchasePrice ?? 0,
        });
      }

      for (const productId of productIds) {
        const totalStock = await tx.productStock.aggregate({
          where: { productId },
          _sum: {
            quantity: true,
          },
        });

        await tx.product.update({
          where: { id: productId },
          data: {
            quantity: totalStock._sum.quantity ?? 0,
          },
        });
      }
    });
  }

  private async getOrCreateOpenSale(context: any, shopId?: string) {
    const branchCode = await this.resolveScopedBranchCode(shopId, context);
    await this.normalizeOpenSalesForContext(context, branchCode);

    const existingSale = await this.prisma.sale.findFirst({
      where: this.buildOpenSaleWhere(context, branchCode),
      include: {
        user: true,
        items: {
          include: {
            product: {
              select: {
                id: true,
                unit: true,
                metadata: true,
              },
            },
          },
        },
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });

    if (existingSale && existingSale.items.length > 0) {
      return existingSale;
    }

    if (existingSale && existingSale.items.length === 0) {
      await this.prisma.sale.delete({
        where: { id: existingSale.id },
      });
    }

    return this.prisma.sale.create({
      data: {
        companyId:
          context?.userType === 'company'
            ? (context.companyId ?? undefined)
            : undefined,
        number: this.generateOrderNumber(),
        status: 'open',
        isDraft: true,
        branchCode: branchCode ?? context?.currentBranchCode ?? undefined,
        userId: context?.userId ?? undefined,
      },
      include: {
        user: true,
        items: {
          include: {
            product: {
              select: {
                id: true,
                unit: true,
                metadata: true,
              },
            },
          },
        },
      },
    });
  }

  private async normalizeOpenSalesForContext(
    context: any,
    branchCode?: string,
    keepSaleId?: number,
  ) {
    const openSales = await this.prisma.sale.findMany({
      where: this.buildOpenSaleWhere(context, branchCode, keepSaleId),
      include: {
        items: true,
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });

    if (!openSales.length) {
      return;
    }

    const salesWithItems = openSales.filter((sale) => sale.items.length > 0);
    const reusableSaleId = salesWithItems[0]?.id;
    const deleteIds = openSales
      .filter((sale) => sale.items.length === 0)
      .map((sale) => sale.id);
    const draftIds = openSales
      .filter(
        (sale) => sale.items.length > 0 && sale.id !== reusableSaleId,
      )
      .map((sale) => sale.id);

    if (deleteIds.length) {
      await this.prisma.sale.deleteMany({
        where: {
          id: {
            in: deleteIds,
          },
        },
      });
    }

    if (draftIds.length) {
      await this.prisma.sale.updateMany({
        where: {
          id: {
            in: draftIds,
          },
        },
        data: {
          status: 'draft',
        },
      });
    }
  }

  private buildOpenSaleWhere(
    context: any,
    branchCode?: string,
    keepSaleId?: number,
  ): Prisma.SaleWhereInput {
    return {
      AND: [
        this.buildSaleScope(context) ?? {},
        {
          isDraft: true,
          status: 'open',
          ...(typeof context?.userId === 'number'
            ? { userId: context.userId }
            : {}),
          ...(branchCode ? { branchCode } : {}),
          ...(keepSaleId ? { id: { not: keepSaleId } } : {}),
        },
      ],
    };
  }

  private async findSaleOrThrow(id: number) {
    const sale = await this.prisma.sale.findUnique({
      where: { id },
      include: {
        user: true,
        items: {
          include: {
            product: {
              select: {
                id: true,
                unit: true,
                metadata: true,
              },
            },
          },
        },
      },
    });

    if (!sale) {
      throw new NotFoundException('Sale not found');
    }

    return sale;
  }

  private async findClientForSaleOrThrow(
    clientId: string,
    companyId?: string | null,
  ) {
    const normalizedClientId = clientId.trim();
    if (!normalizedClientId) {
      throw new BadRequestException('client_id is required');
    }

    const client = await (this.prisma as any).client.findFirst({
      where: {
        id: normalizedClientId,
        ...(companyId ? { companyId } : {}),
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        middleName: true,
      },
    });

    if (!client) {
      throw new NotFoundException('Client not found');
    }

    return client;
  }

  private buildClientDisplayName(client: {
    firstName: string;
    lastName?: string | null;
    middleName?: string | null;
  }) {
    return [client.lastName, client.firstName, client.middleName]
      .filter((part): part is string => !!part?.trim())
      .join(' ');
  }

  private async resolveSaleClientPayload(
    body: Record<string, unknown>,
    companyId?: string | null,
    fallback?: {
      clientId?: string | null;
      clientName?: string | null;
    },
  ) {
    const rawClientId =
      this.optionalString(body.client_id) ??
      this.optionalString(body.customer_id) ??
      this.optionalString(body.clientId) ??
      this.optionalString(body.customerId);

    if (rawClientId) {
      const client = await this.findClientForSaleOrThrow(rawClientId, companyId);
      return {
        clientId: client.id,
        clientName: this.buildClientDisplayName(client),
      };
    }

    const clientName = this.optionalString(body.client_name);
    return {
      clientId: fallback?.clientId ?? null,
      clientName: clientName ?? fallback?.clientName ?? null,
    };
  }

  private toDraftSummary(
    sale: {
      id: number;
      number: string;
      status?: string;
      parkNote?: string | null;
      discountPercent: number;
      discountAmount: number;
      payableTotal: number;
      clientId?: string | null;
      clientName?: string | null;
    },
    context?: any,
  ) {
    return {
      id: sale.id,
      sid: sale.number,
      number: sale.number,
      order_number: sale.number,
      status: sale.status ?? 'draft',
      park_status: sale.status === 'parked' ? 'parked' : '',
      park_note: sale.parkNote ?? '',
      discount_percent: sale.discountPercent,
      discount_amount: sale.discountAmount,
      payable_total: sale.payableTotal,
      client_id: sale.clientId ?? null,
      customer_id: sale.clientId ?? '',
      client_name: sale.clientName ?? null,
    };
  }

  private toDraftResponse(
    sale: {
      id: number;
      number: string;
      saleType?: string;
      parentSaleId?: number | null;
      status: string;
      parkNote?: string | null;
      clientId?: string | null;
      clientName?: string | null;
      discountPercent: number;
      discountAmount: number;
      payableTotal: number;
      total: number;
      items: {
        id: number;
        productId: number | null;
        name: string;
        salePrice: number;
        barcode: string | null;
        sku: string | null;
        quantity: number;
        product?: {
          id: number;
          unit?: string | null;
          metadata?: unknown;
        } | null;
      }[];
    },
    context?: any,
  ) {
    return {
      id: sale.id,
      sid: sale.number,
      number: sale.number,
      order_number: sale.number,
      status: sale.status,
      park_status: sale.status === 'parked' ? 'parked' : '',
      park_note: sale.parkNote ?? '',
      discount_percent: sale.discountPercent,
      discount_amount: sale.discountAmount,
      payable_total: sale.payableTotal,
      total: sale.total,
      client_id: sale.clientId ?? null,
      customer_id: sale.clientId ?? '',
      client_name: sale.clientName ?? null,
      items: sale.items.map((item) => ({
        id: item.id,
        product_id: item.productId,
        product:
          item.productId && item.product
            ? {
                id: item.product.id,
                measurement_type: this.resolveMeasurementType(
                  item.product.unit,
                  this.extractMeasurementUnitShortName(item.product.metadata),
                ),
                measurement_unit: this.resolveMeasurementUnitFromMetadata(
                  item.product.metadata,
                  COMPANY_ID,
                ),
              }
            : item.productId
              ? { id: item.productId }
              : null,
        name: item.name,
        sale_price: item.salePrice,
        barcode: item.barcode,
        sku: item.sku,
        quantity: item.quantity,
      })),
    };
  }

  private toSaleListItem(
    sale: {
      id: number;
      number: string;
      saleType?: string;
      parentSaleId?: number | null;
      createdAt: Date;
      status: string;
      parkNote?: string | null;
      payableTotal: number;
      total: number;
      discountAmount: number;
      clientId?: string | null;
      paymentMethod: string | null;
      clientName: string | null;
      branchCode: string | null;
      user: { firstName: string; lastName: string } | null;
      items: {
        id: number;
        productId: number | null;
        name: string;
        salePrice: number;
        quantity: number;
        barcode: string | null;
        sku: string | null;
      }[];
    },
    context?: any,
    shopLookup?: Map<string, { shop_id: string; shop_name: string }>,
    paymentTypeLookup?: Map<
      string,
      {
        id: string;
        name: string;
        payment_type_id: string;
        payment_type_name: string;
      }
    >,
  ) {
    const sellerName = sale.user
      ? `${sale.user.firstName} ${sale.user.lastName}`.trim()
      : null;
    const shop = sale.branchCode
      ? this.resolveShopByBranchCode(sale.branchCode, shopLookup)
      : null;
    const payment = sale.paymentMethod
      ? paymentTypeLookup?.get(sale.paymentMethod)
      : undefined;

    return {
      id: sale.id,
      number: sale.number,
      sale_number: sale.number,
      sale_type: sale.saleType ?? 'sale',
      parent_order_id: sale.parentSaleId ? String(sale.parentSaleId) : null,
      created_at: sale.createdAt,
      status: sale.status,
      park_status: sale.status === 'parked' ? 'parked' : '',
      park_note: sale.parkNote ?? '',
      payable_total: sale.payableTotal,
      total: sale.total,
      amount: sale.payableTotal,
      grand_total: sale.payableTotal,
      discount_amount: sale.discountAmount,
      discount: sale.discountAmount,
      seller_name: sellerName,
      shop_id: shop?.shop_id ?? sale.branchCode,
      branch_title: shop?.shop_name ?? sale.branchCode,
      branch_name: shop?.shop_name ?? sale.branchCode,
      shop: shop
        ? {
            id: shop.shop_id,
            name: shop.shop_name,
          }
        : null,
      payment_method: sale.paymentMethod,
      payment_type: sale.paymentMethod,
      payment: payment
        ? {
            id: payment.id,
            name: payment.name,
            payment_type_id: payment.payment_type_id,
            payment_type_name: payment.payment_type_name,
          }
        : sale.paymentMethod
          ? {
              id: sale.paymentMethod,
              name: sale.paymentMethod,
              payment_type_id: '',
              payment_type_name: '',
            }
          : null,
      client_id: sale.clientId ?? null,
      customer_id: sale.clientId ?? '',
      client_name: sale.clientName,
      items: sale.items.map((item) => ({
        id: item.id,
        product_id: item.productId,
        name: item.name,
        sale_price: item.salePrice,
        barcode: item.barcode,
        sku: item.sku,
        quantity: item.quantity,
      })),
    };
  }

  private async toV2OrderResponse(
    sale: {
      id: number;
      number: string;
      saleType?: string;
      parentSaleId?: number | null;
      status: string;
      parkNote?: string | null;
      branchCode: string | null;
      createdAt: Date;
      updatedAt: Date;
      isDraft: boolean;
      discountPercent: number;
      total: number;
      payableTotal: number;
      discountAmount: number;
      clientId?: string | null;
      clientName?: string | null;
      paymentMethod: string | null;
      user: { id: number; firstName: string; lastName: string } | null;
      items: {
        id: number;
        productId: number | null;
        name: string;
        sku: string | null;
        barcode: string | null;
        quantity: number;
        salePrice: number;
        lineTotal: number;
        discountAmount?: number;
        finalPrice?: number;
        product: {
          id: number;
          name: string;
          sku: string | null;
          barcode: string | null;
          unit?: string | null;
          metadata?: unknown;
          productType: string | null;
          purchasePrice: number | null;
          salePrice: number | null;
          category: { id: number; name: string } | null;
          brand: { id: number; name: string } | null;
          stocks: {
            branchCode: string;
            quantity: number;
            purchasePrice: number | null;
            salePrice: number | null;
          }[];
        } | null;
      }[];
    },
    context?: any,
    shopLookup?: Map<string, { shop_id: string; shop_name: string }>,
  ) {
    const shop = this.resolveShopByBranchCode(
      sale.branchCode ?? '',
      shopLookup,
    );
    const paymentTypeLookup = await this.buildPaymentTypeLookup(
      context?.companyId,
    );
    const payment = sale.paymentMethod
      ? paymentTypeLookup.get(sale.paymentMethod)
      : undefined;
    const retailTotal = sale.items.reduce(
      (sum, item) => sum + (item.lineTotal || item.quantity * item.salePrice || 0),
      0,
    );
    const orderItems = sale.items.map((item, index) => {
      const baseTotal = Number(item.lineTotal || item.quantity * item.salePrice || 0);
      const percentPart = baseTotal * ((sale.discountPercent || 0) / 100);
      const flatPart =
        retailTotal > 0 ? ((sale.discountAmount || 0) * baseTotal) / retailTotal : 0;
      const fallbackDiscountAmount = Number((percentPart + flatPart).toFixed(2));
      const discountAmount = Number(
        (
          sale.isDraft
            ? fallbackDiscountAmount
            : (item.discountAmount ?? fallbackDiscountAmount)
        ).toFixed(2),
      );
      const finalPrice = Number(
        (
          sale.isDraft
            ? Math.max(0, baseTotal - fallbackDiscountAmount)
            : (item.finalPrice ?? Math.max(0, baseTotal - discountAmount))
        ).toFixed(2),
      );
      const discountPercent =
        baseTotal > 0 ? Number(((discountAmount / baseTotal) * 100).toFixed(2)) : 0;

      return {
        id: String(item.id),
        sellers: sale.user
          ? [
              {
                id: randomUUID(),
                seller_id: String(sale.user.id),
                seller: {
                  name: `${sale.user.firstName} ${sale.user.lastName}`.trim(),
                  first_name: sale.user.firstName,
                  last_name: sale.user.lastName,
                },
                item_id: '',
              },
            ]
          : [],
        product: item.product ? this.toOrderProductResponse(item.product) : null,
        product_id: item.productId ? String(item.productId) : '',
        product_type_id: item.product?.productType ?? DEFAULT_PRODUCT_TYPE_ID,
        product_variant_id: '',
        name: item.name,
        sku: item.sku ?? '',
        barcode: item.barcode ?? '',
        retail_price: item.salePrice,
        supply_price: item.product?.purchasePrice ?? 0,
        total_price: finalPrice,
        price: item.salePrice,
        sale_price: item.salePrice,
        rounding_price: 0,
        discount_value: discountAmount,
        discount_unit: discountAmount > 0 ? 'amount' : '',
        discount_amount: discountAmount,
        discount_percent: discountPercent,
        measurement_value: item.quantity,
        returned_measurement_value: sale.saleType === 'return' ? item.quantity : 0,
        measurement_type: this.resolveMeasurementType(
          item.product?.unit,
          this.extractMeasurementUnitShortName(item.product?.metadata),
        ),
        sequence_number: index + 1,
        is_returned: sale.saleType === 'return',
        has_manual_discount: discountAmount > 0,
        promo_id: '',
        promo_ids: null,
        promo_shorts: null,
        used_wholesale_price: false,
        return_days_with_discount: 0,
        free_price: false,
        order_detail_id: '',
        marking_codes: null,
        marking_code_infos: null,
        order_product_id: 0,
        sale_order_item_id: '',
      };
    });
    const totalDiscountAmount = Number(
      orderItems.reduce((sum, item) => sum + item.discount_amount, 0).toFixed(2),
    );
    const paidAmount = Number((sale.payableTotal || sale.total || 0).toFixed(2));
    const totalPrice = Number(
      (
        sale.isDraft
          ? orderItems.reduce((sum, item) => sum + item.total_price, 0)
          : paidAmount
      ).toFixed(2),
    );
    const hasDiscount =
      totalDiscountAmount > 0 ||
      sale.discountAmount > 0 ||
      sale.discountPercent > 0;

    return {
      id: String(sale.id),
      parent_id: sale.parentSaleId ? String(sale.parentSaleId) : '',
      company_id: context?.companyId ?? COMPANY_ID,
      order_number: sale.number,
      order_status: sale.status,
      order_type:
        sale.saleType === 'return'
          ? 'RETURN'
          : sale.saleType === 'exchange'
            ? 'EXCHANGE'
            : 'SALE',
      order_detail: {
        id: String(sale.id),
        order_id: String(sale.id),
        customer: {
          id: sale.clientId ?? '',
          full_name: sale.clientName ?? '',
          name: sale.clientName ?? '',
          customer_type: 'new',
        },
        user_id: sale.user ? String(sale.user.id) : '',
        user: {
          id: sale.user ? String(sale.user.id) : '',
          name: sale.user
            ? `${sale.user.firstName} ${sale.user.lastName}`.trim()
            : '',
          first_name: sale.user?.firstName ?? '',
          last_name: sale.user?.lastName ?? '',
        },
        cashbox_name: '',
        cashbox_id: '',
        cashbox_history_id: '',
        shift_id: 0,
        shop_id: shop.shop_id,
        shop: {
          id: shop.shop_id,
          name: shop.shop_name,
        },
        total_price: totalPrice,
        subtotal_price: sale.total,
        discount_amount: totalDiscountAmount,
        discount_percent: sale.discountPercent,
        has_discount: hasDiscount,
        total_products_measurement_value: sale.items.reduce(
          (sum, item) => sum + item.quantity,
          0,
        ),
        total_sets_measurement_value: 0,
        total_services_measurement_value: 0,
        total_returned_measurement_value:
          sale.saleType === 'return'
            ? sale.items.reduce((sum, item) => sum + item.quantity, 0)
            : 0,
        version_number: 1,
        comment: '',
        created_at: this.formatDateTime(sale.createdAt, context?.companyId),
        created_at_utc: '',
        order_items: orderItems,
        order_payments:
          !sale.isDraft && sale.paymentMethod
            ? [
                {
                  id: randomUUID(),
                  company_payment_type_id: sale.paymentMethod,
                  payment_sub_type_id: '',
                  payment_sub_type_name: '',
                  company_payment_type: {
                    id: sale.paymentMethod,
                    name: payment?.name ?? sale.paymentMethod,
                    payment_type_id: payment?.payment_type_id ?? '',
                  },
                  paid_amount: paidAmount,
                  returned_amount: 0,
                  gift_card_id: 0,
                  is_certificate: false,
                  is_voucher: false,
                  is_ingenico: false,
                  card_type: '',
                  card_rrn: '',
                  card_number: '',
                  document_number: '',
                  operation_id: '',
                  stan: '',
                  approval_code: '',
                  ref_number: '',
                  hash_low: null,
                  hash_high: null,
                  trx_status: '',
                },
              ]
            : [],
        with_cashback: 0,
        returned_cashback: 0,
        loyalty_balance_income: 0,
        loyalty_balance_outcome: 0,
        loyalty_payment: 0,
        not_loyalty_payment: 0,
        gift_card_payment: 0,
        is_authorized: false,
        has_certificate: false,
        has_voucher: false,
        promo_codes: null,
        without_cashback: false,
        user_has_auth_role: false,
        offline_order_validation_status: 0,
        applied_on_cart: false,
        auth_client_cashback_withdrawal: false,
        has_payment_token: false,
        payment_token: '',
      },
      created_at: this.formatDateTime(sale.createdAt, context?.companyId),
      deleted_at: 0,
      created_at_utc: '',
      future_time: '',
      debt: null,
      customer_id: sale.clientId ?? '',
      parent_order_debt: null,
      deleted: false,
      deleted_by_user_id: '',
      deleted_by_user_name: '',
      webkassa_log_qty: 0,
      epos_log_qty: 0,
      epos_logs: null,
      finished_at: '',
      display_finished_at: '',
      sold_at: sale.isDraft ? '' : this.formatDateTime(sale.updatedAt, context?.companyId),
      display_sold_at: '',
      display_deleted_at: '',
      order_debt_payments: null,
      park_status: sale.status === 'parked' ? 'parked' : '',
      park_note: sale.parkNote ?? '',
      exchange_disabled: false,
      total_remaining_debt_in_chain: 0,
      updated_at: this.formatDateTime(sale.updatedAt, context?.companyId),
      has_insurance: false,
      insurance: null,
      is_calculated: true,
    };
  }

  private toOrderProductResponse(product: {
    id: number;
    name: string;
    sku: string | null;
    barcode: string | null;
    unit?: string | null;
    metadata?: unknown;
    productType: string | null;
    purchasePrice: number | null;
    salePrice: number | null;
    category: { id: number; name: string } | null;
    brand: { id: number; name: string } | null;
    stocks: {
      branchCode: string;
      quantity: number;
      purchasePrice: number | null;
      salePrice: number | null;
    }[];
  }) {
    const measurementUnit = this.resolveMeasurementUnitFromMetadata(
      product.metadata,
      COMPANY_ID,
    );
    return {
      id: String(product.id),
      name: product.name,
      base_name: product.name,
      barcode: product.barcode,
      additional_barcodes: null,
      sku: product.sku,
      category_name: product.category?.name ?? '',
      brand_name: product.brand?.name ?? '',
      category_id: product.category ? String(product.category.id) : '',
      brand_id: product.brand ? String(product.brand.id) : '',
      main_image_url: '',
      main_image: '',
      retail_price: product.salePrice ?? 0,
      supply_price: product.purchasePrice ?? 0,
      measurement_unit: measurementUnit,
      product_type_id: product.productType ?? DEFAULT_PRODUCT_TYPE_ID,
      categories: null,
      shop_measurement_values: null,
      shop_prices: product.stocks.map((stock) => ({
        shop_id: this.resolveShopByBranchCode(stock.branchCode).shop_id,
        retail_price: stock.salePrice ?? product.salePrice ?? 0,
        supply_price: stock.purchasePrice ?? product.purchasePrice ?? 0,
        wholesale_price: 0,
        min_price: 0,
        max_price: 0,
        min_supply_price: stock.purchasePrice ?? product.purchasePrice ?? 0,
        max_supply_price: stock.purchasePrice ?? product.purchasePrice ?? 0,
      })),
      custom_fields: [],
      set_products: [],
      free_price: false,
      amount: 0,
      gift_card_id: 0,
      gift_card_use_type: '',
      status: '',
      shop_free_prices: product.stocks.map((stock) => ({
        shop_id: this.resolveShopByBranchCode(stock.branchCode).shop_id,
        sell_with_free_price: false,
      })),
    };
  }

  private toNewSaleProductResponse(
    product: {
      id: number;
      name: string;
      sku: string | null;
      barcode: string | null;
      photo: string | null;
      unit?: string | null;
      purchasePrice: number | null;
      salePrice: number | null;
      productType: string | null;
      metadata: unknown;
      category: { name: string } | null;
      brand: { name: string } | null;
      stocks: {
        branchCode: string;
        quantity: number;
        purchasePrice: number | null;
        salePrice: number | null;
      }[];
    },
    branchCode?: string,
    context?: any,
  ) {
    const currencyCode = this.companySettingsService.getDefaultCurrencyIsoCode(
      context?.companyId,
    );
    const relevantStocks = branchCode
      ? product.stocks.filter((stock) => stock.branchCode === branchCode)
      : product.stocks;
    const selectedStocks = relevantStocks.length
      ? relevantStocks
      : product.stocks;
    const totalMeasurementValue = selectedStocks.reduce(
      (sum, stock) => sum + stock.quantity,
      0,
    );
    const metadata =
      product.metadata &&
      typeof product.metadata === 'object' &&
      !Array.isArray(product.metadata)
        ? (product.metadata as Record<string, unknown>)
        : undefined;

    return {
      id: String(product.id),
      company_id: context?.companyId ?? COMPANY_ID,
      name: product.name,
      sku: product.sku,
      barcode: product.barcode,
      additional_barcodes: null,
      retail_price: product.salePrice ?? 0,
      supply_price: product.purchasePrice ?? 0,
      description:
      typeof metadata?.description === 'string'
          ? metadata.description
          : undefined,
      measurement_type: this.resolveMeasurementType(
        product.unit,
        this.extractMeasurementUnitShortName(product.metadata),
      ),
      measurement_values: {
        total_measurement_value: totalMeasurementValue,
        total_active_measurement_value: totalMeasurementValue,
        total_inactive_measurement_value: 0,
      },
      measurement_unit: this.resolveMeasurementUnitFromMetadata(
        product.metadata,
        context?.companyId ?? COMPANY_ID,
      ),
      shop_measurement_values: selectedStocks.map((stock) => {
        const retailPrice = stock.salePrice ?? product.salePrice ?? 0;
        const supplyPrice = stock.purchasePrice ?? product.purchasePrice ?? 0;
        return {
          small_left_measurement_value: 0,
          has_trigger: false,
          shop_id: this.resolveShopByBranchCode(stock.branchCode).shop_id,
          total_measurement_value: stock.quantity,
          total_min_supply_price: supplyPrice,
          total_max_supply_price: supplyPrice,
          total_supply_sum: stock.quantity * supplyPrice,
          total_active_measurement_value: stock.quantity,
          total_active_min_supply_price: supplyPrice,
          total_active_max_supply_price: supplyPrice,
          total_active_supply_sum: stock.quantity * supplyPrice,
          total_inactive_measurement_value: 0,
          total_inactive_min_supply_price: null,
          total_inactive_max_supply_price: null,
          total_inactive_supply_sum: 0,
          total_sold_measurement_value: 0,
          total_imported_measurement_value: 0,
          total_transfer_arrived_measurement_value: 0,
          total_transfered_measurement_value: 0,
          total_in_transfer_measurement_value: 0,
          total_in_transfer_min_supply_price: null,
          total_in_transfer_max_supply_price: null,
          total_in_transfer_supply_sum: 0,
          total_written_off_measurement_value: 0,
          import_started_measurement_value: 0,
          is_small_left: false,
          total_retail_sum: stock.quantity * retailPrice,
          total_active_retail_sum: stock.quantity * retailPrice,
          total_inactive_retail_sum: 0,
        };
      }),
      shop_prices: selectedStocks.map((stock) => {
        const retailPrice = stock.salePrice ?? product.salePrice ?? 0;
        const supplyPrice = stock.purchasePrice ?? product.purchasePrice ?? 0;
        return {
          shop_id: this.resolveShopByBranchCode(stock.branchCode).shop_id,
          retail_price: retailPrice,
          retail_currency: currencyCode,
          supply_currency: currencyCode,
          min_supply_price: supplyPrice,
          max_supply_price: supplyPrice,
          supply_price: supplyPrice,
          wholesale_price: 0,
          min_price: 0,
          max_price: 0,
          prices_list: [],
          from_supply_price: 0,
          currency_prices: [
            {
              currency: currencyCode,
              retail_price: retailPrice,
              min_supply_price: supplyPrice,
              max_supply_price: supplyPrice,
              supply_price: supplyPrice,
              wholesale_price: 0,
              min_price: 0,
              max_price: 0,
              prices_list: [],
            },
          ],
          promo_price: 0,
          promos: null,
        };
      }),
      prices: {
        total_supply_price: 0,
        total_retail_price: 0,
        total_active_supply_price: 0,
        total_active_retail_price: 0,
        total_inactive_supply_price: 0,
        total_inactive_retail_price: 0,
      },
      product_type_id: product.productType ?? DEFAULT_PRODUCT_TYPE_ID,
      brand_name: product.brand?.name ?? null,
      base_name: product.name,
      archived_by: {
        id: '',
        name: '',
      },
      product_supply_stock: null,
      status: 0,
      scale_plu: 0,
      scale_code: 0,
      is_scalable: false,
      shop_free_prices: selectedStocks.length
        ? selectedStocks.map((stock) => ({
            shop_id: this.resolveShopByBranchCode(stock.branchCode).shop_id,
            sell_with_free_price: false,
          }))
        : null,
    };
  }

  private generateOrderNumber() {
    return Date.now().toString().slice(-12);
  }

  private getSignedSaleAmount(sale: {
    payableTotal?: number | null;
    total?: number | null;
    saleType?: string;
  }) {
    const amount = sale.payableTotal || sale.total || 0;
    return sale.saleType === 'return' ? -amount : amount;
  }

  private toBoolean(value: unknown) {
    if (typeof value === 'boolean') {
      return value;
    }

    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (normalized === 'true') {
        return true;
      }

      if (normalized === 'false') {
        return false;
      }
    }

    return undefined;
  }

  private toNumber(value: unknown) {
    if (value === undefined || value === null || value === '') {
      return undefined;
    }

    const parsed = Number(value);
    if (Number.isNaN(parsed)) {
      throw new BadRequestException('Numeric field contains invalid number');
    }

    return parsed;
  }

  private toInt(value: unknown) {
    const parsed = this.toNumber(value);
    if (parsed === undefined) {
      return undefined;
    }

    return Math.trunc(parsed);
  }

  private optionalString(value: unknown) {
    if (typeof value !== 'string') {
      return undefined;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  private async resolvePaymentMethod(
    requestedPaymentMethod?: string,
    companyId?: string | null,
  ) {
    if (requestedPaymentMethod && requestedPaymentMethod !== 'cash') {
      return requestedPaymentMethod;
    }

    return (
      (await this.findDefaultPaymentMethod(companyId)) ??
      requestedPaymentMethod ??
      null
    );
  }

  private async findDefaultPaymentMethod(companyId?: string | null) {
    const companyPaymentTypes =
      await this.companySettingsService.getCompanyPaymentTypes(
        undefined,
        companyId ?? undefined,
      );
    const paymentTypes = companyPaymentTypes.company_payment_types as Array<
      Record<string, unknown>
    >;
    const cashPaymentType =
      paymentTypes.find(
        (paymentType) => paymentType.is_cash_payment_type === true,
      ) ??
      paymentTypes.find(
        (paymentType) => paymentType.dont_show_in_make_payment !== true,
      ) ??
      paymentTypes[0];

    return typeof cashPaymentType?.id === 'string'
      ? cashPaymentType.id
      : undefined;
  }

  private parseEntityId(value: string, fieldName: string) {
    const parsed = Number(value);
    if (!Number.isInteger(parsed)) {
      throw new BadRequestException(`${fieldName} must be a number`);
    }

    return parsed;
  }

  private parseOptionalEntityId(value: string) {
    const parsed = Number(value);
    return Number.isInteger(parsed) ? parsed : undefined;
  }

  private emptyOrderDraftDebt(orderId: string, amount = 0) {
    return {
      order_id: orderId,
      total_debt_amount: 0,
      total_paid_debt_amount: 0,
      total_unpaid_debt_amount: 0,
      total_remaining_debt_in_chain: 0,
      order_debt_payments: [],
      debt: null,
      amount,
    };
  }

  private emptyOrderSearchStats() {
    return {
      total_products_measurement_value: 0,
      total_services_measurement_value: 0,
      total_sets_measurement_value: 0,
      total_returned_measurement_value: 0,
      total_exchange_measurement_value: 0,
      total_returnals_count: 0,
      total_exchanges_count: 0,
      total_returnals_sum: 0,
      total_exchanges_sum: 0,
      total_transactions_sum: 0,
      payment_types_stats: [],
      total_with_cashback: 0,
      total_loyalty_balance_income: 0,
      total_returned_cashback: 0,
      total_debt_amount: 0,
      total_paid_debt_amount: 0,
      total_unpaid_debt_amount: 0,
      total_returned_debt_amount: 0,
      debt_payment_stats: null,
      insurance_payment_stats: null,
      count: 0,
      total_certificate_amount: 0,
      total_certificate_count: 0,
    };
  }

  private buildOrderSearchWhere(
    query: Record<string, string | undefined>,
    context: any,
  ) {
    const andFilters: Record<string, unknown>[] = [{ isDraft: false }];
    const scope = this.buildSaleScope(context);

    if (scope) {
      andFilters.push(scope);
    } else if (query.company_id) {
      andFilters.push({
        companyId: query.company_id,
      });
    }

    const startDate = this.parseDateOnly(query.start_date);
    if (startDate) {
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 1);
      andFilters.push({
        createdAt: {
          gte: startDate,
          lt: endDate,
        },
      });
    }

    const search = query.search?.trim();
    if (search) {
      andFilters.push({
        OR: [
          {
            number: {
              contains: search,
              mode: 'insensitive' as const,
            },
          },
          {
            clientName: {
              contains: search,
              mode: 'insensitive' as const,
            },
          },
        ],
      });
    }

    return andFilters.length ? { AND: andFilters } : undefined;
  }

  private parseDateOnly(value?: string) {
    if (!value) {
      return undefined;
    }

    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) {
      return undefined;
    }

    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  }

  private async createDebtForFinalizedSale(
    tx: Prisma.TransactionClient,
    sale: {
      id: number;
      companyId?: string | null;
      branchCode?: string | null;
      clientId?: string | null;
      payableTotal?: number | null;
      total?: number | null;
    },
    body: Record<string, unknown>,
    context?: {
      userId?: number;
      companyId?: string | null;
    } | null,
  ) {
    const debtInput = this.parseDebtPayload(body, sale.payableTotal || sale.total || 0);
    if (!debtInput) {
      return null;
    }
    if (!sale.clientId) {
      throw new BadRequestException('client_id is required to create debt');
    }

    const shop = sale.branchCode
      ? await tx.shop.findFirst({
          where: {
            branchCode: sale.branchCode,
            ...(sale.companyId ?? context?.companyId
              ? { companyId: sale.companyId ?? context?.companyId ?? undefined }
              : {}),
          },
          select: { id: true },
        })
      : null;

    await tx.clientDebt.create({
      data: {
        companyId: sale.companyId ?? context?.companyId ?? '',
        clientId: sale.clientId,
        saleId: sale.id,
        shopId: shop?.id ?? null,
        amountUzs: debtInput.amount,
        remainingAmountUzs: debtInput.amount,
        repaidAmountUzs: new Prisma.Decimal(0),
        dueDate: debtInput.dueDate,
        status: ClientDebtStatus.unpaid,
        comment: debtInput.comment,
        receiptUrl: debtInput.receiptUrl,
      },
    });

    const aggregate = await tx.clientDebt.aggregate({
      where: {
        companyId: sale.companyId ?? context?.companyId ?? '',
        clientId: sale.clientId,
      },
      _sum: { remainingAmountUzs: true },
    });

    await tx.client.update({
      where: { id: sale.clientId },
      data: {
        debtUzs: aggregate._sum.remainingAmountUzs ?? new Prisma.Decimal(0),
      },
    });
  }

  private async refreshClientSalesAggregates(
    tx: Prisma.TransactionClient,
    companyId?: string | null,
    clientId?: string | null,
  ) {
    if (!companyId || !clientId) {
      return;
    }

    const [visitsCount, aggregate] = await Promise.all([
      tx.sale.count({
        where: {
          companyId,
          clientId,
          isDraft: false,
          saleType: { in: ['sale', 'exchange'] },
        } as any,
      }),
      tx.sale.aggregate({
        where: {
          companyId,
          clientId,
          isDraft: false,
          saleType: { in: ['sale', 'exchange'] },
        } as any,
        _sum: {
          payableTotal: true,
        },
        _max: {
          paidAt: true,
          createdAt: true,
        },
      }),
    ]);

    await tx.client.update({
      where: { id: clientId },
      data: {
        totalPurchasesUzs: new Prisma.Decimal(
          Number(aggregate._sum?.payableTotal ?? 0),
        ),
        visitsCount,
        lastPurchaseAt:
          aggregate._max?.paidAt ?? aggregate._max?.createdAt ?? null,
      },
    });
  }

  private parseDebtPayload(
    body: Record<string, unknown>,
    saleAmount: number,
  ) {
    const debtRecord =
      body.debt && typeof body.debt === 'object' && !Array.isArray(body.debt)
        ? (body.debt as Record<string, unknown>)
        : undefined;
    const amountValue =
      debtRecord?.amount_uzs ??
      debtRecord?.debt_amount_uzs ??
      debtRecord?.amount ??
      body.debt_amount_uzs ??
      body.debt_amount ??
      body.debt_sum ??
      (typeof body.debt === 'string' || typeof body.debt === 'number'
        ? body.debt
        : undefined);
    const dueDateValue =
      debtRecord?.due_date ?? debtRecord?.debt_due_date ?? body.due_date ?? body.debt_due_date;
    const commentValue =
      debtRecord?.comment ?? debtRecord?.debt_comment ?? body.comment ?? body.debt_comment ?? body.note;
    const receiptUrlValue =
      debtRecord?.receipt_url ?? body.receipt_url;

    const explicitAmount = this.toNumber(amountValue);
    const dueDate = this.parseNullableDebtDate(dueDateValue);
    const comment = this.optionalString(commentValue) ?? null;
    const receiptUrl = this.optionalString(receiptUrlValue) ?? null;
    const shouldCreateDebt =
      explicitAmount !== undefined || !!dueDate || !!comment || !!receiptUrl;

    if (!shouldCreateDebt) {
      return null;
    }

    const resolvedAmount = explicitAmount ?? saleAmount;
    if (!resolvedAmount || resolvedAmount <= 0) {
      throw new BadRequestException('Debt amount must be greater than zero');
    }
    if (resolvedAmount > saleAmount) {
      throw new BadRequestException('Debt amount cannot exceed sale total');
    }

    return {
      amount: new Prisma.Decimal(resolvedAmount),
      dueDate,
      comment,
      receiptUrl,
    };
  }

  private parseNullableDebtDate(value: unknown) {
    const raw = this.optionalString(value);
    if (!raw) {
      return null;
    }
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
    if (!match) {
      throw new BadRequestException('Invalid debt due_date');
    }
    return new Date(`${raw}T00:00:00.000Z`);
  }

  private resolveShopByBranchCode(
    branchCode: string,
    shopLookup?: Map<string, { shop_id: string; shop_name: string }>,
  ) {
    const normalizedBranchCode = branchCode.trim();
    const resolvedShopFromLookup = shopLookup?.get(normalizedBranchCode);
    if (resolvedShopFromLookup) {
      return resolvedShopFromLookup;
    }
    const loweredBranchCode = normalizedBranchCode.toLowerCase();
    const resolvedShop = Object.entries(SHOP_BY_BRANCH_CODE).find(
      ([canonicalBranchCode, shop]) =>
        canonicalBranchCode === normalizedBranchCode ||
        shop.id === normalizedBranchCode ||
        shop.shop_id === normalizedBranchCode ||
        shop.shop_name.toLowerCase() === loweredBranchCode ||
        (shop.aliases ?? []).includes(normalizedBranchCode),
    )?.[1];

    return (
      resolvedShop ?? {
        shop_id: normalizedBranchCode,
        shop_name: normalizedBranchCode,
      }
    );
  }

  private async buildShopLookupByBranchCodes(
    branchCodes: string[],
    companyId?: string | null,
  ) {
    const normalizedBranchCodes = [
      ...new Set(
        branchCodes.map((branchCode) => branchCode.trim()).filter(Boolean),
      ),
    ];
    const shopLookup = new Map<
      string,
      { shop_id: string; shop_name: string }
    >();

    if (!normalizedBranchCodes.length) {
      return shopLookup;
    }

    const shops = await this.prisma.shop.findMany({
      where: {
        branchCode: {
          in: normalizedBranchCodes,
        },
        ...(companyId ? { companyId } : {}),
      },
      select: {
        id: true,
        name: true,
        branchCode: true,
      },
    });

    for (const shop of shops) {
      shopLookup.set(shop.branchCode, {
        shop_id: shop.id,
        shop_name: shop.name,
      });
    }

    return shopLookup;
  }

  private async buildPaymentTypeLookup(companyId?: string | null) {
    const companyPaymentTypes =
      await this.companySettingsService.getCompanyPaymentTypes(
        undefined,
        companyId ?? undefined,
      );
    const lookup = new Map<
      string,
      {
        id: string;
        name: string;
        payment_type_id: string;
        payment_type_name: string;
      }
    >();

    for (const paymentType of companyPaymentTypes.company_payment_types as Array<
      Record<string, unknown>
    >) {
      const paymentTypeMeta =
        paymentType.payment_type &&
        typeof paymentType.payment_type === 'object' &&
        !Array.isArray(paymentType.payment_type)
          ? (paymentType.payment_type as Record<string, unknown>)
          : undefined;
      const paymentTypeId =
        typeof paymentType.id === 'string' ? paymentType.id : '';

      if (!paymentTypeId) {
        continue;
      }

      lookup.set(paymentTypeId, {
        id: paymentTypeId,
        name: typeof paymentType.name === 'string' ? paymentType.name : '',
        payment_type_id:
          typeof paymentTypeMeta?.id === 'string' ? paymentTypeMeta.id : '',
        payment_type_name:
          typeof paymentTypeMeta?.name === 'string' ? paymentTypeMeta.name : '',
      });
    }

    return lookup;
  }

  private calculateSellerBonusAmount(
    item: {
      finalPrice: number;
      profitAtSale: number;
    },
    settings?: {
      salaryPercent?: number;
      calculationType?: string;
      bonusEnabled?: boolean;
      isActive?: boolean;
    } | null,
  ) {
    if (
      !settings ||
      settings.bonusEnabled === false ||
      settings.isActive === false
    ) {
      return 0;
    }

    const percent = Number(settings.salaryPercent ?? 0);
    if (percent <= 0) {
      return 0;
    }

    const calculationType = settings.calculationType ?? 'FIXED_PLUS_PROFIT';
    if (
      calculationType === 'PROFIT_PERCENT_ONLY' ||
      calculationType === 'FIXED_PLUS_PROFIT'
    ) {
      return (item.profitAtSale * percent) / 100;
    }

    if (
      calculationType === 'REVENUE_PERCENT_ONLY' ||
      calculationType === 'FIXED_PLUS_REVENUE'
    ) {
      return (item.finalPrice * percent) / 100;
    }

    return 0;
  }

  private resolveBranchCodeByShopId(shopId: string) {
    const normalizedShopId = shopId.trim();
    const resolvedBranch = Object.entries(SHOP_BY_BRANCH_CODE).find(
      ([branchCode, shop]) =>
        branchCode === normalizedShopId ||
        shop.id === normalizedShopId ||
        shop.shop_id === normalizedShopId,
    )?.[0];

    return resolvedBranch ?? normalizedShopId;
  }

  private buildSaleScope(context: any) {
    if (!context || context.userType !== 'company') {
      return undefined;
    }

    if (!context.companyId) {
      return {
        id: -1,
      };
    }

    const scopedFilters: Record<string, unknown>[] = [
      {
        companyId: context.companyId,
      },
    ];

    if (context.allowedBranchCodes?.length) {
      scopedFilters.push({
        branchCode: {
          in: context.allowedBranchCodes,
        },
      });
    } else {
      scopedFilters.push({
        id: -1,
      });
    }

    return {
      AND: scopedFilters,
    };
  }

  private async resolveScopedBranchCode(
    shopId: string | undefined,
    context: any,
  ) {
    const requestedBranchCode = shopId
      ? await this.resolveBranchCodeForScopedSale(shopId, context)
      : undefined;

    if (!context || context.userType !== 'company') {
      return requestedBranchCode;
    }

    if (!requestedBranchCode) {
      return context.currentBranchCode;
    }

    if (!context.allowedBranchCodes.includes(requestedBranchCode)) {
      throw new BadRequestException(
        'Requested shop is not available for this user',
      );
    }

    return requestedBranchCode;
  }

  private async resolveBranchCodeForScopedSale(
    shopIdentifier: string,
    context: any,
  ) {
    const normalizedIdentifier = shopIdentifier.trim();

    if (!normalizedIdentifier) {
      return undefined;
    }

    if (context?.userType === 'company') {
      if (context.allowedBranchCodes.includes(normalizedIdentifier)) {
        return normalizedIdentifier;
      }

      const shop = await this.prisma.shop.findFirst({
        where: {
          companyId: context.companyId,
          OR: [
            { id: normalizedIdentifier },
            { branchCode: normalizedIdentifier },
          ],
        },
        select: {
          id: true,
          branchCode: true,
        },
      });

      if (shop) {
        if (!context.allowedShopIds.includes(shop.id)) {
          throw new BadRequestException(
            'Requested shop is not available for this user',
          );
        }

        return shop.branchCode;
      }
    }

    return this.resolveBranchCodeByShopId(normalizedIdentifier);
  }

  private assertSaleAccess(
    sale: { companyId?: string | null; branchCode: string | null },
    context: any,
  ) {
    if (!context || context.userType !== 'company' || !sale.branchCode) {
      return;
    }

    if (
      context.companyId &&
      sale.companyId &&
      context.companyId !== sale.companyId
    ) {
      throw new NotFoundException('Order not found');
    }

    if (!context.allowedBranchCodes.includes(sale.branchCode)) {
      throw new NotFoundException('Order not found');
    }
  }

  private buildProductScope(where: Record<string, unknown>, context: any) {
    if (!context || context.userType !== 'company' || !context.companyId) {
      return where;
    }

    return {
      AND: [
        where,
        {
          companyId: context.companyId,
        },
      ],
    };
  }

  private formatDateTime(value: Date, companyId?: string | null) {
    return this.companySettingsService.formatDateTimeForCompany(
      value,
      companyId ?? undefined,
    );
  }

  private formatDate(value: Date, companyId?: string | null) {
    return this.companySettingsService.formatDateForCompany(
      value,
      companyId ?? undefined,
    );
  }
}
