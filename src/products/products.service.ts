import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { CompanySettingsService } from '../company-settings/company-settings.service';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';

type CatalogProductWithRelations = Prisma.ProductGetPayload<{
  include: {
    brand: true;
    suppliers: {
      include: {
        supplier: true;
      };
    };
  };
}>;

type ResolvedShop = {
  id: string;
  shop_id: string;
  shop_name: string;
  branch_code: string;
};

const PRODUCT_CHARACTERISTICS = [
  {
    id: '1fec31bd-c0d7-424b-a46c-00b742cd5951',
    company_id: '',
    name: 'variation_id',
    system_name: 'variation_id',
    type: 'text',
    is_deletable: false,
    is_dynamic: false,
    is_editable: false,
    visible_when_deleted: false,
    deleted_at: 0,
  },
  {
    id: '447e15cb-e989-4e78-9293-1aa7e83c6ad9',
    company_id: '',
    name: 'Кол-во',
    system_name: 'quantity',
    type: 'text',
    is_deletable: false,
    is_dynamic: false,
    is_editable: false,
    visible_when_deleted: false,
    deleted_at: 0,
  },
  {
    id: '36c93f63-65c9-4377-b445-2a77865e0cb7',
    company_id: '',
    name: 'Фото',
    system_name: 'photo',
    type: 'text',
    is_deletable: false,
    is_dynamic: false,
    is_editable: false,
    visible_when_deleted: false,
    deleted_at: 0,
  },
  {
    id: '098948e6-b056-42f5-8294-674f771a8f51',
    company_id: '',
    name: 'Бренд',
    system_name: 'brand_name',
    type: 'text',
    is_deletable: false,
    is_dynamic: false,
    is_editable: false,
    visible_when_deleted: false,
    deleted_at: 0,
  },
  {
    id: 'b2ac94af-9624-4411-af25-3b3c6c2a7894',
    company_id: '',
    name: 'Категория',
    system_name: 'category_name',
    type: 'text',
    is_deletable: false,
    is_dynamic: false,
    is_editable: false,
    visible_when_deleted: false,
    deleted_at: 0,
  },
  {
    id: 'de0efc87-089d-4f2c-8d9e-9e22a23d3c81',
    company_id: '',
    name: 'Поставщики',
    system_name: 'supplier_name',
    type: 'text',
    is_deletable: false,
    is_dynamic: false,
    is_editable: false,
    visible_when_deleted: false,
    deleted_at: 0,
  },
  {
    id: '2bce31e3-c27e-4f6e-a45e-5801b50bdb0d',
    company_id: '',
    name: 'Оптовая цена',
    system_name: 'discount_price',
    type: 'text',
    is_deletable: false,
    is_dynamic: false,
    is_editable: false,
    visible_when_deleted: false,
    deleted_at: 0,
  },
  {
    id: '4d03f01d-931f-4a00-9212-73ed6ef51533',
    company_id: '',
    name: 'Цена поставки',
    system_name: 'supply_price',
    type: 'text',
    is_deletable: false,
    is_dynamic: false,
    is_editable: false,
    visible_when_deleted: false,
    deleted_at: 0,
  },
  {
    id: 'c228686a-623f-4280-9831-193598c480c5',
    company_id: '',
    name: 'Цена продажи',
    system_name: 'retail_price',
    type: 'text',
    is_deletable: false,
    is_dynamic: false,
    is_editable: false,
    visible_when_deleted: false,
    deleted_at: 0,
  },
  {
    id: '22ba03e6-ac05-4ae1-af2a-2c03c8502d28',
    company_id: '',
    name: 'Артикул',
    system_name: 'sku',
    type: 'text',
    is_deletable: false,
    is_dynamic: false,
    is_editable: false,
    visible_when_deleted: false,
    deleted_at: 0,
  },
  {
    id: '49dbfdfe-3669-4782-b2a2-ba5404dcab8a',
    company_id: '',
    name: 'Баркод',
    system_name: 'barcode',
    type: 'text',
    is_deletable: false,
    is_dynamic: false,
    is_editable: false,
    visible_when_deleted: false,
    deleted_at: 0,
  },
  {
    id: '3ecd9f03-ed76-4ff0-9d36-e63c8d207209',
    company_id: '',
    name: 'Наименование',
    system_name: 'name',
    type: 'text',
    is_deletable: false,
    is_dynamic: false,
    is_editable: false,
    visible_when_deleted: false,
    deleted_at: 0,
  },
];

const COMPANY_ID = process.env.COMPANY_ID ?? '';
const DEFAULT_PRODUCT_TYPE_ID =
  process.env.DEFAULT_PRODUCT_TYPE_ID ?? '69e939aa-9b8f-46a9-b605-8b2675475b7b';
const PRODUCT_TYPE_IDS = {
  goods:
    process.env.PRODUCT_TYPE_GOODS_ID ?? '69e939aa-9b8f-46a9-b605-8b2675475b7b',
  service:
    process.env.PRODUCT_TYPE_SERVICE_ID ??
    'f3e4d8de-5d2c-4ff0-b1c2-5ed0f7a27401',
  kit:
    process.env.PRODUCT_TYPE_KIT_ID ?? '85a7f6a9-0737-4f7e-a1a5-9d5f8f27d2f4',
} as const;
const SKU_PREFIX_LENGTH = 3;
const SKU_NUMBER_LENGTH = 5;
const BARCODE_BASE = 2000000000000;
const BARCODE_MAX = 2999999999999;
const DEFAULT_MEASUREMENT_UNIT = {
  id: '12a69bc0-c575-4586-9f0f-76e8295d4139',
  name: 'Штука',
  company_id: '',
  short_name: 'шт',
  precision: '1',
  is_editable: false,
  is_default: false,
};
const DEFAULT_EMPTY_SUPPLIER_ID = '00000000-0000-0000-0000-000000000000';
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

type FindProductsArgs = {
  page: number;
  limit: number;
  search?: string;
  sku?: string;
  statistics?: boolean;
  status?: string;
  archivedList?: boolean;
  shopIds?: string[];
  categoryIds?: string[];
  measurementType?: string;
  supplyPriceFrom?: number;
  supplyPriceTo?: number;
  retailPriceFrom?: number;
  retailPriceTo?: number;
  wholesalePrice?: number;
  freePrice?: boolean;
  brandIds?: string[];
  supplierIds?: string[];
  order?: string[];
};

@Injectable()
export class ProductsService {
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

  getProductCharacteristics(limit?: string) {
    const parsedLimit = limit ? Number(limit) : PRODUCT_CHARACTERISTICS.length;
    if (Number.isNaN(parsedLimit) || parsedLimit <= 0) {
      throw new BadRequestException('limit must be a positive number');
    }

    const safeLimit = Math.min(
      Math.trunc(parsedLimit),
      PRODUCT_CHARACTERISTICS.length,
    );

    return {
      active_count: PRODUCT_CHARACTERISTICS.length,
      deleted_count: 2,
      product_characteristics: PRODUCT_CHARACTERISTICS.slice(0, safeLimit),
    };
  }

