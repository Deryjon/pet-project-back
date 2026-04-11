import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
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
> = {
  main: {
    id: 'eaca6237-dc5c-4d4b-83e5-62a1eeb9a89a',
    shop_id: '11dc3536-e1ce-447b-aedb-ce3784c4b1ad',
    shop_name: 'Samarqand Darvoza',
  },
  a: {
    id: '5a256a71-34c1-42a0-a84d-1061bf84eb6c',
    shop_id: 'be25385b-8db2-4d96-8240-f1bb6bb3420c',
    shop_name: 'Globus Mall',
  },
};

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

  async findAll(authorization?: string) {
    const context = await this.getRequestContext(authorization);
    const sales = await this.prisma.sale.findMany({
      where: this.buildSaleScope(context),
      include: {
        user: true,
        items: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
    const shopLookup = await this.buildShopLookupByBranchCodes(
      sales.map((sale) => sale.branchCode).filter((value): value is string => !!value),
      context?.companyId,
    );
    const paymentTypeLookup = this.buildPaymentTypeLookup(context?.companyId);

    return sales.map((sale) =>
      this.toSaleListItem(sale, context, shopLookup, paymentTypeLookup),
    );
  }

  async createDraft(authorization?: string) {
    const context = await this.getRequestContext(authorization);
    const sale = await this.prisma.sale.create({
      data: {
        number: this.generateSaleNumber(),
        branchCode: context?.currentBranchCode ?? undefined,
        userId: context?.userId ?? undefined,
      },
    });

    return this.toDraftSummary(sale);
  }

  async createOrder(body: Record<string, unknown>, authorization?: string) {
    const context = await this.getRequestContext(authorization);
    const shopId = this.optionalString(body.shop_id) ?? '';
    const branchCode = await this.resolveScopedBranchCode(shopId, context);

    const sale = await this.prisma.sale.create({
      data: {
        number: this.generateOrderNumber(),
        status: 'draft',
        isDraft: true,
        branchCode: branchCode ?? context?.currentBranchCode ?? undefined,
        userId: context?.userId ?? undefined,
      },
    });

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

  async findProductsForNewSale(args: {
    page: number;
    limit: number;
    search?: string;
    shopId?: string;
  }, authorization?: string) {
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

    if (context?.allowedBranchCodes?.length) {
      where.stocks = {
        some: {
          branchCode: {
            in: context.allowedBranchCodes,
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

  async payOrder(id: string, body: Record<string, unknown>, authorization?: string) {
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

    const branchCode = sale.branchCode;
    if (branchCode) {
      for (const item of sale.items) {
        if (!item.productId) {
          continue;
        }

        const stock = await this.prisma.productStock.findFirst({
          where: {
            productId: item.productId,
            branchCode,
          },
        });

        if (stock) {
          await this.prisma.productStock.update({
            where: { id: stock.id },
            data: {
              quantity: stock.quantity - item.quantity,
            },
          });
        } else {
          await this.prisma.productStock.create({
            data: {
              productId: item.productId,
              branchCode,
              quantity: -item.quantity,
              purchasePrice: item.product?.purchasePrice ?? 0,
              salePrice: item.salePrice,
            },
          });
        }
      }
    }

    await this.prisma.product.updateMany({
      data: {},
      where: {
        id: {
          in: sale.items
            .map((item) => item.productId)
            .filter((value): value is number => typeof value === 'number'),
        },
      },
    });

    for (const item of sale.items) {
      if (!item.productId) {
        continue;
      }

      const product = await this.prisma.product.findFirst({
        where: this.buildProductScope(
          {
            id: item.productId,
          },
          context,
        ),
        include: { stocks: true },
      });

      if (!product) {
        continue;
      }

      await this.prisma.product.update({
        where: { id: product.id },
        data: {
          quantity: product.stocks.reduce(
            (sum, stock) => sum + stock.quantity,
            0,
          ),
        },
      });
    }

    const paymentMethod =
      this.optionalString(
        Array.isArray(body.payments) &&
          body.payments[0] &&
          typeof body.payments[0] === 'object'
          ? (body.payments[0] as Record<string, unknown>)
              .company_payment_type_id
          : undefined,
      ) ?? 'cash';

    await this.prisma.sale.update({
      where: { id: sale.id },
      data: {
        status: 'paid',
        isDraft: false,
        paymentMethod,
        paidAt: new Date(),
      },
    });

    return {
      order_type: 'SALE',
      should_print_cheque: true,
    };
  }

  async findDraft(id: number) {
    const sale = await this.findSaleOrThrow(id);
    return this.toDraftResponse(sale);
  }

  async addItem(id: number, body: Record<string, unknown>, authorization?: string) {
    const context = await this.getRequestContext(authorization);
    const productId = this.toInt(body.product_id);
    const quantity = this.toInt(body.quantity) ?? 1;
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
          salePrice,
          lineTotal: (existingItem.quantity + quantity) * salePrice,
        },
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
          salePrice,
          lineTotal: quantity * salePrice,
        },
      });
    }

    await this.recalculateSale(id);
    return this.findDraft(id);
  }

  async updateDiscount(id: number, body: Record<string, unknown>) {
    const sale = await this.findSaleOrThrow(id);

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
    return this.findDraft(id);
  }

  async pay(id: number, body: Record<string, unknown>, authorization?: string) {
    const context = await this.getRequestContext(authorization);
    const sale = await this.findSaleOrThrow(id);
    this.assertSaleAccess(sale, context);

    if (!sale.isDraft) {
      return this.toSaleListItem(sale, context);
    }

    await this.recalculateSale(id);

    const updatedSale = await this.prisma.sale.update({
      where: { id },
      data: {
        status: 'paid',
        isDraft: false,
        paymentMethod: this.optionalString(body.payment_method) ?? 'cash',
        clientName: this.optionalString(body.client_name),
        branchCode: this.optionalString(body.branch_code),
        paidAt: new Date(),
      },
      include: {
        user: true,
        items: true,
      },
    });

    return this.toSaleListItem(updatedSale, context);
  }

  async removeDraft(id: number) {
    const sale = await this.findSaleOrThrow(id);

    await this.prisma.sale.delete({
      where: { id },
    });

    return {
      success: true,
      id: sale.id,
    };
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

  private async findSaleOrThrow(id: number) {
    const sale = await this.prisma.sale.findUnique({
      where: { id },
      include: {
        user: true,
        items: true,
      },
    });

    if (!sale) {
      throw new NotFoundException('Sale not found');
    }

    return sale;
  }

  private toDraftSummary(sale: {
    id: number;
    number: string;
    discountPercent: number;
    discountAmount: number;
    payableTotal: number;
  }, context?: any) {
    return {
      id: sale.id,
      sid: sale.number,
      number: sale.number,
      discount_percent: sale.discountPercent,
      discount_amount: sale.discountAmount,
      payable_total: sale.payableTotal,
    };
  }

  private toDraftResponse(sale: {
    id: number;
    number: string;
    status: string;
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
    }[];
  }, context?: any) {
    return {
      id: sale.id,
      sid: sale.number,
      number: sale.number,
      status: sale.status,
      discount_percent: sale.discountPercent,
      discount_amount: sale.discountAmount,
      payable_total: sale.payableTotal,
      total: sale.total,
      items: sale.items.map((item) => ({
        id: item.id,
        product_id: item.productId,
        product: item.productId ? { id: item.productId } : null,
        name: item.name,
        sale_price: item.salePrice,
        barcode: item.barcode,
        sku: item.sku,
        quantity: item.quantity,
      })),
    };
  }

  private toSaleListItem(sale: {
    id: number;
    number: string;
    createdAt: Date;
    status: string;
    payableTotal: number;
    total: number;
    discountAmount: number;
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
      created_at: sale.createdAt,
      status: sale.status,
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

  private toV2OrderResponse(sale: {
    id: number;
    number: string;
    status: string;
    branchCode: string | null;
    createdAt: Date;
    updatedAt: Date;
    isDraft: boolean;
    total: number;
    discountAmount: number;
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
      product: {
        id: number;
        name: string;
        sku: string | null;
        barcode: string | null;
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
  }, context?: any, shopLookup?: Map<string, { shop_id: string; shop_name: string }>) {
    const shop = this.resolveShopByBranchCode(sale.branchCode ?? '', shopLookup);

    return {
      id: String(sale.id),
      parent_id: '',
      company_id: context?.companyId ?? COMPANY_ID,
      order_number: sale.number,
      order_status: sale.isDraft ? 'draft' : 'paid',
      order_detail: {
        id: String(sale.id),
        order_id: String(sale.id),
        customer: {
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
        total_price: sale.total,
        has_discount: sale.discountAmount > 0,
        total_products_measurement_value: sale.items.reduce(
          (sum, item) => sum + item.quantity,
          0,
        ),
        total_sets_measurement_value: 0,
        total_services_measurement_value: 0,
        total_returned_measurement_value: 0,
        version_number: 1,
        comment: '',
        created_at: this.formatDateTime(sale.createdAt),
        created_at_utc: '',
        order_items: sale.items.map((item, index) => ({
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
          product: item.product
            ? this.toOrderProductResponse(item.product)
            : null,
          product_id: item.productId ? String(item.productId) : '',
          product_type_id: item.product?.productType ?? DEFAULT_PRODUCT_TYPE_ID,
          product_variant_id: '',
          name: item.name,
          sku: item.sku ?? '',
          barcode: item.barcode ?? '',
          retail_price: item.salePrice,
          supply_price: item.product?.purchasePrice ?? 0,
          total_price: item.lineTotal,
          price: item.salePrice,
          sale_price: item.salePrice,
          rounding_price: 0,
          discount_value: 0,
          discount_unit: '',
          discount_amount: 0,
          discount_percent: 0,
          measurement_value: item.quantity,
          returned_measurement_value: 0,
          measurement_type: '',
          sequence_number: index + 1,
          is_returned: false,
          has_manual_discount: false,
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
        })),
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
      order_type: 'SALE',
      created_at: this.formatDateTime(sale.createdAt),
      deleted_at: 0,
      created_at_utc: '',
      future_time: '',
      debt: null,
      customer_id: '',
      parent_order_debt: null,
      deleted: false,
      deleted_by_user_id: '',
      deleted_by_user_name: '',
      webkassa_log_qty: 0,
      epos_log_qty: 0,
      epos_logs: null,
      finished_at: '',
      display_finished_at: '',
      sold_at: sale.isDraft ? '' : this.formatDateTime(sale.updatedAt),
      display_sold_at: '',
      display_deleted_at: '',
      order_debt_payments: null,
      park_status: '',
      exchange_disabled: false,
      total_remaining_debt_in_chain: 0,
      updated_at: this.formatDateTime(sale.updatedAt),
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
      measurement_unit: {
        ...DEFAULT_MEASUREMENT_UNIT,
        company_id: COMPANY_ID,
        is_default: true,
      },
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
    const currencyCode =
      this.companySettingsService.getDefaultCurrencyIsoCode(
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
      measurement_values: {
        total_measurement_value: totalMeasurementValue,
        total_active_measurement_value: totalMeasurementValue,
        total_inactive_measurement_value: 0,
      },
      measurement_unit: DEFAULT_MEASUREMENT_UNIT,
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

  private generateSaleNumber() {
    return `SL-${Date.now()}`;
  }

  private generateOrderNumber() {
    return `${Date.now()}`.slice(-12).padStart(12, '0');
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

  private parseEntityId(value: string, fieldName: string) {
    const parsed = Number(value);
    if (!Number.isInteger(parsed)) {
      throw new BadRequestException(`${fieldName} must be a number`);
    }

    return parsed;
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
    const normalizedBranchCodes = [...new Set(
      branchCodes.map((branchCode) => branchCode.trim()).filter(Boolean),
    )];
    const shopLookup = new Map<string, { shop_id: string; shop_name: string }>();

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

  private buildPaymentTypeLookup(companyId?: string | null) {
    const companyPaymentTypes =
      this.companySettingsService.getCompanyPaymentTypes(undefined, companyId ?? undefined);
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

    return context.allowedBranchCodes?.length
      ? {
          branchCode: {
            in: context.allowedBranchCodes,
          },
        }
      : {
          id: -1,
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

  private assertSaleAccess(sale: { branchCode: string | null }, context: any) {
    if (!context || context.userType !== 'company' || !sale.branchCode) {
      return;
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

  private formatDateTime(value: Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    const hours = String(value.getHours()).padStart(2, '0');
    const minutes = String(value.getMinutes()).padStart(2, '0');
    const seconds = String(value.getSeconds()).padStart(2, '0');

    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  }
}