  async findAll({ page, limit, search }: FindProductsArgs, authorization?: string) {
    const context = await this.getRequestContext(authorization);
    const safePage = Math.max(1, page);
    const safeLimit = Math.min(Math.max(1, limit), 100);
    const where = this.applyProductScope(
      search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { sku: { contains: search, mode: 'insensitive' } },
              { barcode: { contains: search, mode: 'insensitive' } },
            ],
          }
        : undefined,
      context,
    );

    const [total, products] = await this.prisma.$transaction([
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({
        where,
        include: {
          category: true,
          brand: true,
          suppliers: {
            include: {
              supplier: true,
            },
          },
          stocks: true,
        },
        orderBy: {
          id: 'desc',
        },
        skip: (safePage - 1) * safeLimit,
        take: safeLimit,
      }),
    ]);

    return {
      items: products.map((product) => this.toProductResponse(product)),
      meta: {
        page: safePage,
        limit: safeLimit,
        total,
        totalPages: Math.ceil(total / safeLimit) || 1,
      },
    };
  }

  async findAllV2({ page, limit, search }: FindProductsArgs) {
    const safePage = Math.max(1, page);
    const safeLimit = Math.min(Math.max(1, limit), 1000);
    const where = this.buildProductWhere(search);

    const [count, products] = await this.prisma.$transaction([
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({
        where,
        include: {
          category: true,
          brand: true,
          suppliers: {
            include: {
              supplier: true,
            },
          },
          stocks: true,
        },
        orderBy: {
          id: 'desc',
        },
        skip: (safePage - 1) * safeLimit,
        take: safeLimit,
      }),
    ]);
    const shopLookup = await this.buildShopLookupByBranchCodes(
      products.flatMap((product) => product.stocks.map((stock) => stock.branchCode)),
    );

    return {
      count,
      total: 0,
      products: products.map((product) =>
        this.toProductResponseV2(product, shopLookup),
      ),
    };
  }

  async findAllV2Extended({
    page,
    limit,
    search,
    statistics,
    status,
    archivedList,
    shopIds,
    categoryIds,
    sku,
    measurementType,
    supplyPriceFrom,
    supplyPriceTo,
    retailPriceFrom,
    retailPriceTo,
    wholesalePrice,
    freePrice,
    brandIds,
    supplierIds,
    order,
  }: FindProductsArgs, authorization?: string) {
    const context = await this.getRequestContext(authorization);
    const safePage = Math.max(1, page);
    const safeLimit = Math.min(Math.max(1, limit), 1000);
    const resolvedShopBranchCodes = await this.resolveBranchCodesForFilter(
      shopIds,
      context,
    );
    const where = this.applyProductScope(this.buildProductWhere(
      search,
      brandIds,
      supplierIds,
      status,
      archivedList,
      resolvedShopBranchCodes,
      categoryIds,
      sku,
      measurementType,
      supplyPriceFrom,
      supplyPriceTo,
      retailPriceFrom,
      retailPriceTo,
      wholesalePrice,
      freePrice,
    ), context);
    const orderBy = this.buildProductOrderBy(order);

    const [count, products] = await this.prisma.$transaction([
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({
        where,
        include: {
          category: true,
          brand: true,
          suppliers: {
            include: {
              supplier: true,
            },
          },
          stocks: true,
        },
        orderBy,
        skip: (safePage - 1) * safeLimit,
        take: safeLimit,
      }),
    ]);
    const shopLookup = await this.buildShopLookupByBranchCodes(
      products.flatMap((product) => product.stocks.map((stock) => stock.branchCode)),
      context?.companyId,
    );

    const visibleBranchCodes = resolvedShopBranchCodes?.length
      ? resolvedShopBranchCodes
      : context?.allowedBranchCodes;

    const response: Record<string, unknown> = {
      count,
      total: 0,
      products: products.map((product) =>
        this.toProductResponseV2(product, shopLookup, visibleBranchCodes),
      ),
      fields: this.getCatalogFields(),
    };

    if (statistics) {
      const visibleBranchCodes = resolvedShopBranchCodes?.length
        ? resolvedShopBranchCodes
        : context?.allowedBranchCodes;
      const productsForStatistics = await this.prisma.product.findMany({
        where,
        select: {
          id: true,
          quantity: true,
          purchasePrice: true,
          salePrice: true,
          stocks: {
            ...(visibleBranchCodes?.length
              ? {
                  where: {
                    branchCode: {
                      in: visibleBranchCodes,
                    },
                  },
                }
              : {}),
            select: {
              quantity: true,
              purchasePrice: true,
              salePrice: true,
            },
          },
        },
      });

      Object.assign(
        response,
        this.buildProductsStatistics(productsForStatistics),
      );
    }

    return response;
  }

  async getCatalogStatistics({
    search,
    brandIds,
    supplierIds,
    status,
    archivedList,
    shopIds,
    categoryIds,
    sku,
    measurementType,
    supplyPriceFrom,
    supplyPriceTo,
    retailPriceFrom,
    retailPriceTo,
    wholesalePrice,
    freePrice,
  }: Omit<FindProductsArgs, 'page' | 'limit' | 'statistics' | 'order'>, authorization?: string) {
    const context = await this.getRequestContext(authorization);
    const resolvedShopBranchCodes = await this.resolveBranchCodesForFilter(
      shopIds,
      context,
    );
    const where = this.applyProductScope(this.buildProductWhere(
      search,
      brandIds,
      supplierIds,
      status,
      archivedList,
      resolvedShopBranchCodes,
      categoryIds,
      sku,
      measurementType,
      supplyPriceFrom,
      supplyPriceTo,
      retailPriceFrom,
      retailPriceTo,
      wholesalePrice,
      freePrice,
    ), context);

    const productsForStatistics = await this.prisma.product.findMany({
      where,
      select: {
        id: true,
        quantity: true,
        purchasePrice: true,
        salePrice: true,
        stocks: {
          ...(resolvedShopBranchCodes?.length
            ? {
                where: {
                  branchCode: {
                    in: resolvedShopBranchCodes,
                  },
                },
              }
            : context?.allowedBranchCodes?.length
              ? {
                  where: {
                    branchCode: {
                      in: context.allowedBranchCodes,
                    },
                  },
                }
              : {}),
          select: {
            quantity: true,
            purchasePrice: true,
            salePrice: true,
          },
        },
      },
    });

    return this.buildProductsStatistics(productsForStatistics);
  }

  async create(body: Record<string, unknown>, authorization?: string) {
    const context = await this.getRequestContext(authorization);
    const name = this.requireString(body.name, 'name');
    const sku = this.optionalString(body.sku);
    const barcode = this.optionalString(body.barcode);
    const photo = this.optionalString(body.photo);
    const productType = this.optionalString(body.product_type);
    const variantType = this.optionalString(body.variant_type);
    const unit = this.optionalString(body.unit);
    const purchasePrice = this.toNumber(body.purchase_price);
    const markupPercent = this.toNumber(body.markup_percent);
    const salePrice = this.toNumber(body.sale_price);
    const quantity = this.toInt(body.quantity) ?? 0;
    const metadataInput = this.toJsonFieldValue(body.metadata);
    const stocks = Array.isArray(body.stocks)
      ? this.filterStockPayloadByContext(body.stocks, context)
      : [];
    const supplierIds = Array.isArray(body.supplier_ids)
      ? body.supplier_ids
      : [];

    const metadataObject =
      body.metadata && typeof body.metadata === 'object' && !Array.isArray(body.metadata)
        ? (body.metadata as Record<string, unknown>)
        : undefined;

    const categoryName = this.optionalString(metadataObject?.category);
    const brandName = this.optionalString(
      (metadataObject?.attributes as Record<string, unknown> | undefined)
        ?.brand,
    );
    const supplierNames = new Set<string>();

    for (const supplierId of supplierIds) {
      const supplierName = this.optionalString(supplierId);
      if (supplierName) {
        supplierNames.add(supplierName);
      }
    }

    const metadataSupplier = this.optionalString(
      (metadataObject?.attributes as Record<string, unknown> | undefined)
        ?.supplier,
    );
    if (metadataSupplier) {
      supplierNames.add(metadataSupplier);
    }

    const totalQuantityFromStocks = stocks.reduce<number>((sum, stock) => {
      if (!stock || typeof stock !== 'object') {
        return sum;
      }

      return (
        sum + (this.toInt((stock as Record<string, unknown>).quantity) ?? 0)
      );
    }, 0);

    const createdProduct = await this.prisma.product.create({
      data: {
        name,
        sku,
        barcode,
        photo,
        productType,
        variantType,
        unit,
        purchasePrice,
        markupPercent,
        salePrice,
        quantity: totalQuantityFromStocks || quantity,
        metadata: metadataInput,
        category: categoryName
          ? {
              connectOrCreate: {
                where: { name: categoryName },
                create: { name: categoryName },
              },
            }
          : undefined,
        brand: brandName
          ? {
              connectOrCreate: {
                where: { name: brandName },
                create: { name: brandName },
              },
            }
          : undefined,
        suppliers: supplierNames.size
          ? {
              create: [...supplierNames].map((supplierName) => ({
                supplier: {
                  connectOrCreate: {
                    where: { name: supplierName },
                    create: { name: supplierName },
                  },
                },
              })),
            }
          : undefined,
        stocks: stocks.length
          ? {
              create: stocks
                .filter(
                  (stock): stock is Record<string, unknown> =>
                    !!stock && typeof stock === 'object',
                )
                .map((stock) => ({
                  branchCode:
                    this.optionalString(stock.branch_code) ?? 'default_branch',
                  quantity: this.toInt(stock.quantity) ?? 0,
                  purchasePrice:
                    this.toNumber(stock.purchase_price) ?? purchasePrice ?? 0,
                  salePrice: this.toNumber(stock.sale_price) ?? salePrice ?? 0,
                })),
            }
          : undefined,
      },
    });

    const product = await this.prisma.product.findUniqueOrThrow({
      where: { id: createdProduct.id },
      include: {
        category: true,
        brand: true,
        suppliers: {
          include: {
            supplier: true,
          },
        },
        stocks: true,
      },
    });

    return this.toProductResponse(product);
  }

  async createCatalogProduct(
    body: Record<string, unknown>,
    authorization?: string,
  ) {
    const context = await this.getRequestContext(authorization);
    const writeContext = this.requireCatalogWriteContext(context);
    if (Array.isArray(body.shop_ids)) {
      body.shop_ids = this.filterRequestedShopIds(
        body.shop_ids as string[],
        writeContext,
      );
    }
    const name = this.requireString(body.name, 'name');
    const sku = this.optionalString(body.sku);
    const barcode = this.optionalString(body.barcode);
    const productType = this.resolveProductType(body.product_type_id);
    const isVariative = this.toBooleanValue(body.is_variative);
    const variantType = isVariative ? 'variative' : 'simple';
    const unit = this.optionalString(body.measurement_type);
    const measurementUnitId = this.optionalString(body.measurement_unit_id);
    const purchasePrice = this.toNumber(body.supply_price) ?? 0;
    const salePrice = this.toNumber(body.retail_price) ?? 0;
    const markupPercent = this.toNumber(body.profit_margin);
    const description = this.optionalString(body.description);
    const brandName = this.optionalString(body.brand_name);
    const imageUrl = this.extractFirstImage(body.images);
    const supplierIds = this.toStringArrayValue(body.supplier_ids);
    const supplierIdNumbers = supplierIds
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value));
    const shipments = this.extractStockPayload(body);
    const shipmentsWithBranchCodes = await this.attachBranchCodesToShipments(
      shipments,
      writeContext,
    );
    const selectedAttributes = this.extractSelectedAttributes(
      body.selected_attributes,
    );
    const variants = this.extractVariants(body.variants);
    const isServiceProduct = this.isServiceProductType(productType);
    const supportsStock = !isServiceProduct;
    const totalQuantity = supportsStock
      ? shipmentsWithBranchCodes.reduce(
          (sum, shipment) => sum + shipment.quantity,
          0,
        )
      : 0;

    if (isVariative && !this.isGoodsProductType(productType)) {
      throw new BadRequestException(
        'Variative products are supported only for product type "товар"',
      );
    }

    if (
      (this.isGoodsProductType(productType) || isServiceProduct) &&
      !measurementUnitId
    ) {
      throw new BadRequestException('measurement_unit_id is required');
    }

    const createdProduct = await this.prisma.product.create({
      data: {
        name,
        sku,
        barcode,
        photo: imageUrl,
        productType,
        variantType,
        unit,
        purchasePrice,
        markupPercent,
        salePrice,
        quantity: totalQuantity,
        metadata: this.buildCatalogMetadata(body, description, {
          isVariative,
          selectedAttributes,
          variants,
        }, writeContext),
        brand: brandName
          ? {
              connectOrCreate: {
                where: { name: brandName },
                create: { name: brandName },
              },
            }
          : undefined,
        suppliers: supplierIdNumbers.length
          ? {
              create: supplierIdNumbers.map((supplierId) => ({
                supplier: {
                  connect: {
                    id: supplierId,
                  },
                },
              })),
            }
          : undefined,
        stocks:
          supportsStock && shipmentsWithBranchCodes.length
            ? {
                create: shipmentsWithBranchCodes.map((shipment) => ({
                  branchCode: shipment.branchCode,
                  quantity: shipment.quantity,
                  purchasePrice: shipment.supplyPrice,
                  salePrice: shipment.retailPrice,
                })),
              }
            : undefined,
      },
      include: {
        category: true,
        brand: true,
        suppliers: {
          include: {
            supplier: true,
          },
        },
        stocks: true,
      },
    });
    const shopLookup = await this.buildShopLookupByBranchCodes(
      shipmentsWithBranchCodes.map((shipment) => shipment.branchCode),
      writeContext.companyId,
    );

    const productResponse = this.toCatalogCreateProductResponse(
      createdProduct,
      body,
      supportsStock ? shipmentsWithBranchCodes : [],
      supplierIds,
      shopLookup,
      writeContext,
    );

    return {
      session_id: randomUUID(),
      status_code: 200,
      id: String(createdProduct.id),
      error: {
        code: '',
        message: '',
      },
      data: {
        brand_id: this.optionalString(body.brand_id) ?? '',
        category_ids: this.toStringArrayValue(body.category_ids),
        created_by: {
          id: String(writeContext.userId),
          name: writeContext.fullName,
        },
        product_ids: null,
        products: [productResponse],
        props_updated: false,
        shipments: this.buildCatalogShipmentResponse(
          createdProduct.id,
          shipmentsWithBranchCodes,
          shopLookup,
          writeContext.companyId,
        ),
        stocktaking_id: this.optionalString(body.stocktaking_id) ?? '',
      },
      correlation_id: randomUUID(),
      topic: 'v2.catalog_service.product.created',
    };
  }

  async updateCatalogProduct(
    id: string,
    body: Record<string, unknown>,
    authorization?: string,
  ) {
    const context = await this.getRequestContext(authorization);
    const writeContext = this.requireCatalogWriteContext(context);
    if (Array.isArray(body.shop_ids)) {
      body.shop_ids = this.filterRequestedShopIds(
        body.shop_ids as string[],
        writeContext,
      );
    }
    const productId = this.parseProductId(id);
    const existingProduct = await this.prisma.product.findUnique({
      where: { id: productId },
      include: {
        stocks: true,
      },
    });

    if (!existingProduct) {
      throw new NotFoundException('Product not found');
    }

    const productType = this.resolveProductType(
      body.product_type_id ?? existingProduct.productType,
    );
    const isVariative = this.toBooleanValue(
      body.is_variative ??
        (existingProduct.metadata as Record<string, unknown> | null)
          ?.is_variative ??
        false,
    );
    const measurementUnitId = this.optionalString(body.measurement_unit_id);
    const supportsStock = !this.isServiceProductType(productType);

    if (isVariative && !this.isGoodsProductType(productType)) {
      throw new BadRequestException(
        'Variative products are supported only for product type "товар"',
      );
    }

    if (
      (this.isGoodsProductType(productType) ||
        this.isServiceProductType(productType)) &&
      !measurementUnitId &&
      this.optionalString(
        (existingProduct.metadata as Record<string, unknown> | null)
          ?.measurement_unit_id,
      ) === undefined
    ) {
      throw new BadRequestException('measurement_unit_id is required');
    }

    const shipments = this.extractStockPayload(body);
    const shipmentsWithBranchCodes = await this.attachBranchCodesToShipments(
      shipments,
      writeContext,
    );
    const selectedAttributes = this.extractSelectedAttributes(
      body.selected_attributes,
    );
    const variants = this.extractVariants(body.variants);
    const supplierIds = this.toStringArrayValue(body.supplier_ids);
    const supplierIdNumbers = supplierIds
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value));
    const description = this.optionalString(body.description);

    const updatedProduct = await this.prisma.product.update({
      where: { id: productId },
      data: {
        name: this.optionalString(body.name) ?? existingProduct.name,
        sku: this.optionalString(body.sku) ?? existingProduct.sku,
        barcode: this.optionalString(body.barcode) ?? existingProduct.barcode,
        photo: this.extractFirstImage(body.images) ?? existingProduct.photo,
        productType,
        variantType: isVariative ? 'variative' : 'simple',
        unit:
          this.optionalString(body.measurement_type) ?? existingProduct.unit,
        purchasePrice:
          this.toNumber(body.supply_price) ??
          existingProduct.purchasePrice ??
          0,
        salePrice:
          this.toNumber(body.retail_price) ?? existingProduct.salePrice ?? 0,
        markupPercent:
          this.toNumber(body.profit_margin) ??
          existingProduct.markupPercent ??
          0,
        quantity: supportsStock
          ? shipmentsWithBranchCodes.length
            ? shipmentsWithBranchCodes.reduce(
                (sum, shipment) => sum + shipment.quantity,
                0,
              )
            : existingProduct.quantity
          : 0,
        metadata: this.buildCatalogMetadata(body, description, {
          isVariative,
          selectedAttributes,
          variants,
        }, writeContext),
        suppliers:
          body.supplier_ids !== undefined
            ? {
                deleteMany: {},
                ...(supplierIdNumbers.length
                  ? {
                      create: supplierIdNumbers.map((supplierId) => ({
                        supplier: {
                          connect: {
                            id: supplierId,
                          },
                        },
                      })),
                    }
                  : {}),
              }
            : undefined,
        stocks:
          body.shipments !== undefined ||
          body.shop_measurement_values !== undefined
            ? supportsStock
              ? {
                  deleteMany: {},
                  ...(shipmentsWithBranchCodes.length
                    ? {
                        create: shipmentsWithBranchCodes.map((shipment) => ({
                          branchCode: shipment.branchCode,
                          quantity: shipment.quantity,
                          purchasePrice: shipment.supplyPrice,
                          salePrice: shipment.retailPrice,
                        })),
                      }
                    : {}),
                }
              : {
                  deleteMany: {},
                }
            : undefined,
      },
      include: {
        category: true,
        brand: true,
        suppliers: {
          include: {
            supplier: true,
          },
        },
        stocks: true,
      },
    });
    const shopLookup = await this.buildShopLookupByBranchCodes(
      shipmentsWithBranchCodes.map((shipment) => shipment.branchCode),
      writeContext.companyId,
    );

    const productResponse = this.toCatalogCreateProductResponse(
      updatedProduct,
      body,
      supportsStock ? shipmentsWithBranchCodes : [],
      supplierIds,
      shopLookup,
      writeContext,
    );

    return {
      session_id: randomUUID(),
      status_code: 200,
      id: String(updatedProduct.id),
      error: {
        code: '',
        message: '',
      },
      data: {
        brand_id: this.optionalString(body.brand_id) ?? '',
        category_ids: this.toStringArrayValue(body.category_ids),
        created_by: {
          id: String(writeContext.userId),
          name: writeContext.fullName,
        },
        product_ids: null,
        products: [productResponse],
        props_updated: false,
        shipments: supportsStock
          ? this.buildCatalogShipmentResponse(
              updatedProduct.id,
              shipmentsWithBranchCodes,
              shopLookup,
              writeContext.companyId,
            )
          : [],
        stocktaking_id: this.optionalString(body.stocktaking_id) ?? '',
      },
      correlation_id: randomUUID(),
      topic: 'v2.catalog_service.product.updated',
    };
  }

  async generateSku(body: Record<string, unknown>) {
    const requestedPrefix = this.optionalString(body.prefix);
    const name = this.optionalString(body.name);
    const prefix = (requestedPrefix ?? this.buildSkuPrefix(name) ?? 'SKU')
      .replace(/[^A-Za-z0-9]/g, '')
      .toUpperCase()
      .slice(0, SKU_PREFIX_LENGTH)
      .padEnd(SKU_PREFIX_LENGTH, 'X');

    for (let attempt = 0; attempt < 50; attempt += 1) {
      const randomNumber = Math.floor(Math.random() * 10 ** SKU_NUMBER_LENGTH);
      const candidate = `${prefix}-${String(randomNumber).padStart(SKU_NUMBER_LENGTH, '0')}`;
      const existing = await this.prisma.product.findUnique({
        where: { sku: candidate },
        select: { id: true },
      });

      if (!existing) {
        return {
          sku: candidate,
        };
      }
    }

    throw new BadRequestException('Could not generate unique sku');
  }

  async generateBarcode() {
    const latestBarcodeRecord = await this.prisma.product.findFirst({
      where: {
        barcode: {
          startsWith: '2',
        },
      },
      orderBy: {
        barcode: 'desc',
      },
      select: {
        barcode: true,
      },
    });

    const latestValue = Number(latestBarcodeRecord?.barcode);
    const nextValue =
      Number.isFinite(latestValue) && latestValue >= BARCODE_BASE
        ? latestValue + 1
        : BARCODE_BASE;

    if (nextValue > BARCODE_MAX) {
      throw new BadRequestException('Barcode range exceeded');
    }

    const barcode = String(nextValue);
    const existing = await this.prisma.product.findUnique({
      where: { barcode },
      select: { id: true },
    });

    if (existing) {
      return this.generateBarcode();
    }

    return {
      barcode,
    };
  }

  private toProductResponse(product: {
    id: number;
    photo: string | null;
    name: string;
    sku: string | null;
    barcode: string | null;
    quantity: number;
    purchasePrice: number | null;
    salePrice: number | null;
    discountPrice: number | null;
    category: { name: string } | null;
    brand: { name: string } | null;
    suppliers: { supplier: { name: string } }[];
    metadata: Prisma.JsonValue | null;
    stocks: {
      branchCode: string;
      quantity: number;
      purchasePrice: number | null;
      salePrice: number | null;
    }[];
  }) {
    return {
      id: product.id,
      photo: product.photo,
      name: product.name,
      sku: product.sku,
      barcode: product.barcode,
      category: product.category,
      suppliers: product.suppliers.map((item) => ({
        name: item.supplier.name,
      })),
      quantity: product.quantity,
      purchase_price: product.purchasePrice,
      sale_price: product.salePrice,
      discount_price: product.discountPrice,
      brand: product.brand,
      metadata: product.metadata,
      stocks: product.stocks.map((stock) => ({
        branch_code: stock.branchCode,
        quantity: stock.quantity,
        purchase_price: stock.purchasePrice,
        sale_price: stock.salePrice,
      })),
    };
  }

  private toProductResponseV2(product: {
    id: number;
    name: string;
    sku: string | null;
    barcode: string | null;
    photo: string | null;
    quantity: number;
    purchasePrice: number | null;
    salePrice: number | null;
    productType: string | null;
    createdAt: Date;
    updatedAt: Date;
    category: { name: string } | null;
    brand: { name: string } | null;
    suppliers: { supplier: { id: number; name: string } }[];
    stocks: {
      branchCode: string;
      quantity: number;
      purchasePrice: number | null;
      salePrice: number | null;
    }[];
  }, shopLookup?: Map<string, ResolvedShop>, visibleBranchCodes?: string[]) {
    const currencyCode =
      this.companySettingsService.getDefaultCurrencyIsoCode();
    const filteredStocks = this.filterStocksByBranchCodes(
      product.stocks,
      visibleBranchCodes,
    );
    const stockSummaries = filteredStocks.map((stock) => {
      const shop = this.resolveShopByBranchCode(stock.branchCode, shopLookup);
      const measurementValue = stock.quantity;
      const supplyPrice = stock.purchasePrice ?? product.purchasePrice ?? 0;
      const retailPrice = stock.salePrice ?? product.salePrice ?? 0;
      const supplySum = measurementValue * supplyPrice;
      const retailSum = measurementValue * retailPrice;
      const supplierIds = product.suppliers.length
        ? product.suppliers.map((item) => String(item.supplier.id))
        : [DEFAULT_EMPTY_SUPPLIER_ID];

      return {
        shop,
        measurementValue,
        supplyPrice,
        retailPrice,
        supplySum,
        retailSum,
        supplierIds,
      };
    });

    const totalMeasurementValue = stockSummaries.reduce(
      (sum, stock) => sum + stock.measurementValue,
      0,
    );
    const totalSupplyValue = stockSummaries.reduce(
      (sum, stock) => sum + stock.supplySum,
      0,
    );
    const totalRetailValue = stockSummaries.reduce(
      (sum, stock) => sum + stock.retailSum,
      0,
    );
    const primarySupplier = product.suppliers[0]?.supplier;

    return {
      id: String(product.id),
      company_id: COMPANY_ID,
      name: product.name,
      sku: product.sku,
      barcode: product.barcode,
      additional_barcodes: null,
      measurement_values: {
        total_measurement_value: totalMeasurementValue,
        total_active_measurement_value: totalMeasurementValue,
        total_inactive_measurement_value: 0,
      },
      measurement_unit: DEFAULT_MEASUREMENT_UNIT,
      shop_measurement_values: stockSummaries.map((stock) => ({
        small_left_measurement_value: 0,
        has_trigger: false,
        shop_id: stock.shop.shop_id,
        total_measurement_value: stock.measurementValue,
        total_min_supply_price: stock.supplyPrice,
        total_max_supply_price: stock.supplyPrice,
        total_supply_sum: stock.supplySum,
        total_active_measurement_value: stock.measurementValue,
        total_active_min_supply_price: stock.supplyPrice,
        total_active_max_supply_price: stock.supplyPrice,
        total_active_supply_sum: stock.supplySum,
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
        total_retail_sum: stock.retailSum,
        total_active_retail_sum: stock.retailSum,
        total_inactive_retail_sum: 0,
      })),
      shop_prices: stockSummaries.map((stock) => ({
        shop_id: stock.shop.shop_id,
        retail_price: stock.retailPrice,
        retail_currency: currencyCode,
        supply_currency: currencyCode,
        min_supply_price: stock.supplyPrice,
        max_supply_price: stock.supplyPrice,
        supply_price: stock.supplyPrice,
        wholesale_price: 0,
        min_price: 0,
        max_price: 0,
        prices_list: [],
        from_supply_price: 0,
        currency_prices: [
          {
            currency: currencyCode,
            retail_price: stock.retailPrice,
            min_supply_price: stock.supplyPrice,
            max_supply_price: stock.supplyPrice,
            supply_price: stock.supplyPrice,
            wholesale_price: 0,
            min_price: 0,
            max_price: 0,
            prices_list: [],
          },
        ],
        promo_price: 0,
        promos: null,
      })),
      prices: {
        total_supply_price: totalSupplyValue,
        total_retail_price: totalRetailValue,
        total_active_supply_price: totalSupplyValue,
        total_active_retail_price: totalRetailValue,
        total_inactive_supply_price: 0,
        total_inactive_retail_price: 0,
      },
      product_type_id: product.productType ?? DEFAULT_PRODUCT_TYPE_ID,
      created_at: this.formatDateTime(product.createdAt),
      updated_at: this.formatDateTime(product.updatedAt),
      base_name: product.name,
      archived_at: '0001-01-01T00:00:00Z',
      archived_by: {
        id: '',
        name: '',
      },
      supplier_id: primarySupplier ? String(primarySupplier.id) : undefined,
      supplier_ids: product.suppliers.length
        ? product.suppliers.map((item) => String(item.supplier.id))
        : undefined,
      suppliers: product.suppliers.length
        ? product.suppliers.map((item) => ({
            id: String(item.supplier.id),
            company_id: '',
            name: item.supplier.name,
            deleted_at: 0,
          }))
        : undefined,
      product_supplier_stock: stockSummaries.map((stock) => ({
        supplier_id: primarySupplier
          ? String(primarySupplier.id)
          : DEFAULT_EMPTY_SUPPLIER_ID,
        supplier_name: primarySupplier?.name ?? '',
        shop_id: stock.shop.shop_id,
        measurement_value: stock.measurementValue,
        min_supply_price: stock.supplyPrice,
        max_supply_price: stock.supplyPrice,
        retail_price: stock.retailPrice,
        wholesale_price: 0,
      })),
      product_supply_stock: stockSummaries.map((stock) => ({
        shop_id: stock.shop.shop_id,
        shop_name: stock.shop.shop_name,
        measurement_value: stock.measurementValue,
        active_measurement_value: stock.measurementValue,
        inactive_measurement_value: 0,
        supply_price: stock.supplyPrice,
        supplier_ids: stock.supplierIds,
      })),
      status: 0,
      scale_plu: 0,
      scale_code: 0,
      is_scalable: false,
      shop_free_prices: null,
      brand_name: product.brand?.name ?? null,
      category_name: product.category?.name ?? null,
      photo: product.photo,
    };
  }

  private filterStocksByBranchCodes<
    T extends {
      branchCode: string;
    },
  >(stocks: T[], visibleBranchCodes?: string[]) {
    if (!visibleBranchCodes?.length) {
      return stocks;
    }

    const visibleBranchCodeSet = new Set(
      visibleBranchCodes.map((branchCode) => branchCode.trim()).filter(Boolean),
    );

    return stocks.filter((stock) => visibleBranchCodeSet.has(stock.branchCode));
  }

  private toCatalogCreateProductResponse(
    product: CatalogProductWithRelations,
    body: Record<string, unknown>,
    shipments: Array<{
      shopId: string;
      branchCode: string;
      quantity: number;
      supplyPrice: number;
      retailPrice: number;
      supplierId?: string;
      hasTrigger: boolean;
      smallLeftMeasurementValue: number;
    }>,
    supplierIds: string[],
    shopLookup: Map<string, ResolvedShop>,
    context: {
      userId: number;
      fullName: string;
      companyId?: string | null;
    },
  ) {
    const currencyCode =
      this.companySettingsService.getDefaultCurrencyIsoCode(
        context.companyId ?? undefined,
      );
    const shopPrices = this.extractShopPrices(
      body,
      shipments,
      product.purchasePrice ?? 0,
      product.salePrice ?? 0,
    );
    const shopFreePrices = this.extractShopFreePrices(body, shipments);
    const measurementUnit = {
      ...DEFAULT_MEASUREMENT_UNIT,
      company_id: COMPANY_ID,
      is_default: true,
    };
    const productType = this.resolveProductType(body.product_type_id);
    const isVariative = this.toBooleanValue(body.is_variative);
    const measurementType = this.optionalString(body.measurement_type);
    const supportsStock = !this.isServiceProductType(productType);
    const stockSummaries = shipments.map((shipment) => {
      const shop = this.resolveShopByBranchCode(shipment.branchCode, shopLookup);
      const supplySum = shipment.quantity * shipment.supplyPrice;
      const retailSum = shipment.quantity * shipment.retailPrice;
      const supplierId = shipment.supplierId ?? DEFAULT_EMPTY_SUPPLIER_ID;

      return {
        sourceShopId: shipment.shopId,
        shopId: shop.shop_id,
        shopName: shop.shop_name,
        measurementValue: shipment.quantity,
        supplyPrice: shipment.supplyPrice,
        retailPrice: shipment.retailPrice,
        supplySum,
        retailSum,
        supplierId,
        smallLeftMeasurementValue: shipment.smallLeftMeasurementValue,
        hasTrigger: shipment.hasTrigger,
      };
    });
    const totalMeasurementValue = stockSummaries.reduce(
      (sum, item) => sum + item.measurementValue,
      0,
    );
    const totalSupplyPrice = stockSummaries.reduce(
      (sum, item) => sum + item.supplySum,
      0,
    );
    const totalRetailPrice = stockSummaries.reduce(
      (sum, item) => sum + item.retailSum,
      0,
    );
    const resolvedShopIdsBySourceId = new Map(
      stockSummaries.map((item) => [item.sourceShopId, item.shopId]),
    );
    const normalizedShopPrices = shopPrices.map((item) => {
      const retailPrice = item.retail_price;
      const supplyPrice = item.supply_price;

      return {
        ...item,
        shop_id: resolvedShopIdsBySourceId.get(item.shop_id) ?? item.shop_id,
        retail_currency: item.retail_currency || currencyCode,
        supply_currency: item.supply_currency || currencyCode,
        currency_prices: item.currency_prices ?? [
          {
            currency: currencyCode,
            retail_price: retailPrice,
            min_supply_price: item.min_supply_price,
            max_supply_price: item.max_supply_price,
            supply_price: supplyPrice,
            wholesale_price: item.wholesale_price,
            min_price: item.min_price,
            max_price: item.max_price,
            prices_list: item.prices_list,
          },
        ],
      };
    });
    const normalizedShopFreePrices = shopFreePrices.map((item) => ({
      ...item,
      shop_id: resolvedShopIdsBySourceId.get(item.shop_id) ?? item.shop_id,
    }));

    return {
      additional_barcodes: null,
      archived_at: '',
      archived_by: {
        id: '',
        name: '',
      },
      barcode: product.barcode,
      barcode_lower: '',
      barcode_upper: '',
      base_name: product.name,
      brand_id: this.optionalString(body.brand_id) ?? '',
      brand_name: product.brand?.name ?? '',
      categories: null,
      company_id: context.companyId ?? COMPANY_ID,
      created_at: this.formatDateTime(product.createdAt),
      custom_fields: [],
      deleted: false,
      description: this.optionalString(body.description) ?? '',
      free_price: false,
      id: String(product.id),
      is_archived: false,
      is_marked: this.toBooleanValue(body.is_marked),
      is_scalable: false,
      is_variative: isVariative,
      main_image: product.photo ?? '',
      measurement_type: measurementType ?? '',
      measurement_unit: measurementUnit,
      measurement_values: {
        total_active_measurement_value: totalMeasurementValue,
        total_inactive_measurement_value: 0,
        total_measurement_value: totalMeasurementValue,
      },
      name: product.name,
      name_lower: '',
      name_upper: '',
      parent_id: '',
      photos: null,
      prices: {
        total_active_retail_price: totalRetailPrice,
        total_active_supply_price: totalSupplyPrice,
        total_inactive_retail_price: 0,
        total_inactive_supply_price: 0,
        total_retail_price: totalRetailPrice,
        total_supply_price: totalSupplyPrice,
      },
      product_attributes: [],
      product_supplier_stock: supportsStock
        ? stockSummaries.map((item) => ({
            supplier_id: item.supplierId,
            supplier_name: '',
            shop_id: item.shopId,
            measurement_value: item.measurementValue,
            min_supply_price: item.supplyPrice,
            max_supply_price: item.supplyPrice,
            retail_price: item.retailPrice,
            wholesale_price: 0,
          }))
        : [],
      product_supply_stock: supportsStock
        ? stockSummaries.map((item) => ({
            shop_id: item.shopId,
            shop_name: item.shopName,
            measurement_value: item.measurementValue,
            active_measurement_value: item.measurementValue,
            inactive_measurement_value: 0,
            supply_price: item.supplyPrice,
            supplier_ids: [item.supplierId],
          }))
        : [],
      product_type_id:
        productType ?? product.productType ?? DEFAULT_PRODUCT_TYPE_ID,
      retail_currency: currencyCode,
      retail_price: product.salePrice ?? 0,
      scale_code: 0,
      scale_plu: 0,
      set_products: [],
      shop_free_prices: supportsStock ? normalizedShopFreePrices : [],
      shop_measurement_values: supportsStock
        ? stockSummaries.map((item) => ({
            small_left_measurement_value: item.smallLeftMeasurementValue,
            has_trigger: item.hasTrigger,
            shop_id: item.shopId,
            total_measurement_value: item.measurementValue,
            total_min_supply_price: item.supplyPrice,
            total_max_supply_price: item.supplyPrice,
            total_supply_sum: item.supplySum,
            total_active_measurement_value: item.measurementValue,
            total_active_min_supply_price: item.supplyPrice,
            total_active_max_supply_price: item.supplyPrice,
            total_active_supply_sum: item.supplySum,
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
            total_retail_sum: item.retailSum,
            total_active_retail_sum: item.retailSum,
            total_inactive_retail_sum: 0,
          }))
        : [],
      shop_prices: supportsStock ? normalizedShopPrices : [],
      sku: product.sku,
      sku_lower: '',
      sku_upper: '',
      status: 1,
      supplier_id: supplierIds[0] ?? '',
      supplier_ids: supplierIds,
      suppliers: null,
      supply_currency: currencyCode,
      supply_price: product.purchasePrice ?? 0,
      updated_at: '',
      variation_id: '',
      variations: null,
      wholesale_price: 0,
    };
  }

  private buildProductWhere(
    search?: string,
    brandIds?: string[],
    supplierIds?: string[],
    status?: string,
    archivedList?: boolean,
    shopIds?: string[],
    categoryIds?: string[],
    sku?: string,
    measurementType?: string,
    supplyPriceFrom?: number,
    supplyPriceTo?: number,
    retailPriceFrom?: number,
    retailPriceTo?: number,
    wholesalePrice?: number,
    freePrice?: boolean,
  ): Prisma.ProductWhereInput | undefined {
    const and: Prisma.ProductWhereInput[] = [];

    if (search) {
      and.push({
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { sku: { contains: search, mode: 'insensitive' } },
          { barcode: { contains: search, mode: 'insensitive' } },
        ],
      });
    }

    if (sku) {
      and.push({
        sku: {
          contains: sku,
          mode: 'insensitive',
        },
      });
    }

    if (measurementType) {
      and.push({
        unit: {
          equals: measurementType,
          mode: 'insensitive',
        },
      });
    }

    const normalizedBrandIds = this.normalizeNumericStringArray(brandIds);
    if (normalizedBrandIds.length) {
      and.push({
        brandId: {
          in: normalizedBrandIds,
        },
      });
    }

    const normalizedSupplierIds = this.normalizeNumericStringArray(supplierIds);
    if (normalizedSupplierIds.length) {
      and.push({
        suppliers: {
          some: {
            supplierId: {
              in: normalizedSupplierIds,
            },
          },
        },
      });
    }

    if (status === 'active') {
      and.push({
        quantity: {
          gt: 0,
        },
      });
    }

    if (status === 'inactive') {
      and.push({
        quantity: {
          lte: 0,
        },
      });
    }

    if (archivedList) {
      and.push({
        quantity: {
          lte: 0,
        },
      });
    }

    const resolvedShopIds = this.toBranchCodes(shopIds);
    if (resolvedShopIds.length) {
      and.push({
        stocks: {
          some: {
            branchCode: {
              in: resolvedShopIds,
            },
          },
        },
      });
    }

    if (categoryIds?.length) {
      const numericCategoryIds = this.normalizeNumericStringArray(categoryIds);
      const namedCategoryIds = categoryIds
        .map((item) => item.trim())
        .filter((item) => item.length > 0 && !/^\d+$/.test(item));
      const categoryFilters: Prisma.ProductWhereInput[] = [];

      if (numericCategoryIds.length) {
        categoryFilters.push({
          categoryId: {
            in: numericCategoryIds,
          },
        });
      }

      if (namedCategoryIds.length) {
        categoryFilters.push({
          category: {
            name: {
              in: namedCategoryIds,
            },
          },
        });
      }

      if (categoryFilters.length) {
        and.push(
          categoryFilters.length === 1
            ? categoryFilters[0]
            : { OR: categoryFilters },
        );
      }
    }

    if (supplyPriceFrom !== undefined || supplyPriceTo !== undefined) {
      and.push({
        purchasePrice: {
          gte: supplyPriceFrom,
          lte: supplyPriceTo,
        },
      });
    }

    if (retailPriceFrom !== undefined || retailPriceTo !== undefined) {
      and.push({
        salePrice: {
          gte: retailPriceFrom,
          lte: retailPriceTo,
        },
      });
    }

    if (wholesalePrice !== undefined) {
      and.push({
        metadata: {
          path: ['wholesale_price'],
          equals: wholesalePrice,
        },
      });
    }

    if (freePrice !== undefined) {
      and.push({
        metadata: {
          path: ['free_price'],
          equals: freePrice,
        },
      });
    }

    if (!and.length) {
      return undefined;
    }

    return and.length === 1 ? and[0] : { AND: and };
  }

  private buildProductOrderBy(
    order?: string[],
  ): Prisma.ProductOrderByWithRelationInput {
    const normalizedOrder = order
      ?.map((item) => item.trim())
      .filter((item) => item.length > 0);

    const firstOrder = normalizedOrder?.[0];
    if (!firstOrder) {
      return { id: 'desc' };
    }

    const isDesc = firstOrder.startsWith('-');
    const field = isDesc ? firstOrder.slice(1) : firstOrder;
    const direction: Prisma.SortOrder = isDesc ? 'desc' : 'asc';

    switch (field) {
      case 'id':
        return { id: direction };
      case 'name':
        return { name: direction };
      case 'sku':
        return { sku: direction };
      case 'barcode':
        return { barcode: direction };
      case 'created_at':
        return { createdAt: direction };
      case 'updated_at':
        return { updatedAt: direction };
      case 'sale_price':
        return { salePrice: direction };
      case 'purchase_price':
      case 'supply_price':
        return { purchasePrice: direction };
      default:
        return { id: 'desc' };
    }
  }

  private buildProductsStatistics(
    products: {
      id: number;
      quantity: number;
      purchasePrice: number | null;
      salePrice: number | null;
      stocks: {
        quantity: number;
        purchasePrice: number | null;
        salePrice: number | null;
      }[];
    }[],
  ) {
    const currencyCode =
      this.companySettingsService.getDefaultCurrencyIsoCode();
    const totals = products.reduce(
      (acc, product) => {
        const measurementValue = product.stocks.length
          ? product.stocks.reduce((sum, stock) => sum + stock.quantity, 0)
          : product.quantity;

        const supplySum = product.stocks.length
          ? product.stocks.reduce(
              (sum, stock) =>
                sum +
                stock.quantity *
                  (stock.purchasePrice ?? product.purchasePrice ?? 0),
              0,
            )
          : measurementValue * (product.purchasePrice ?? 0);

        const retailSum = product.stocks.length
          ? product.stocks.reduce(
              (sum, stock) =>
                sum +
                stock.quantity * (stock.salePrice ?? product.salePrice ?? 0),
              0,
            )
          : measurementValue * (product.salePrice ?? 0);

        acc.totalMeasurementValue += measurementValue;
        acc.totalSupplyPrice += supplySum;
        acc.totalRetailPrice += retailSum;
        acc.zeroLeftCount += measurementValue <= 0 ? 1 : 0;
        acc.smallLeftCount +=
          measurementValue > 0 && measurementValue <= 5 ? 1 : 0;
        return acc;
      },
      {
        totalMeasurementValue: 0,
        totalSupplyPrice: 0,
        totalRetailPrice: 0,
        zeroLeftCount: 0,
        smallLeftCount: 0,
      },
    );

    return {
      statistics: {
        total_products_count: products.length,
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
        count: products.length,
      },
    };
  }

  private getCatalogFields() {
    const fieldNamesBySystemName: Record<string, string> = {
      name: 'Наименование',
      quantity: 'Кол-во',
      photo: 'Фото',
      brand_name: 'Бренд',
      category_name: 'Категория',
      discount_price: 'Скидочная цена',
      supply_price: 'Цена поставки',
      retail_price: 'Цена продажи',
      sku: 'Артикул',
      barcode: 'Баркод',
    };

    const orderedSystemNames = [
      'photo',
      'name',
      'sku',
      'barcode',
      'category_name',
      'supplier_name',  
      'quantity',
      'supply_price',
      'retail_price',
      'discount_price',
      'brand_name',
    ];

    return orderedSystemNames
      .map((systemName) =>
        PRODUCT_CHARACTERISTICS.find((field) => field.system_name === systemName),
      )
      .filter((field): field is (typeof PRODUCT_CHARACTERISTICS)[number] => !!field)
      .map((field, index) => ({
        id: '',
        name: fieldNamesBySystemName[field.system_name] ?? field.name,
        sequence_number: index + 11,
        is_active: true,
        is_attribute: false,
        is_custom_field: false,
      }));
  }

  private extractStockPayload(body: Record<string, unknown>) {
    const rawShipments = Array.isArray(body.shipments)
      ? body.shipments
      : Array.isArray(body.shop_measurement_values)
        ? body.shop_measurement_values
        : [];

    return rawShipments
      .filter(
        (item): item is Record<string, unknown> =>
          !!item && typeof item === 'object',
      )
      .map((item) => {
        const shopId = this.extractShopIdentifier(item);
        const quantity =
          this.toInt(item.measurement_value) ??
          this.toInt(item.total_measurement_value) ??
          0;

        return {
          shopId,
          quantity,
          supplyPrice: this.resolvePriceForShop(body, shopId, 'supply_price'),
          retailPrice: this.resolvePriceForShop(body, shopId, 'retail_price'),
          supplierId: this.optionalString(item.supplier_id),
          hasTrigger: this.toBooleanValue(item.has_trigger),
          smallLeftMeasurementValue:
            this.toInt(item.small_left_measurement_value) ?? 0,
        };
      })
      .filter((item) => item.shopId.length > 0);
  }

  private resolvePriceForShop(
    body: Record<string, unknown>,
    shopId: string,
    key: 'supply_price' | 'retail_price',
  ) {
    const shopPrices = Array.isArray(body.shop_prices) ? body.shop_prices : [];
    const matchedShopPrice = shopPrices.find(
      (item) =>
        !!item &&
        typeof item === 'object' &&
        this.extractShopIdentifier(item as Record<string, unknown>) === shopId,
    ) as Record<string, unknown> | undefined;

    return (
      this.toNumber(matchedShopPrice?.[key]) ?? this.toNumber(body[key]) ?? 0
    );
  }

  private extractShopPrices(
    body: Record<string, unknown>,
    shipments: Array<{
      shopId: string;
      supplyPrice: number;
      retailPrice: number;
    }>,
    defaultSupplyPrice: number,
    defaultRetailPrice: number,
  ) {
    const rawShopPrices = Array.isArray(body.shop_prices)
      ? body.shop_prices
      : [];

    if (rawShopPrices.length) {
      return rawShopPrices
        .filter(
          (item): item is Record<string, unknown> =>
            !!item && typeof item === 'object',
        )
        .map((item) => ({
          currency_prices: null,
          from_supply_price: 0,
          max_price: this.toNumber(item.max_price) ?? 0,
          max_supply_price:
            this.toNumber(item.supply_price) ?? defaultSupplyPrice,
          min_price: this.toNumber(item.min_price) ?? 0,
          min_supply_price:
            this.toNumber(item.supply_price) ?? defaultSupplyPrice,
          prices_list: [],
          promo_price: 0,
          promos: null,
          retail_currency: '',
          retail_price: this.toNumber(item.retail_price) ?? defaultRetailPrice,
          shop_id: this.optionalString(item.shop_id) ?? '',
          supply_currency: '',
          supply_price: this.toNumber(item.supply_price) ?? defaultSupplyPrice,
          wholesale_price: this.toNumber(item.wholesale_price) ?? 0,
        }));
    }

    return shipments.map((shipment) => ({
      currency_prices: null,
      from_supply_price: 0,
      max_price: 0,
      max_supply_price: shipment.supplyPrice,
      min_price: 0,
      min_supply_price: shipment.supplyPrice,
      prices_list: [],
      promo_price: 0,
      promos: null,
      retail_currency: '',
      retail_price: shipment.retailPrice,
      shop_id: shipment.shopId,
      supply_currency: '',
      supply_price: shipment.supplyPrice,
      wholesale_price: 0,
    }));
  }

  private extractShopFreePrices(
    body: Record<string, unknown>,
    shipments: Array<{ shopId: string }>,
  ) {
    const rawFreePrices = Array.isArray(body.shop_free_prices)
      ? body.shop_free_prices
      : [];

    if (rawFreePrices.length) {
      return rawFreePrices
        .filter(
          (item): item is Record<string, unknown> =>
            !!item && typeof item === 'object',
        )
        .map((item) => ({
          sell_with_free_price: false,
          shop_id: this.optionalString(item.shop_id) ?? '',
        }));
    }

    return shipments.map((shipment) => ({
      sell_with_free_price: false,
      shop_id: shipment.shopId,
    }));
  }

  private buildCatalogShipmentResponse(
    productId: number,
    shipments: Array<{
      shopId: string;
      branchCode: string;
      quantity: number;
      supplyPrice: number;
      retailPrice: number;
      supplierId?: string;
      hasTrigger: boolean;
      smallLeftMeasurementValue: number;
    }>,
    shopLookup: Map<string, ResolvedShop>,
    companyId?: string | null,
  ) {
    const currencyCode =
      this.companySettingsService.getDefaultCurrencyIsoCode(
        companyId ?? undefined,
      );

    return shipments.map((shipment) => {
      const shop = this.resolveShopByBranchCode(shipment.branchCode, shopLookup);

      return ({
      comment: '',
      company_id: companyId ?? COMPANY_ID,
      created_at: this.formatDateTime(new Date()),
      id: randomUUID(),
      items: [
        {
          currency_id: '',
          has_trigger: shipment.hasTrigger,
          id: randomUUID(),
          max_price: 0,
          measurement_type: '',
          measurement_value_credit: shipment.quantity,
          measurement_value_debit: 0,
          min_price: 0,
          prec: 0,
          price_id: '',
          product_barcode: '',
          product_condition_id: '',
          product_id: String(productId),
          product_name: '',
          product_sku: '',
          retail_currency: currencyCode,
          retail_price: shipment.retailPrice,
          serial_number: '',
          shipment_status_id: '',
          small_left_measurement_value: shipment.smallLeftMeasurementValue,
          supplier_id: shipment.supplierId ?? '',
          supply_currency: currencyCode,
          supply_price: shipment.supplyPrice,
          user: null,
          wholesale_price: 0,
        },
      ],
      order_id: '',
      process_id: '',
      process_type: 0,
      shipment_status_id: '31cd30a7-46ae-460c-9530-7c2df1356b62',
      shipment_type_id: 'a230b02b-46f8-42f4-885e-d81813c297d6',
      shop_id: shop.shop_id,
      total_loaded_items_measurement_value: 0,
    });
    });
  }

  private resolveProductType(value: unknown) {
    const normalized = this.optionalString(value)?.toLowerCase();
    if (!normalized) {
      return DEFAULT_PRODUCT_TYPE_ID;
    }

    if (normalized === PRODUCT_TYPE_IDS.goods || normalized === 'товар') {
      return PRODUCT_TYPE_IDS.goods;
    }

    if (normalized === PRODUCT_TYPE_IDS.service || normalized === 'услуга') {
      return PRODUCT_TYPE_IDS.service;
    }

    if (normalized === PRODUCT_TYPE_IDS.kit || normalized === 'комплект') {
      return PRODUCT_TYPE_IDS.kit;
    }

    return normalized;
  }

  private isGoodsProductType(productType: string) {
    return productType === PRODUCT_TYPE_IDS.goods;
  }

  private isServiceProductType(productType: string) {
    return productType === PRODUCT_TYPE_IDS.service;
  }

  private extractSelectedAttributes(value: unknown) {
    if (!Array.isArray(value)) {
      return [];
    }

    return value.flatMap((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        return [];
      }

      return [this.toPrismaInputJsonObject(item)];
    });
  }

  private applyProductScope(where: Prisma.ProductWhereInput | undefined, context: any) {
    if (!context || context.userType !== 'company') {
      return where;
    }

    const branchScope =
      context.allowedBranchCodes.length > 0
        ? {
            stocks: {
              some: {
                branchCode: {
                  in: context.allowedBranchCodes,
                },
              },
            },
          }
        : undefined;

    if (!branchScope) {
      return where;
    }

    if (!where) {
      return branchScope;
    }

    return {
      AND: [where, branchScope],
    } satisfies Prisma.ProductWhereInput;
  }

  private filterRequestedShopIds(shopIds: string[] | undefined, context: any) {
    if (!context || context.userType !== 'company') {
      return shopIds;
    }

    if (!shopIds?.length) {
      return context.allowedShopIds;
    }

    return shopIds.filter((shopId) => context.allowedShopIds.includes(shopId));
  }

  private requireCatalogWriteContext(context: any): {
    userId: number;
    fullName: string;
    userType: string;
    companyId?: string | null;
    allowedShopIds: string[];
    allowedBranchCodes: string[];
  } {
    if (!context) {
      throw new UnauthorizedException('Authorization is required');
    }

    if (context.userType !== 'company' && context.userType !== 'platform') {
      throw new UnauthorizedException('Unsupported user type');
    }

    return context;
  }

  private async resolveBranchCodesForFilter(
    shopIds: string[] | undefined,
    context: any,
  ) {
    if (!shopIds?.length) {
      return undefined;
    }

    const resolvedBranchCodes = new Set<string>();
    const normalizedIdentifiers = shopIds
      .map((shopId) => shopId.trim())
      .filter((shopId) => shopId.length > 0);

    if (!normalizedIdentifiers.length) {
      return undefined;
    }

    for (const identifier of normalizedIdentifiers) {
      if (context?.allowedBranchCodes?.includes(identifier)) {
        resolvedBranchCodes.add(identifier);
      }
    }

    const dbResolvedShops = await this.prisma.shop.findMany({
      where: {
        ...(context?.userType === 'company' && context.companyId
          ? {
              companyId: context.companyId,
            }
          : {}),
        OR: [
          {
            id: {
              in: normalizedIdentifiers,
            },
          },
          {
            branchCode: {
              in: normalizedIdentifiers,
            },
          },
        ],
      },
      select: {
        id: true,
        branchCode: true,
      },
    });

    for (const shop of dbResolvedShops) {
      if (
        !context?.userType ||
        context.userType !== 'company' ||
        context.allowedShopIds.includes(shop.id) ||
        context.allowedBranchCodes.includes(shop.branchCode)
      ) {
        resolvedBranchCodes.add(shop.branchCode);
      }
    }

    for (const identifier of normalizedIdentifiers) {
      const legacyBranchCode = this.resolveBranchCodeByShopId(identifier);

      if (
        legacyBranchCode &&
        (!context?.userType ||
          context.userType !== 'company' ||
          context.allowedBranchCodes.includes(legacyBranchCode))
      ) {
        resolvedBranchCodes.add(legacyBranchCode);
      }
    }

    return [...resolvedBranchCodes];
  }

  private filterStockPayloadByContext(stocks: unknown[], context: any) {
    if (!context || context.userType !== 'company') {
      return stocks;
    }

    return stocks.filter((stock) => {
      if (!stock || typeof stock !== 'object') {
        return false;
      }

      const shopIdentifier = this.extractShopIdentifier(
        stock as Record<string, unknown>,
      );
      if (!shopIdentifier) {
        return false;
      }

      return (
        context.allowedShopIds.includes(shopIdentifier) ||
        context.allowedBranchCodes.includes(shopIdentifier)
      );
    });
  }

  private async attachBranchCodesToShipments(
    shipments: Array<{
      shopId: string;
      quantity: number;
      supplyPrice: number;
      retailPrice: number;
      supplierId?: string;
      hasTrigger: boolean;
      smallLeftMeasurementValue: number;
    }>,
    context: any,
  ) {
    const normalizedIdentifiers = [...new Set(
      shipments
        .map((shipment) => shipment.shopId.trim())
        .filter((identifier) => identifier.length > 0),
    )];

    const resolvedBranchCodes = new Map<string, string>();

    if (context?.userType === 'company') {
      const matchingShops = normalizedIdentifiers.length
        ? await this.prisma.shop.findMany({
            where: {
              companyId: context.companyId,
              OR: [
                {
                  id: {
                    in: normalizedIdentifiers,
                  },
                },
                {
                  branchCode: {
                    in: normalizedIdentifiers,
                  },
                },
              ],
            },
            select: {
              id: true,
              branchCode: true,
            },
          })
        : [];

      for (const shop of matchingShops) {
        if (
          context.allowedShopIds.includes(shop.id) ||
          context.allowedBranchCodes.includes(shop.branchCode)
        ) {
          resolvedBranchCodes.set(shop.id, shop.branchCode);
          resolvedBranchCodes.set(shop.branchCode, shop.branchCode);
        }
      }
    }

    for (const identifier of normalizedIdentifiers) {
      if (resolvedBranchCodes.has(identifier)) {
        continue;
      }

      const legacyBranchCode = this.resolveBranchCodeByShopId(identifier);
      if (legacyBranchCode) {
        resolvedBranchCodes.set(identifier, legacyBranchCode);
      }
    }

    return shipments.map((shipment) => {
      const normalizedIdentifier = shipment.shopId.trim();
      const branchCode = resolvedBranchCodes.get(normalizedIdentifier);

      if (!branchCode) {
        throw new BadRequestException(
          `Unable to resolve branch for shop identifier "${normalizedIdentifier}"`,
        );
      }

      if (
        context?.userType === 'company' &&
        !context.allowedBranchCodes.includes(branchCode)
      ) {
        throw new BadRequestException(
          'This user does not have access to the requested shop',
        );
      }

      return {
        ...shipment,
        branchCode,
      };
    });
  }

  private extractShopIdentifier(item: Record<string, unknown>) {
    return (
      this.optionalString(item.shop_id) ??
      this.optionalString(item.shopId) ??
      this.optionalString(item.branch_code) ??
      this.optionalString(item.branchCode) ??
      ''
    ).trim();
  }

  private async resolveBranchCodeForWrite(shopIdentifier: string, context: any) {
    const normalizedIdentifier = shopIdentifier.trim();

    if (!normalizedIdentifier) {
      throw new BadRequestException('shop_id must be a non-empty string');
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
            'This user does not have access to the requested shop',
          );
        }

        return shop.branchCode;
      }
    }

    const legacyBranchCode = this.resolveBranchCodeByShopId(normalizedIdentifier);
    if (legacyBranchCode) {
      return legacyBranchCode;
    }

    return normalizedIdentifier;
  }

  private extractVariants(value: unknown) {
    if (!Array.isArray(value)) {
      return [];
    }

    return value.flatMap((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        return [];
      }

      return [this.toPrismaInputJsonObject(item)];
    });
  }

  private buildSkuPrefix(name?: string) {
    if (!name) {
      return undefined;
    }

    const cleaned = name.replace(/[^A-Za-zА-Яа-я0-9]/g, '').toUpperCase();
    if (!cleaned.length) {
      return undefined;
    }

    return cleaned.slice(0, SKU_PREFIX_LENGTH);
  }

  private parseProductId(id: string) {
    const parsed = Number(id);
    if (!Number.isInteger(parsed)) {
      throw new BadRequestException('product id must be a number');
    }

    return parsed;
  }

  private buildCatalogMetadata(
    body: Record<string, unknown>,
    description: string | undefined,
    options: {
      isVariative: boolean;
      selectedAttributes: Prisma.InputJsonObject[];
      variants: Prisma.InputJsonObject[];
    },
    context?: {
      companyId?: string | null;
    },
  ): Prisma.InputJsonObject {
    const firstShopPrice = Array.isArray(body.shop_prices)
      ? body.shop_prices.find(
          (item): item is Record<string, unknown> =>
            !!item && typeof item === 'object',
        )
      : undefined;
    return {
      brand_id: this.optionalString(body.brand_id) ?? null,
      brand_name: this.optionalString(body.brand_name) ?? null,
      description: description ?? null,
      measurement_unit_id:
        this.optionalString(body.measurement_unit_id) ?? null,
      company_id:
        context?.companyId ??
        this.optionalString(body.company_id) ??
        COMPANY_ID,
      product_type_id: this.resolveProductType(body.product_type_id) ?? null,
      is_variative: options.isVariative,
      selected_attributes: options.selectedAttributes,
      variants: options.variants,
      discount_price:
        this.toNumber(body.wholesale_price) ??
        this.toNumber(firstShopPrice?.wholesale_price) ??
        null,
      free_price: this.toBooleanValue(body.free_price),
    } satisfies Prisma.InputJsonObject;
  }

  private normalizeNumericStringArray(values?: string[]) {
    if (!values?.length) {
      return [];
    }

    return values
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value));
  }

  private toBranchCodes(values?: string[]) {
    if (!values?.length) {
      return [];
    }

    return values
      .map((value) => this.resolveBranchCodeByShopId(value))
      .filter((value) => value.trim().length > 0);
  }

  private requireString(value: unknown, field: string) {
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new BadRequestException(`${field} must be a non-empty string`);
    }

    return value.trim();
  }

  private optionalString(value: unknown) {
    if (typeof value !== 'string') {
      return undefined;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
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

  private toJsonFieldValue(
    value: unknown,
  ): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput | undefined {
    if (value === undefined) {
      return undefined;
    }

    if (value === null) {
      return Prisma.JsonNull;
    }

    return this.toPrismaInputJsonValue(value);
  }

  private toPrismaInputJsonObject(value: unknown): Prisma.InputJsonObject {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new BadRequestException('metadata must be a valid JSON object');
    }

    const result: Record<string, Prisma.InputJsonValue | null> = {};
    for (const [key, entry] of Object.entries(value)) {
      result[key] = this.toPrismaNestedJsonValue(entry);
    }

    return result as Prisma.InputJsonObject;
  }

  private toPrismaInputJsonValue(value: unknown): Prisma.InputJsonValue {
    if (value === null) {
      throw new BadRequestException('Top-level JSON value cannot be null');
    }

    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      return value;
    }

    if (Array.isArray(value)) {
      return value.map((item) => this.toPrismaNestedJsonValue(item));
    }

    if (typeof value === 'object') {
      return this.toPrismaInputJsonObject(value);
    }

    throw new BadRequestException('metadata must be a valid JSON value');
  }

  private toPrismaNestedJsonValue(
    value: unknown,
  ): Prisma.InputJsonValue | null {
    if (value === null) {
      return null;
    }

    return this.toPrismaInputJsonValue(value);
  }

  private resolveShopByBranchCode(
    branchCode: string,
    shopLookup?: Map<string, ResolvedShop>,
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
    const shopLookup = new Map<string, ResolvedShop>();

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
        id: shop.id,
        shop_id: shop.id,
        shop_name: shop.name,
        branch_code: shop.branchCode,
      });
    }

    return shopLookup;
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

  private formatDateTime(value: Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    const hours = String(value.getHours()).padStart(2, '0');
    const minutes = String(value.getMinutes()).padStart(2, '0');
    const seconds = String(value.getSeconds()).padStart(2, '0');

    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  }

  private toStringArrayValue(value: unknown) {
    if (!Array.isArray(value)) {
      return [];
    }

    return value.filter((item): item is string => typeof item === 'string');
  }

  private toBooleanValue(value: unknown) {
    if (typeof value === 'boolean') {
      return value;
    }

    if (typeof value === 'string') {
      return value === 'true';
    }

    return false;
  }

  private extractFirstImage(value: unknown) {
    if (!Array.isArray(value) || value.length === 0) {
      return undefined;
    }

    const firstImage = value[0];
    if (typeof firstImage === 'string') {
      return firstImage;
    }

    if (firstImage && typeof firstImage === 'object') {
      return this.optionalString((firstImage as Record<string, unknown>).url);
    }

    return undefined;
  }
}
