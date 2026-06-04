import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import { extname, join } from 'path';
import { CompanySettingsService } from '../company-settings/company-settings.service';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';

const ALLOWED_PRODUCT_PHOTO_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
]);

const MAX_PRODUCT_PHOTO_SIZE_BYTES = 10 * 1024 * 1024;

type CatalogProductWithRelations = Prisma.ProductGetPayload<{
  include: {
    category: true;
    brand: true;
    suppliers: {
      include: {
        supplier: true;
      };
    };
    stocks: true;
  };
}>;

type ResolvedShop = {
  id: string;
  shop_id: string;
  shop_name: string;
  branch_code: string;
};

type ImportRowInput = {
  name: string;
  sku?: string;
  barcode?: string;
  quantity: number;
  supplyPrice: number;
  retailPrice: number;
  categoryName?: string;
  brandName?: string;
  measurementUnit?: string;
  supplier?: string;
  description?: string;
};

type ImportValidationIssue = {
  code:
    | 'missing_identifier'
    | 'duplicate_sku'
    | 'duplicate_barcode'
    | 'invalid_quantity'
    | 'missing_supply_price'
    | 'missing_retail_price'
    | 'retail_below_supply'
    | 'match_error';
  field?: string;
  message: string;
};

type PreparedImportItem = {
  id: string;
  import_id: string;
  row_number: number;
  product_id: string;
  product_name: string;
  product_base_name: string;
  product_sku: string;
  product_barcode: string;
  supply_price: number;
  retail_price: number;
  supply_currency: string;
  retail_currency: string;
  measurement_type: string;
  measurement_value: number;
  measurement_unit: typeof DEFAULT_MEASUREMENT_UNIT;
  company_id: string;
  difference: boolean;
  different_fields: string[];
  old_product: Record<string, unknown> | null;
  product_info: Record<string, unknown> | null;
  free_price: boolean;
  declared_measurement_value: number;
  is_undeclared: boolean;
  supplier_id: string;
  description: string;
  error?: string;
  validation_issues: ImportValidationIssue[];
  action: 'create' | 'update' | 'error';
  raw: ImportRowInput;
};

type ImportSession = {
  id: string;
  jobId: string;
  companyId: string;
  shopId: string;
  branchCode: string;
  branchName?: string;
  stocktakingId?: string;
  name: string;
  mode: 'with_check' | 'without_check';
  status:
    | 'draft'
    | 'validating'
    | 'preview_ready'
    | 'importing'
    | 'completed'
    | 'cancelled'
    | 'failed';
  fields: Array<{
    id: string;
    name: string;
    sequence_number: number;
    is_active: boolean;
    is_attribute: boolean;
    is_custom_field: boolean;
  }>;
  rows: ImportRowInput[];
  items: PreparedImportItem[];
  onMatchPolicy: ImportOnMatchPolicy;
  dryRunSummary?: ImportDryRunSummary;
  result?: {
    created_count: number;
    updated_count: number;
    error_count: number;
    errors: Array<{ row: number; message: string }>;
    audit_rows?: ImportAuditRow[];
    committed_at?: string;
    committed_by?: {
      user_id: number;
      full_name: string;
      user_type: string;
    };
  };
  createdAt: string;
  updatedAt: string;
};

type PersistedImportSessionRow = {
  id: string;
  jobId: string;
  companyId: string;
  shopId: string;
  branchCode: string;
  branchName: string | null;
  stocktakingId: string | null;
  name: string;
  mode: 'with_check' | 'without_check';
  status:
    | 'draft'
    | 'validating'
    | 'preview_ready'
    | 'importing'
    | 'completed'
    | 'cancelled'
    | 'failed';
  fields: unknown;
  rows: unknown;
  items: unknown;
  onMatchPolicy: unknown;
  dryRunSummary: unknown;
  result: unknown;
  createdAt: string;
  updatedAt: string;
};

type StocktakingLogEntry = {
  id: string;
  action_code: string;
  created_at: string;
};

type StocktakingItem = {
  id: string;
  expected_measurement_value: number;
  scanned_measurement_value: number;
  importItemId: string;
  product_id: string;
  product_name: string;
  product_barcode: string;
  product_sku: string;
  supply_price: number;
  retail_price: number;
  measurement_unit: typeof DEFAULT_MEASUREMENT_UNIT;
  is_added: boolean;
  last_scan_num: number;
};

type StocktakingSession = {
  id: string;
  importId: string;
  companyId: string;
  shopId: string;
  name: string;
  useOldPrices: boolean;
  useImportProperties: boolean;
  createdBy: {
    id: string;
    name: string;
  };
  createdAt: string;
  acceptedAt?: string;
  items: StocktakingItem[];
  logs: StocktakingLogEntry[];
};

type ImportJob = {
  correlation_id: string;
  message: string;
  total: number;
  current: number;
  percent: number;
  is_finished: boolean;
  importId: string;
};

type TransferListQuery = {
  page: number;
  limit: number;
};

type TransferProductsQuery = {
  search?: string;
  limit: number;
  page: number;
  status?: string;
  statistics?: boolean;
  productTypeId?: string;
};

type TransferItemsQuery = {
  search?: string;
  limit: number;
  page: number;
};

type ImportFieldResolution = 'keep_store' | 'from_file';

type ImportOnMatchPolicy = {
  name: ImportFieldResolution;
  brand: ImportFieldResolution;
  category: ImportFieldResolution;
  description: ImportFieldResolution;
  measurementUnit: ImportFieldResolution;
  supplier: ImportFieldResolution;
  supplyPrice: ImportFieldResolution;
  retailPrice: ImportFieldResolution;
};

type ImportDryRunSummary = {
  create_count: number;
  update_count: number;
  error_count: number;
  blocking_error_count: number;
  conflicted_count: number;
  conflict_fields: Record<string, number>;
};

type LegacyImportActor = {
  id: string;
  name: string;
};

type ImportAuditRow = {
  row: number;
  action: 'create' | 'update' | 'error';
  reason: string;
  product_id?: number;
  changed_fields?: Array<{
    field: string;
    reason: string;
  }>;
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

const EXCEL_IMPORT_PROPERTIES = [
  'VARIATION_ID',
  'NAME',
  'SKU',
  'BARCODE',
  'QUANTITY',
  'SUPPLY_PRICE',
  'RETAIL_PRICE',
  'CATEGORY_NAME',
  'BRAND_NAME',
  'MEASUREMENT_UNIT',
  'SUPPLIER',
  'MIN_PRICE',
  'MAX_PRICE',
  'WHOLESALE_PRICE',
  'DESCRIPTION',
].map((systemName) => ({
  id: '',
  name: systemName,
  system_name: systemName,
  is_uploadable: false,
  is_new: false,
  is_attribute: false,
  is_characteristics: false,
}));

const IMPORT_JOBS = new Map<string, ImportJob>();
const IMPORT_SESSIONS = new Map<string, ImportSession>();
const STOCKTAKING_SESSIONS = new Map<string, StocktakingSession>();
const IMPORT_COMMIT_LOCKS = new Set<string>();
const PRODUCT_IMPORT_LOCKS = new Set<string>();

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
const BARCODE_PAYLOAD_BASE = 200000000000;
const BARCODE_PAYLOAD_MAX = 299999999999;
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
const TRANSFER_STATUS_IDS = {
  DRAFT: '65af5e85-252c-43be-8364-8c593c87c9e8',
  SENT: '7cbb2295-559e-4b72-a3c1-11ac24dffc6b',
  ACCEPTED: '31cd30a7-46ae-460c-9530-7c2df1356b62',
  CANCELLED: 'f4c1e781-bc72-4700-83bc-03fa175d94fb',
} as const;
const TRANSFER_FIELDS = [
  {
    id: '',
    name: 'variation_id',
    sequence_number: 11,
    is_active: true,
    is_attribute: false,
    is_custom_field: false,
  },
  {
    id: '',
    name: 'Кол-во',
    sequence_number: 12,
    is_active: true,
    is_attribute: false,
    is_custom_field: false,
  },
  {
    id: '',
    name: 'Фото',
    sequence_number: 13,
    is_active: true,
    is_attribute: false,
    is_custom_field: false,
  },
  {
    id: '',
    name: 'Бренд',
    sequence_number: 14,
    is_active: true,
    is_attribute: false,
    is_custom_field: false,
  },
  {
    id: '',
    name: 'Категория',
    sequence_number: 15,
    is_active: true,
    is_attribute: false,
    is_custom_field: false,
  },
  {
    id: '',
    name: 'Оптовая цена',
    sequence_number: 16,
    is_active: true,
    is_attribute: false,
    is_custom_field: false,
  },
  {
    id: '',
    name: 'Цена поставки',
    sequence_number: 17,
    is_active: true,
    is_attribute: false,
    is_custom_field: false,
  },
  {
    id: '',
    name: 'Цена продажи',
    sequence_number: 18,
    is_active: true,
    is_attribute: false,
    is_custom_field: false,
  },
  {
    id: '',
    name: 'Артикул',
    sequence_number: 19,
    is_active: true,
    is_attribute: false,
    is_custom_field: false,
  },
  {
    id: '',
    name: 'Баркод',
    sequence_number: 20,
    is_active: true,
    is_attribute: false,
    is_custom_field: false,
  },
] as const;
const IMPORT_TYPE_WITH_CHECK_ID = 'a230b02b-46f8-42f4-885e-d81813c297d6';
const IMPORT_TYPE_WITHOUT_CHECK_ID = 'fd152773-2e12-4c1a-8fb5-a7d5c9955750';
const IMPORT_STATUS_COMPLETED_ID = '31cd30a7-46ae-460c-9530-7c2df1356b62';
const IMPORT_STATUS_IN_PROGRESS_ID = 'f5e9f7df-9d5a-4b28-9b97-6c436caf3bf2';
const DEFAULT_IMPORT_ACTOR: LegacyImportActor = {
  id: '54a76f3a-afc4-405d-913f-6bd1ef01c951',
  name: 'Iskandarjon Yusupov',
};
const SHOP_BY_BRANCH_CODE: Record<
  string,
  { shop_id: string; shop_name: string; id?: string; aliases?: string[] }
> = {
  sd_mall: {
    id: 'eaca6237-dc5c-4d4b-83e5-62a1eeb9a89a',
    shop_id: '11dc3536-e1ce-447b-aedb-ce3784c4b1ad',
    shop_name: 'Samarqand Darvoza',
    aliases: ['main'],
  },
  globus_mall: {
    id: '5a256a71-34c1-42a0-a84d-1061bf84eb6c',
    shop_id: 'be25385b-8db2-4d96-8240-f1bb6bb3420c',
    shop_name: 'Globus Mall',
    aliases: ['a'],
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
  wholesalePriceFrom?: number;
  wholesalePriceTo?: number;
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

  async uploadProductPhoto(
    authorization: string | undefined,
    file?: {
      originalname: string;
      mimetype: string;
      size: number;
      buffer: Buffer;
    },
  ) {
    await this.getRequestContext(authorization);

    if (!file) {
      throw new BadRequestException('Product photo file is required');
    }

    if (!ALLOWED_PRODUCT_PHOTO_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException(
        'Only jpg, jpeg, png and webp files are allowed',
      );
    }

    if (file.size > MAX_PRODUCT_PHOTO_SIZE_BYTES) {
      throw new BadRequestException('Product photo size must be 10MB or less');
    }

    const uploadsDirectory = join(process.cwd(), 'uploads', 'products');
    await fs.mkdir(uploadsDirectory, { recursive: true });

    const extension = extname(file.originalname).toLowerCase() || '.jpg';
    const fileName = `${randomUUID()}${extension}`;
    const filePath = join(uploadsDirectory, fileName);

    await fs.writeFile(filePath, file.buffer);

    return {
      message: 'Product photo uploaded',
      url: this.buildProductPhotoUrl(fileName),
    };
  }

  private async getRequestContext(authorization?: string) {
    return authorization
      ? this.usersService.getRequestContext(authorization)
      : null;
  }

  async searchForPos(
    args: { q?: string; shopId?: string; limit?: number },
    authorization?: string,
  ) {
    const context = await this.getRequestContext(authorization);
    if (!context || context.userType !== 'company' || !context.companyId) {
      throw new ForbiddenException(
        'Only company users can search POS products',
      );
    }

    const shopId = args.shopId?.trim() || context.currentShopId;
    if (!shopId) {
      throw new BadRequestException('shopId is required');
    }

    const branchCode = await this.resolveBranchCodeForWrite(shopId, context);
    const search = args.q?.trim();
    const limit = Math.min(Math.max(args.limit ?? 20, 1), 100);

    const products = await this.prisma.product.findMany({
      where: {
        companyId: context.companyId,
        archivedAt: null,
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: 'insensitive' as const } },
                { sku: { contains: search, mode: 'insensitive' as const } },
                {
                  barcode: {
                    contains: search,
                    mode: 'insensitive' as const,
                  },
                },
              ],
            }
          : {}),
        stocks: {
          some: {
            branchCode,
          },
        },
      },
      include: {
        stocks: {
          where: {
            branchCode,
          },
        },
      },
      orderBy: {
        name: 'asc',
      },
      take: limit,
    });

    return products.map((product) => {
      const stock = product.stocks[0];

      return {
        id: String(product.id),
        publicId: product.publicId,
        name: product.name,
        sku: product.sku,
        barcode: product.barcode,
        sellPrice: stock?.salePrice ?? product.salePrice ?? 0,
        stock: stock?.quantity ?? 0,
      };
    });
  }

  getProductCharacteristics(limit?: string) {
    const parsedLimit = limit ? Number(limit) : PRODUCT_CHARACTERISTICS.length;
    if (Number.isNaN(parsedLimit) || parsedLimit <= 0) {
      throw new BadRequestException('limit must be a positive number');
    }

    const billzCharacteristics = PRODUCT_CHARACTERISTICS.filter(
      (item) => item.system_name !== 'supplier_name',
    ).map((item) => {
      const namesBySystemName: Record<string, string> = {
        variation_id: 'variation_id',
        quantity: 'Кол-во',
        photo: 'Фото',
        brand_name: 'Бренд',
        category_name: 'Категория',
        discount_price: 'Оптовая цена',
        supply_price: 'Цена поставки',
        retail_price: 'Цена продажи',
        sku: 'Артикул',
        barcode: 'Баркод',
        name: 'Наименование',
      };
      const systemName =
        item.system_name === 'discount_price'
          ? 'wholesale_price'
          : item.system_name;

      return {
        ...item,
        name: namesBySystemName[item.system_name] ?? item.name,
        system_name: systemName,
      };
    });

    const safeLimit = Math.min(
      Math.trunc(parsedLimit),
      billzCharacteristics.length,
    );

    return {
      active_count: billzCharacteristics.length,
      deleted_count: 2,
      product_characteristics: billzCharacteristics.slice(0, safeLimit),
    };
  }

  getExcelImportProperties(limit?: string) {
    const parsedLimit = limit ? Number(limit) : EXCEL_IMPORT_PROPERTIES.length;
    if (Number.isNaN(parsedLimit) || parsedLimit <= 0) {
      throw new BadRequestException('limit must be a positive number');
    }

    const safeLimit = Math.min(
      Math.trunc(parsedLimit),
      EXCEL_IMPORT_PROPERTIES.length,
    );

    return EXCEL_IMPORT_PROPERTIES.slice(0, safeLimit);
  }

  async createImportDraft(
    body: Record<string, unknown>,
    authorization?: string,
  ) {
    const context = await this.getRequestContext(authorization);
    const writeContext = this.requireCatalogWriteContext(context);
    const companyId = this.resolveImportCompanyId(body, writeContext);
    const shopId = this.requireString(body.shop_id, 'shop_id');
    const branchCode = await this.resolveBranchCodeForWrite(
      shopId,
      writeContext,
    );
    const rows = this.extractImportRows(body);
    const fields = this.extractImportFields(body);
    const onMatchPolicy =
      this.extractImportOnMatchPolicy(body) ??
      this.defaultImportOnMatchPolicy();
    const now = this.formatDateTime(new Date());
    const importId = randomUUID();
    const mode = this.parseImportMode(body.mode);

    const session: ImportSession = {
      id: importId,
      jobId: '',
      companyId,
      shopId,
      branchCode,
      name: this.requireString(body.name, 'name'),
      mode,
      status: 'draft',
      fields,
      rows,
      items: [],
      onMatchPolicy,
      dryRunSummary: undefined,
      result: undefined,
      createdAt: now,
      updatedAt: now,
    };

    IMPORT_SESSIONS.set(importId, session);
    await this.persistImportSession(session);

    return this.toImportSessionSummary(session);
  }

  async listImports(
    query: { page?: number; limit?: number },
    authorization?: string,
  ) {
    const safePage = Math.max(1, query.page ?? 1);
    const safeLimit = Math.min(Math.max(1, query.limit ?? 10), 100);
    const context = await this.getRequestContext(authorization);
    const sessions = await this.listPersistedImportSessions(
      (safePage - 1) * safeLimit,
      safeLimit,
    );
    const imports = sessions.map((session, index) =>
      this.toLegacyImportListItem(
        session,
        (safePage - 1) * safeLimit + index,
        context,
      ),
    );

    return {
      imports,
      count: await this.countPersistedImportSessions(),
    };
  }

  async getImportById(id: string) {
    const session = await this.resolveImportSessionFromStore(id);
    if (!session) {
      throw new NotFoundException('Import session not found');
    }

    return {
      ...this.toImportSessionSummary(session),
      fields: session.fields,
      rows_count: session.rows.length,
      rows: session.rows,
      dry_run_summary: session.dryRunSummary ?? null,
      result: session.result ?? null,
    };
  }

  async validateExcelImport(
    body: Record<string, unknown>,
    authorization?: string,
  ) {
    const context = await this.getRequestContext(authorization);
    const writeContext = this.requireCatalogWriteContext(context);
    const importId =
      this.optionalString(body.import_id) ??
      this.optionalString(body.id) ??
      randomUUID();
    const existingSession = await this.resolveImportSessionFromStore(importId);
    const shopId =
      this.optionalString(body.shop_id) ?? existingSession?.shopId ?? '';

    if (!shopId) {
      throw new BadRequestException('shop_id must be a non-empty string');
    }

    const companyId = this.resolveImportCompanyId(
      existingSession
        ? {
            ...body,
            company_id:
              this.optionalString(body.company_id) ?? existingSession.companyId,
          }
        : body,
      writeContext,
    );
    const branchCode = await this.resolveBranchCodeForWrite(
      shopId,
      writeContext,
    );
    const rows = Array.isArray(body.rows)
      ? this.extractImportRows(body)
      : (existingSession?.rows ?? []);

    if (!rows.length) {
      throw new BadRequestException('rows must be an array');
    }
    const jobId = randomUUID();
    const fields = this.extractImportFields(body);
    const onMatchPolicy =
      this.extractImportOnMatchPolicy(body, false) ??
      existingSession?.onMatchPolicy ??
      this.defaultImportOnMatchPolicy();
    const items = await this.prepareImportItems(
      importId,
      companyId,
      rows,
      branchCode,
      writeContext.companyId,
    );
    const dryRunSummary = this.buildImportDryRunSummary(items);

    const mode = existingSession?.mode ?? this.parseImportMode(body.mode);
    const now = this.formatDateTime(new Date());
    const session: ImportSession = {
      id: importId,
      jobId,
      companyId,
      shopId,
      branchCode,
      name:
        this.optionalString(body.name) ??
        existingSession?.name ??
        `Import ${now}`,
      mode,
      status: 'preview_ready',
      fields,
      rows,
      items,
      onMatchPolicy,
      dryRunSummary,
      result: existingSession?.result,
      createdAt: existingSession?.createdAt ?? now,
      updatedAt: now,
    };
    IMPORT_SESSIONS.set(importId, session);
    await this.persistImportSession(session);

    IMPORT_JOBS.set(jobId, {
      correlation_id: importId,
      message: 'product-load',
      total: rows.length,
      current: rows.length,
      percent: 100,
      is_finished: true,
      importId,
    });

    return {
      message: jobId,
      job_id: jobId,
      correlation_id: importId,
      import_id: importId,
      dry_run_summary: dryRunSummary,
    };
  }

  async getImportProgress(id: string) {
    const resolvedJobId = IMPORT_JOBS.has(id)
      ? id
      : (this.resolveImportSession(id)?.jobId ?? '');
    const job = resolvedJobId ? IMPORT_JOBS.get(resolvedJobId) : undefined;
    if (job) {
      return {
        correlation_id: job.correlation_id,
        import_id: job.importId,
        message: job.message,
        total: job.total,
        current: job.current,
        percent: job.percent,
        is_finished: job.is_finished,
      };
    }

    const session = await this.resolveImportSessionFromStore(id);
    if (!session) {
      throw new NotFoundException('Import job not found');
    }

    const isFinished =
      session.status === 'preview_ready' ||
      session.status === 'completed' ||
      session.status === 'cancelled' ||
      session.status === 'failed';

    return {
      correlation_id: session.id,
      import_id: session.id,
      message: 'product-load',
      total: session.rows.length,
      current: isFinished ? session.rows.length : 0,
      percent: isFinished ? 100 : 0,
      is_finished: isFinished,
    };
  }

  async getImportItemsDp(id: string) {
    const session = await this.resolveImportSessionFromStore(id);
    if (!session) {
      throw new NotFoundException('Import session not found');
    }

    await this.ensureImportPreviewItems(session);

    return {
      count: session.items.length,
      import_items: session.items,
    };
  }

  async getImportSearch(
    id: string,
    query: {
      limit: number;
      page: number;
      difference: boolean;
    },
  ) {
    const session = await this.resolveImportSessionFromStore(id);
    if (!session) {
      throw new NotFoundException('Import session not found');
    }

    await this.ensureImportPreviewItems(session);

    const safeLimit = Math.min(Math.max(1, query.limit), 10000);
    const safePage = Math.max(1, query.page);
    const filteredItems = query.difference
      ? session.items.filter((item) => item.difference)
      : session.items;
    const paginatedItems = filteredItems.slice(
      (safePage - 1) * safeLimit,
      safePage * safeLimit,
    );

    return {
      items: paginatedItems,
      count: filteredItems.length,
      total_measurement_value: filteredItems.reduce(
        (sum, item) => sum + item.measurement_value,
        0,
      ),
      total_supply_price: filteredItems.reduce(
        (sum, item) => sum + item.measurement_value * item.supply_price,
        0,
      ),
      total_retail_price: filteredItems.reduce(
        (sum, item) => sum + item.measurement_value * item.retail_price,
        0,
      ),
      fields: session.fields,
      dry_run_summary:
        session.dryRunSummary ?? this.buildImportDryRunSummary(session.items),
    };
  }

  async importWithoutCheck(
    body: Record<string, unknown>,
    authorization?: string,
  ) {
    const context = await this.getRequestContext(authorization);
    const writeContext = this.requireCatalogWriteContext(context);
    const companyId = this.resolveImportCompanyId(body, writeContext);
    const shopId = this.requireString(body.shop_id, 'shop_id');
    const branchCode = await this.resolveBranchCodeForWrite(
      shopId,
      writeContext,
    );
    const rows = this.extractImportRows(body);
    const onMatchPolicy =
      this.extractImportOnMatchPolicy(body) ??
      this.defaultImportOnMatchPolicy();
    const now = this.formatDateTime(new Date());
    const importId = randomUUID();
    const previewItems = await this.prepareImportItems(
      importId,
      companyId,
      rows,
      branchCode,
      writeContext.companyId,
    );

    if (previewItems.some((item) => item.validation_issues.length > 0)) {
      throw new BadRequestException({
        message: 'Import without check contains validation errors',
        import_id: importId,
        errors: previewItems
          .filter((item) => item.validation_issues.length > 0)
          .map((item) => ({
            row: item.row_number,
            sku: item.product_sku,
            barcode: item.product_barcode,
            issues: item.validation_issues,
          })),
      });
    }

    const result = await this.applyImportRows(
      rows,
      companyId,
      shopId,
      branchCode,
      onMatchPolicy,
      writeContext.userId,
    );

    const session: ImportSession = {
      id: importId,
      jobId: '',
      companyId,
      shopId,
      branchCode,
      name: this.optionalString(body.name) ?? `Import ${now}`,
      mode: 'without_check',
      status: 'completed',
      fields: this.extractImportFields(body),
      rows,
      items: previewItems,
      onMatchPolicy,
      dryRunSummary: this.buildImportDryRunSummary(previewItems),
      result,
      createdAt: now,
      updatedAt: now,
    };
    IMPORT_SESSIONS.set(importId, session);
    await this.persistImportSession(session);

    return {
      import_id: importId,
      ...result,
    };
  }

  async createImportInventory(
    body: Record<string, unknown>,
    authorization?: string,
  ) {
    const context = await this.getRequestContext(authorization);
    const session = await this.resolveImportSessionFromStore(
      this.requireString(body.import_id, 'import_id'),
    );
    if (!session) {
      throw new NotFoundException('Import session not found');
    }

    await this.ensureImportPreviewItems(session);

    const stocktakingId = session.stocktakingId ?? randomUUID();
    const useOldPrices = this.toBooleanValue(body.use_old_prices);
    const useImportProperties = this.toBooleanValue(body.use_import_properties);
    const actor = {
      id: String(context?.userId ?? ''),
      name: context?.fullName ?? '',
    };
    const createdAt = this.formatDateTime(new Date(), session.companyId);
    const items = session.items.map((item) => ({
      id: randomUUID(),
      expected_measurement_value: item.measurement_value,
      scanned_measurement_value: 0,
      importItemId: item.id,
      product_id: item.product_id,
      product_name: item.product_name,
      product_barcode: item.product_barcode,
      product_sku: item.product_sku,
      supply_price: item.supply_price,
      retail_price: item.retail_price,
      measurement_unit: item.measurement_unit,
      is_added: false,
      last_scan_num: 0,
    }));

    STOCKTAKING_SESSIONS.set(stocktakingId, {
      id: stocktakingId,
      importId: session.id,
      companyId: session.companyId,
      shopId: session.shopId,
      name: `Импорт ${this.buildLegacyImportNumericId(session, 0)}`,
      useOldPrices,
      useImportProperties,
      createdBy: actor,
      createdAt,
      items,
      logs: [
        this.createStocktakingLogEntry('user_enter_stocktaking'),
        this.createStocktakingLogEntry('user_exit_stocktaking'),
      ],
    });
    session.stocktakingId = stocktakingId;
    session.updatedAt = this.formatDateTime(new Date(), session.companyId);
    await this.persistImportSession(session);

    return {
      session_id: randomUUID(),
      company_id: session.companyId,
      status_code: 200,
      id: session.id,
      error: {
        code: '',
        message: '',
      },
      data: {
        ProcessID: '',
        ProcessType: 0,
        company_id: session.companyId,
        correlation_id: '',
        created_by: {
          id: '',
          name: '',
        },
        external_id: 1000000 + this.buildLegacyImportNumericId(session, 1),
        id: stocktakingId,
        import_id: session.id,
        is_resulting: false,
        items: items.map((item) => this.toStocktakingCreatedItemResponse(item)),
        name: `Импорт ${1000000 + this.buildLegacyImportNumericId(session, 1)}`,
        order_id: '',
        portion_size: 0,
        product_ids: null,
        products: items
          .filter((item) => item.product_id)
          .map((item) => ({
            product_id: item.product_id,
          })),
        sent: 0,
        session_id: randomUUID(),
        shop_id: session.shopId,
        total: 0,
        transfer_id: '',
        type: 'IMPORT',
      },
      correlation_id: randomUUID(),
      topic: 'v2.inventory_service.stocktaking.created',
    };
  }

  getStocktakingById(
    id: string,
    query: { page: number; limit: number; type?: string },
  ) {
    const stocktaking = this.resolveStocktakingSession(id);
    if (!stocktaking) {
      throw new NotFoundException('Stocktaking not found');
    }

    const safeLimit = Math.max(1, Math.min(query.limit, 1000));
    const safePage = Math.max(1, query.page);
    const sourceItems =
      query.type === 'scanned'
        ? stocktaking.items.filter((item) => item.scanned_measurement_value > 0)
        : stocktaking.items;
    const items = sourceItems.slice(
      (safePage - 1) * safeLimit,
      safePage * safeLimit,
    );

    return {
      count: sourceItems.length,
      items: items.length
        ? items.map((item) => this.toStocktakingListItemResponse(stocktaking, item))
        : null,
    };
  }

  getStocktakingLogs(id: string, query: { page: number; limit: number }) {
    const stocktaking = this.resolveStocktakingSession(id);
    if (!stocktaking) {
      throw new NotFoundException('Stocktaking not found');
    }

    const safeLimit = Math.max(1, Math.min(query.limit, 100));
    const safePage = Math.max(1, query.page);
    const logs = stocktaking.logs
      .slice()
      .reverse()
      .slice((safePage - 1) * safeLimit, safePage * safeLimit);

    return {
      count: stocktaking.logs.length,
      logs: logs.map((entry) => this.toStocktakingLogResponse(stocktaking, entry)),
      users: stocktaking.createdBy.id
        ? [
            {
              id: stocktaking.createdBy.id,
              name: stocktaking.createdBy.name,
            },
          ]
        : [],
    };
  }

  async setStocktakingProductByBarcode(
    id: string,
    body: Record<string, unknown>,
    authorization?: string,
  ) {
    const stocktaking = this.resolveStocktakingSession(id);
    if (!stocktaking) {
      throw new NotFoundException('Stocktaking not found');
    }

    const context = await this.getRequestContext(authorization);
    const productBarcode = this.requireString(body.product_barcode, 'product_barcode');
    const requestedProductId = this.optionalString(body.product_id) ?? '';
    const requestedValue =
      this.toNumber(body.measurement_value ?? body.quantity ?? 1) ?? 1;
    const item = stocktaking.items.find(
      (candidate) =>
        candidate.product_barcode === productBarcode &&
        (!requestedProductId || candidate.product_id === requestedProductId),
    );

    if (!item) {
      throw new NotFoundException('Stocktaking item not found by barcode');
    }

    item.scanned_measurement_value += requestedValue;
    item.last_scan_num = Math.trunc(Date.now() / 1000);

    const session = this.resolveImportSession(stocktaking.importId);
    const importItem = session?.items.find((candidate) => candidate.id === item.importItemId);
    const productInfo =
      importItem?.product_info && !stocktaking.useImportProperties
        ? importItem.product_info
        : null;
    const productName =
      !stocktaking.useImportProperties && productInfo
        ? this.optionalString((productInfo as Record<string, unknown>).name) ??
          item.product_name
        : item.product_name;

    return {
      session_id: randomUUID(),
      status_code: 200,
      id: randomUUID(),
      error: {
        code: '',
        message: '',
      },
      data: {
        company_id: '',
        item: {
          excluded_after_archive: false,
          expected_measurement_value: item.expected_measurement_value,
          id: item.id,
          is_added: false,
          last_scan_num: item.last_scan_num,
          measurement_unit: item.measurement_unit,
          min_movement_date: '',
          min_movement_date_num: 0,
          postponed_measurement_value: 0,
          product_archived: false,
          product_attributes: '',
          product_barcode: item.product_barcode,
          product_base_name: '',
          product_id: item.product_id,
          product_name: productName,
          product_sku: item.product_sku,
          retail_price: item.retail_price,
          scanned_measurement_value: item.scanned_measurement_value,
          stocktaking_id: stocktaking.id,
          supply_price: stocktaking.useOldPrices ? 0 : item.supply_price,
          to_import: 0,
          to_write_off: 0,
          total_active_measurement_value: 0,
          total_imported_measurement_value: 0,
          total_in_transfer_measurement_value: 0,
          total_inactive_measurement_value: 0,
          total_measurement_value: 0,
          total_sold_measurement_value: 0,
          total_transfer_arrived_measurement_value: 0,
          total_transfered_measurement_value: 0,
          total_written_off_measurement_value: 0,
          type: 'ok',
        },
        measurement_value: 0,
        product_barcode: item.product_barcode,
        product_id: item.product_id,
        skip_archived: false,
        stocktaking: this.toStocktakingSessionResponse(stocktaking),
        stocktaking_id: '',
        unarchive: false,
        user: {
          id: String(context?.userId ?? ''),
          name: context?.fullName ?? '',
        },
      },
      correlation_id: randomUUID(),
      topic: 'v2.inventory_service.stocktaking.item.set.measurement_value',
    };
  }

  async acceptStocktakingImport(id: string, authorization?: string) {
    const stocktaking = this.resolveStocktakingSession(id);
    if (!stocktaking) {
      throw new NotFoundException('Stocktaking not found');
    }

    const session = this.resolveImportSession(stocktaking.importId);
    if (!session) {
      throw new NotFoundException('Import session not found');
    }

    if (stocktaking.acceptedAt && session.result) {
      return {
        import_id: session.id,
        stocktaking_id: stocktaking.id,
        idempotent: true,
        ...session.result,
      };
    }

    const result = await this.commitImport(session.id, authorization, {
      forceWithCheckAccept: true,
    });
    stocktaking.acceptedAt = this.formatDateTime(new Date(), stocktaking.companyId);

    return {
      ...result,
      import_id: session.id,
      stocktaking_id: stocktaking.id,
      accepted_at: stocktaking.acceptedAt,
    };
  }

  async commitImport(
    id: string,
    authorization?: string,
    options?: { forceWithCheckAccept?: boolean },
  ) {
    const session = await this.resolveImportSessionFromStore(id);
    if (!session) {
      throw new NotFoundException('Import session not found');
    }

    const context = await this.getRequestContext(authorization);
    const writeContext = this.requireCatalogWriteContext(context);

    if (session.mode === 'with_check' && !options?.forceWithCheckAccept) {
      throw new BadRequestException(
        'Import with check must be accepted explicitly before products are created',
      );
    }

    if (session.status === 'completed' && session.result) {
      return {
        import_id: session.id,
        idempotent: true,
        ...session.result,
      };
    }

    if (IMPORT_COMMIT_LOCKS.has(session.id)) {
      throw new BadRequestException('Import commit is already in progress');
    }
    IMPORT_COMMIT_LOCKS.add(session.id);

    try {
      session.status = 'importing';
      session.updatedAt = this.formatDateTime(new Date());
      await this.persistImportSession(session);
      await this.ensureImportPreviewItems(session);
      if (session.items.some((item) => item.validation_issues.length > 0)) {
        session.status = 'preview_ready';
        await this.persistImportSession(session);
        throw new BadRequestException(
          this.buildImportCommitValidationError(session),
        );
      }
      const result = await this.applyImportRows(
        session.items
          .filter((item) => item.action !== 'error')
          .map((item) => item.raw),
        session.companyId,
        session.shopId,
        session.branchCode,
        session.onMatchPolicy,
        writeContext.userId,
      );
      session.result = {
        ...result,
        committed_at: this.formatDateTime(new Date()),
        committed_by: {
          user_id: writeContext.userId,
          full_name: writeContext.fullName,
          user_type: writeContext.userType,
        },
      };
      session.status = 'completed';
      session.updatedAt = this.formatDateTime(new Date());
      await this.persistImportSession(session);
    } finally {
      IMPORT_COMMIT_LOCKS.delete(session.id);
    }

    return {
      import_id: session.id,
      ...session.result,
    };
  }

  async cancelImport(id: string) {
    const session = await this.resolveImportSessionFromStore(id);
    if (!session) {
      throw new NotFoundException('Import session not found');
    }

    session.status = 'cancelled';
    session.updatedAt = this.formatDateTime(new Date());
    await this.persistImportSession(session);

    return this.toImportSessionSummary(session);
  }

  private resolveImportSession(id: string) {
    const directSession = IMPORT_SESSIONS.get(id);
    if (directSession) {
      return directSession;
    }

    const job = IMPORT_JOBS.get(id);
    if (!job) {
      return undefined;
    }

    return IMPORT_SESSIONS.get(job.importId);
  }

  private async resolveImportSessionFromStore(id: string) {
    const directSession = this.resolveImportSession(id);
    if (directSession) {
      return directSession;
    }

    const persistedSession =
      (await this.loadPersistedImportSessionById(id)) ??
      (await this.loadPersistedImportSessionByJobId(id));

    if (!persistedSession) {
      return undefined;
    }

    IMPORT_SESSIONS.set(persistedSession.id, persistedSession);
    if (persistedSession.jobId) {
      IMPORT_JOBS.set(persistedSession.jobId, {
        correlation_id: persistedSession.id,
        message: 'product-load',
        total: persistedSession.rows.length,
        current:
          persistedSession.status === 'completed' ||
          persistedSession.status === 'preview_ready' ||
          persistedSession.status === 'cancelled' ||
          persistedSession.status === 'failed'
            ? persistedSession.rows.length
            : 0,
        percent:
          persistedSession.status === 'completed' ||
          persistedSession.status === 'preview_ready' ||
          persistedSession.status === 'cancelled' ||
          persistedSession.status === 'failed'
            ? 100
            : 0,
        is_finished:
          persistedSession.status === 'completed' ||
          persistedSession.status === 'preview_ready' ||
          persistedSession.status === 'cancelled' ||
          persistedSession.status === 'failed',
        importId: persistedSession.id,
      });
    }

    return persistedSession;
  }

  private async persistImportSession(session: ImportSession) {
    const branchName =
      session.branchName ??
      this.resolveShopByBranchCode(session.branchCode).shop_name;
    session.branchName = branchName;

    await this.prisma.$executeRaw(
      Prisma.sql`
        INSERT INTO "ProductImportSession" (
          "id",
          "jobId",
          "companyId",
          "shopId",
          "branchCode",
          "branchName",
          "stocktakingId",
          "name",
          "mode",
          "status",
          "fields",
          "rows",
          "items",
          "onMatchPolicy",
          "dryRunSummary",
          "result",
          "createdAt",
          "updatedAt"
        )
        VALUES (
          ${session.id},
          ${session.jobId},
          ${session.companyId},
          ${session.shopId},
          ${session.branchCode},
          ${branchName},
          ${session.stocktakingId ?? null},
          ${session.name},
          ${session.mode},
          ${session.status},
          ${this.asJsonb(session.fields)},
          ${this.asJsonb(session.rows)},
          ${this.asJsonb(session.items)},
          ${this.asJsonb(session.onMatchPolicy)},
          ${this.asJsonb(session.dryRunSummary ?? null)},
          ${this.asJsonb(session.result ?? null)},
          ${session.createdAt},
          ${session.updatedAt}
        )
        ON CONFLICT ("id") DO UPDATE SET
          "jobId" = EXCLUDED."jobId",
          "companyId" = EXCLUDED."companyId",
          "shopId" = EXCLUDED."shopId",
          "branchCode" = EXCLUDED."branchCode",
          "branchName" = EXCLUDED."branchName",
          "stocktakingId" = EXCLUDED."stocktakingId",
          "name" = EXCLUDED."name",
          "mode" = EXCLUDED."mode",
          "status" = EXCLUDED."status",
          "fields" = EXCLUDED."fields",
          "rows" = EXCLUDED."rows",
          "items" = EXCLUDED."items",
          "onMatchPolicy" = EXCLUDED."onMatchPolicy",
          "dryRunSummary" = EXCLUDED."dryRunSummary",
          "result" = EXCLUDED."result",
          "createdAt" = EXCLUDED."createdAt",
          "updatedAt" = EXCLUDED."updatedAt"
      `,
    );
  }

  private async loadPersistedImportSessionById(id: string) {
    const rows = await this.prisma.$queryRaw<PersistedImportSessionRow[]>(
      Prisma.sql`
        SELECT
          "id",
          "jobId",
          "companyId",
          "shopId",
          "branchCode",
          "branchName",
          "stocktakingId",
          "name",
          "mode",
          "status",
          "fields",
          "rows",
          "items",
          "onMatchPolicy",
          "dryRunSummary",
          "result",
          "createdAt",
          "updatedAt"
        FROM "ProductImportSession"
        WHERE "id" = ${id}
        LIMIT 1
      `,
    );

    return rows[0] ? this.deserializePersistedImportSession(rows[0]) : undefined;
  }

  private async loadPersistedImportSessionByJobId(jobId: string) {
    const rows = await this.prisma.$queryRaw<PersistedImportSessionRow[]>(
      Prisma.sql`
        SELECT
          "id",
          "jobId",
          "companyId",
          "shopId",
          "branchCode",
          "branchName",
          "stocktakingId",
          "name",
          "mode",
          "status",
          "fields",
          "rows",
          "items",
          "onMatchPolicy",
          "dryRunSummary",
          "result",
          "createdAt",
          "updatedAt"
        FROM "ProductImportSession"
        WHERE "jobId" = ${jobId}
        LIMIT 1
      `,
    );

    return rows[0] ? this.deserializePersistedImportSession(rows[0]) : undefined;
  }

  private async listPersistedImportSessions(offset: number, limit: number) {
    const rows = await this.prisma.$queryRaw<PersistedImportSessionRow[]>(
      Prisma.sql`
        SELECT
          "id",
          "jobId",
          "companyId",
          "shopId",
          "branchCode",
          "branchName",
          "stocktakingId",
          "name",
          "mode",
          "status",
          "fields",
          "rows",
          "items",
          "onMatchPolicy",
          "dryRunSummary",
          "result",
          "createdAt",
          "updatedAt"
        FROM "ProductImportSession"
        ORDER BY "createdAt" DESC
        OFFSET ${offset}
        LIMIT ${limit}
      `,
    );

    return rows.map((row) => this.deserializePersistedImportSession(row));
  }

  private async countPersistedImportSessions() {
    const rows = await this.prisma.$queryRaw<Array<{ count: bigint | number }>>(
      Prisma.sql`
        SELECT COUNT(*)::bigint AS "count"
        FROM "ProductImportSession"
      `,
    );

    const count = rows[0]?.count ?? 0;
    return typeof count === 'bigint' ? Number(count) : count;
  }

  private deserializePersistedImportSession(
    row: PersistedImportSessionRow,
  ): ImportSession {
    return {
      id: row.id,
      jobId: row.jobId,
      companyId: row.companyId,
      shopId: row.shopId,
      branchCode: row.branchCode,
      branchName: row.branchName ?? undefined,
      stocktakingId: row.stocktakingId ?? undefined,
      name: row.name,
      mode: row.mode,
      status: row.status,
      fields: this.toImportFieldsArray(row.fields),
      rows: this.toImportRowsArray(row.rows),
      items: this.toPreparedImportItemsArray(row.items),
      onMatchPolicy: this.toImportOnMatchPolicy(row.onMatchPolicy),
      dryRunSummary: this.toImportDryRunSummary(row.dryRunSummary),
      result: this.toImportCommitResult(row.result),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private asJsonb(value: unknown) {
    if (value === undefined) {
      return Prisma.sql`NULL::jsonb`;
    }

    return Prisma.sql`CAST(${JSON.stringify(value)} AS jsonb)`;
  }

  private resolveStocktakingSession(id: string) {
    return STOCKTAKING_SESSIONS.get(id);
  }

  private createStocktakingLogEntry(actionCode: string): StocktakingLogEntry {
    return {
      id: randomUUID(),
      action_code: actionCode,
      created_at: new Date().toISOString(),
    };
  }

  private async ensureImportPreviewItems(session: ImportSession) {
    if (session.items.length > 0) {
      return session.items;
    }

    session.items = await this.prepareImportItems(
      session.id,
      session.companyId,
      session.rows,
      session.branchCode,
      session.companyId,
    );
    session.dryRunSummary = this.buildImportDryRunSummary(session.items);
    session.updatedAt = this.formatDateTime(new Date());
    await this.persistImportSession(session);

    return session.items;
  }

  private toImportFieldsArray(value: unknown): ImportSession['fields'] {
    return Array.isArray(value)
      ? (value as ImportSession['fields'])
      : [];
  }

  private toImportRowsArray(value: unknown): ImportRowInput[] {
    return Array.isArray(value) ? (value as ImportRowInput[]) : [];
  }

  private toPreparedImportItemsArray(value: unknown): PreparedImportItem[] {
    return Array.isArray(value) ? (value as PreparedImportItem[]) : [];
  }

  private toImportOnMatchPolicy(value: unknown): ImportOnMatchPolicy {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return this.defaultImportOnMatchPolicy();
    }

    return value as ImportOnMatchPolicy;
  }

  private toImportDryRunSummary(value: unknown) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return undefined;
    }

    return value as ImportDryRunSummary;
  }

  private toImportCommitResult(value: unknown): ImportSession['result'] {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return undefined;
    }

    return value as ImportSession['result'];
  }

  private parseImportMode(value: unknown): 'with_check' | 'without_check' {
    return value === 'without_check' ? 'without_check' : 'with_check';
  }

  private normalizeImportFieldValue(value?: string | null) {
    return value?.trim().toLocaleLowerCase() ?? '';
  }

  private buildImportDuplicateCounts(rows: ImportRowInput[]) {
    const skuCounts = new Map<string, number>();
    const barcodeCounts = new Map<string, number>();

    for (const row of rows) {
      const sku = this.normalizeImportFieldValue(row.sku);
      const barcode = this.normalizeImportFieldValue(row.barcode);

      if (sku) {
        skuCounts.set(sku, (skuCounts.get(sku) ?? 0) + 1);
      }

      if (barcode) {
        barcodeCounts.set(barcode, (barcodeCounts.get(barcode) ?? 0) + 1);
      }
    }

    return {
      skuCounts,
      barcodeCounts,
    };
  }

  private buildImportValidationIssues(
    row: ImportRowInput,
    options?: {
      skuCounts?: Map<string, number>;
      barcodeCounts?: Map<string, number>;
      matchError?: string | null;
    },
  ): ImportValidationIssue[] {
    const issues: ImportValidationIssue[] = [];
    const sku = this.normalizeImportFieldValue(row.sku);
    const barcode = this.normalizeImportFieldValue(row.barcode);

    if (row.quantity <= 0) {
      issues.push({
        code: 'invalid_quantity',
        field: 'quantity',
        message: 'quantity must be greater than 0',
      });
    }

    if (row.supplyPrice <= 0) {
      issues.push({
        code: 'missing_supply_price',
        field: 'supply_price',
        message: 'supply_price must be greater than 0',
      });
    }

    if (row.retailPrice <= 0) {
      issues.push({
        code: 'missing_retail_price',
        field: 'retail_price',
        message: 'retail_price must be greater than 0',
      });
    }

    if (row.retailPrice < row.supplyPrice) {
      issues.push({
        code: 'retail_below_supply',
        field: 'retail_price',
        message: 'retail_price cannot be lower than supply_price',
      });
    }

    if (!row.name && !sku && !barcode) {
      issues.push({
        code: 'missing_identifier',
        message: 'row must contain at least one identifier',
      });
    }

    if (sku && (options?.skuCounts?.get(sku) ?? 0) > 1) {
      issues.push({
        code: 'duplicate_sku',
        field: 'sku',
        message: `sku "${row.sku}" is duplicated in the import file`,
      });
    }

    if (barcode && (options?.barcodeCounts?.get(barcode) ?? 0) > 1) {
      issues.push({
        code: 'duplicate_barcode',
        field: 'barcode',
        message: `barcode "${row.barcode}" is duplicated in the import file`,
      });
    }

    if (options?.matchError) {
      issues.push({
        code: 'match_error',
        message: options.matchError,
      });
    }

    return issues;
  }

  private buildImportCommitValidationError(session: ImportSession) {
    const invalidItems = session.items
      .filter((item) => item.validation_issues.length > 0)
      .map((item) => ({
        row: item.row_number,
        sku: item.product_sku,
        barcode: item.product_barcode,
        issues: item.validation_issues,
      }));

    return {
      message: 'Import contains validation errors',
      import_id: session.id,
      error_count: invalidItems.length,
      errors: invalidItems,
    };
  }

  private resolveProductCurrentSupplierName(
    product: CatalogProductWithRelations,
  ) {
    return product.suppliers[0]?.supplier?.name?.trim() ?? '';
  }

  private resolveProductCurrentDescription(
    product: CatalogProductWithRelations,
  ) {
    return this.resolveDescriptionFromMetadata(product.metadata).trim();
  }

  private defaultImportOnMatchPolicy(): ImportOnMatchPolicy {
    return {
      name: 'keep_store',
      brand: 'keep_store',
      category: 'keep_store',
      description: 'keep_store',
      measurementUnit: 'keep_store',
      supplier: 'keep_store',
      supplyPrice: 'keep_store',
      retailPrice: 'keep_store',
    };
  }

  private parseImportFieldResolution(
    value: unknown,
    fieldName: string,
    strict = false,
  ): ImportFieldResolution {
    if (value === undefined || value === null || value === '') {
      return 'keep_store';
    }

    if (value === 'from_file' || value === 'keep_store') {
      return value;
    }

    if (strict) {
      throw new BadRequestException(
        `on_match.${fieldName} must be either "keep_store" or "from_file"`,
      );
    }

    return 'keep_store';
  }

  private extractImportOnMatchPolicy(
    body: Record<string, unknown>,
    useDefault = true,
    strict = true,
  ): ImportOnMatchPolicy | undefined {
    const rawValue = body.on_match;
    if (!rawValue || typeof rawValue !== 'object' || Array.isArray(rawValue)) {
      return useDefault ? this.defaultImportOnMatchPolicy() : undefined;
    }

    const policy = rawValue as Record<string, unknown>;
    const allowedKeys = new Set([
      'name',
      'brand',
      'category',
      'description',
      'measurement_unit',
      'measurementUnit',
      'supplier',
      'supply_price',
      'supplyPrice',
      'retail_price',
      'retailPrice',
    ]);

    for (const key of Object.keys(policy)) {
      if (!allowedKeys.has(key) && strict) {
        throw new BadRequestException(`on_match.${key} is not supported`);
      }
    }

    return {
      name: this.parseImportFieldResolution(policy.name, 'name', strict),
      brand: this.parseImportFieldResolution(policy.brand, 'brand', strict),
      category: this.parseImportFieldResolution(
        policy.category,
        'category',
        strict,
      ),
      description: this.parseImportFieldResolution(
        policy.description,
        'description',
        strict,
      ),
      measurementUnit: this.parseImportFieldResolution(
        policy.measurement_unit ?? policy.measurementUnit,
        'measurement_unit',
        strict,
      ),
      supplier: this.parseImportFieldResolution(
        policy.supplier,
        'supplier',
        strict,
      ),
      supplyPrice: this.parseImportFieldResolution(
        policy.supply_price ?? policy.supplyPrice,
        'supply_price',
        strict,
      ),
      retailPrice: this.parseImportFieldResolution(
        policy.retail_price ?? policy.retailPrice,
        'retail_price',
        strict,
      ),
    };
  }

  private shouldUseFileValue(value: ImportFieldResolution) {
    return value === 'from_file';
  }

  private buildImportDryRunSummary(
    items: PreparedImportItem[],
  ): ImportDryRunSummary {
    const summary: ImportDryRunSummary = {
      create_count: 0,
      update_count: 0,
      error_count: 0,
      blocking_error_count: 0,
      conflicted_count: 0,
      conflict_fields: {},
    };

    for (const item of items) {
      if (item.action === 'create') {
        summary.create_count += 1;
      } else if (item.action === 'update') {
        summary.update_count += 1;
      } else {
        summary.error_count += 1;
      }

      if (item.validation_issues.length > 0) {
        summary.blocking_error_count += 1;
      }

      if (item.different_fields.length > 0) {
        summary.conflicted_count += 1;
      }

      for (const field of item.different_fields) {
        summary.conflict_fields[field] =
          (summary.conflict_fields[field] ?? 0) + 1;
      }
    }

    return summary;
  }

  private toImportSessionSummary(session: ImportSession) {
    const shopName =
      session.branchName ??
      this.resolveShopByBranchCode(session.branchCode).shop_name;

    return {
      id: session.id,
      import_id: session.id,
      job_id: session.jobId,
      name: session.name,
      mode: session.mode,
      status: session.status,
      company_id: session.companyId,
      shop_id: session.shopId,
      branch_code: session.branchCode,
      branch_name: shopName,
      stocktaking_id: session.stocktakingId ?? '',
      created_at: session.createdAt,
      updated_at: session.updatedAt,
      rows_count: session.rows.length,
      on_match: session.onMatchPolicy,
      dry_run_summary: session.dryRunSummary ?? null,
      result: session.result ?? null,
    };
  }

  private toLegacyImportListItem(
    session: ImportSession,
    index: number,
    context?: {
      userId?: number;
      fullName?: string;
    } | null,
  ) {
    const shop = this.resolveShopByBranchCode(session.branchCode);
    const totals = this.buildLegacyImportTotals(session);
    const actor = this.resolveLegacyImportActor(session, context);
    const finishedActor =
      session.status === 'completed' ? actor : { id: '', name: '' };
    const processJob = session.jobId
      ? IMPORT_JOBS.get(session.jobId)
      : undefined;
    const processPercentage =
      processJob?.percent ??
      (session.status === 'completed'
        ? 100
        : session.status === 'preview_ready'
          ? 100
          : session.status === 'importing'
            ? 50
            : 0);
    const legacyNumericId = this.buildLegacyImportNumericId(session, index);

    return {
      id: session.id,
      external_id: String(1000000 + legacyNumericId),
      company_id: session.companyId ?? '',
      name: session.name,
      shop_id: shop.shop_id,
      shop_name: shop.shop_name,
      import_type_id:
        session.mode === 'without_check'
          ? IMPORT_TYPE_WITHOUT_CHECK_ID
          : IMPORT_TYPE_WITH_CHECK_ID,
      import_status_id:
        session.status === 'completed'
          ? IMPORT_STATUS_COMPLETED_ID
          : IMPORT_STATUS_IN_PROGRESS_ID,
      total_loaded_measurement_value: totals.totalLoadedMeasurementValue,
      total_arrived_measurement_value: totals.totalArrivedMeasurementValue,
      total_sold_measurement_value: 0,
      total_supply_price: totals.totalSupplyPrice,
      total_retail_price: totals.totalRetailPrice,
      import_items: null,
      suppliers: null,
      comment: '',
      created_at: session.createdAt,
      created_by: actor,
      finished_at: session.result?.committed_at ?? session.updatedAt,
      finished_by: finishedActor,
      session_id: '',
      process_percentage: processPercentage,
      total_processed_measurement_value: 0,
      stocktaking_id: session.stocktakingId ?? '',
      process_id: session.jobId,
      int_id: 12000000 + legacyNumericId,
    };
  }

  private buildLegacyImportTotals(session: ImportSession) {
    const sourceRows = session.items.length
      ? session.items.map((item) => ({
          quantity: item.measurement_value,
          supplyPrice: item.supply_price,
          retailPrice: item.retail_price,
        }))
      : session.rows.map((row) => ({
          quantity: row.quantity,
          supplyPrice: row.supplyPrice,
          retailPrice: row.retailPrice,
        }));

    const totalLoadedMeasurementValue = sourceRows.reduce(
      (sum, row) => sum + row.quantity,
      0,
    );

    return {
      totalLoadedMeasurementValue,
      totalArrivedMeasurementValue: totalLoadedMeasurementValue,
      totalSupplyPrice: sourceRows.reduce(
        (sum, row) => sum + row.quantity * row.supplyPrice,
        0,
      ),
      totalRetailPrice: sourceRows.reduce(
        (sum, row) => sum + row.quantity * row.retailPrice,
        0,
      ),
    };
  }

  private resolveLegacyImportActor(
    session: ImportSession,
    context?: {
      userId?: number;
      fullName?: string;
    } | null,
  ): LegacyImportActor {
    const committedBy = session.result?.committed_by;
    if (committedBy) {
      return {
        id: String(committedBy.user_id),
        name: committedBy.full_name,
      };
    }

    if (context?.userId && context.fullName) {
      return {
        id: String(context.userId),
        name: context.fullName,
      };
    }

    return DEFAULT_IMPORT_ACTOR;
  }

  private buildLegacyImportNumericId(session: ImportSession, index: number) {
    const seed = `${session.id}:${session.createdAt}:${index}`;
    let hash = 0;

    for (let cursor = 0; cursor < seed.length; cursor += 1) {
      hash = (hash * 31 + seed.charCodeAt(cursor)) % 100000;
    }

    return hash;
  }

  private toStocktakingCreatedItemResponse(item: StocktakingItem) {
    return {
      excluded_after_archive: false,
      expected_measurement_value: item.expected_measurement_value,
      id: item.id,
      is_added: false,
      last_scan_num: 0,
      measurement_unit: {
        company_id: '',
        id: '',
        is_default: false,
        is_editable: false,
        name: '',
        precision: '',
        short_name: '',
      },
      min_movement_date: '',
      min_movement_date_num: 0,
      postponed_measurement_value: 0,
      product_archived: false,
      product_attributes: '',
      product_barcode: item.product_barcode,
      product_base_name: '',
      product_id: item.product_id,
      product_name: item.product_name,
      product_sku: item.product_sku,
      retail_price: item.retail_price,
      scanned_measurement_value: 0,
      stocktaking_id: '',
      supply_price: item.supply_price,
      to_import: 0,
      to_write_off: 0,
      total_active_measurement_value: 0,
      total_imported_measurement_value: 0,
      total_in_transfer_measurement_value: 0,
      total_inactive_measurement_value: 0,
      total_measurement_value: 0,
      total_sold_measurement_value: 0,
      total_transfer_arrived_measurement_value: 0,
      total_transfered_measurement_value: 0,
      total_written_off_measurement_value: 0,
      type: '',
    };
  }

  private toStocktakingListItemResponse(
    stocktaking: StocktakingSession,
    item: StocktakingItem,
  ) {
    return {
      id: item.id,
      stocktaking_id: stocktaking.id,
      product_id: item.product_id,
      product_barcode: item.product_barcode,
      product_sku: item.product_sku,
      product_name: item.product_name,
      expected_measurement_value: item.expected_measurement_value,
      scanned_measurement_value: item.scanned_measurement_value,
      supply_price: stocktaking.useOldPrices ? 0 : item.supply_price,
      retail_price: item.retail_price,
      measurement_unit: item.measurement_unit,
      type: item.scanned_measurement_value > 0 ? 'ok' : '',
      updated_at_int: item.last_scan_num,
      updated_at: item.last_scan_num
        ? this.formatDateTime(new Date(item.last_scan_num * 1000), stocktaking.companyId)
        : '',
    };
  }

  private toStocktakingLogResponse(
    stocktaking: StocktakingSession,
    entry: StocktakingLogEntry,
  ) {
    const actionName =
      entry.action_code === 'user_enter_stocktaking'
        ? 'User enter stocktaking'
        : 'Exit stocktaking';
    return {
      id: entry.id,
      stocktaking_id: stocktaking.id,
      company_id: stocktaking.companyId,
      action_name: {
        en: actionName,
      },
      product_id: '',
      product_name: '',
      product_barcode: '',
      product_sku: '',
      user: {
        id: stocktaking.createdBy.id,
        external_id: 0,
        company_id: stocktaking.companyId,
        phone_number: '',
        first_name: stocktaking.createdBy.name.split(' ')[0] ?? '',
        last_name: stocktaking.createdBy.name.split(' ').slice(1).join(' '),
        image: '',
        image_url: '',
      },
      quantity: 0,
      action_code: entry.action_code,
      created_at: entry.created_at,
    };
  }

  private toStocktakingSessionResponse(stocktaking: StocktakingSession) {
    const totalMeasurementValue = stocktaking.items.reduce(
      (sum, item) => sum + item.expected_measurement_value,
      0,
    );
    const totalScannedMeasurementValue = stocktaking.items.reduce(
      (sum, item) => sum + item.scanned_measurement_value,
      0,
    );
    const shortageSupply = stocktaking.items.reduce((sum, item) => {
      const missing = Math.max(
        0,
        item.expected_measurement_value - item.scanned_measurement_value,
      );
      return sum + missing * item.supply_price;
    }, 0);

    return {
      company_id: stocktaking.companyId,
      created_at: stocktaking.createdAt,
      created_by: {
        id: '',
        name: '',
      },
      deleted: false,
      difference_sum: 0,
      external_id: 1000000,
      finished_at: '',
      finished_by: {
        id: '',
        name: '',
      },
      id: stocktaking.id,
      import_id: stocktaking.importId,
      items: null,
      locked: false,
      name: stocktaking.name,
      new_products: 0,
      order_id: '',
      postponed: 0,
      postponed_sum_retail: 0,
      postponed_sum_supply: 0,
      process_id: '',
      process_percentage: 100,
      process_type: 0,
      shop_id: stocktaking.shopId,
      shop_name: this.resolveShopByBranchCode(
        this.resolveBranchCodeByShopId(stocktaking.shopId),
      ).shop_name,
      shortage: 0,
      shortage_sum_retail: 0,
      shortage_sum_supply: shortageSupply,
      status_id: '7cbb2295-559e-4b72-a3c1-11ac24dffc6b',
      surplus: 0,
      surplus_sum_retail: 0,
      surplus_sum_supply: 0,
      total: stocktaking.items.length,
      total_import_accepted_rows: 0,
      total_measurement_value: totalMeasurementValue,
      total_resort_rows: 0,
      total_scanned_measurement_value: totalScannedMeasurementValue,
      total_scanned_rows: stocktaking.items.filter(
        (item) => item.scanned_measurement_value > 0,
      ).length,
      total_transfer_accepted_rows: 0,
      total_undeclared_rows: 0,
      transfer_id: '',
      type: 'IMPORT',
      type_id: '',
      use_departure_price: false,
      use_import_properties: stocktaking.useImportProperties,
      use_old_prices: stocktaking.useOldPrices,
    };
  }

  private resolveImportCompanyId(
    body: Record<string, unknown>,
    context?: {
      userType?: string;
      companyId?: string | null;
    } | null,
  ) {
    if (context?.userType === 'company') {
      if (!context.companyId) {
        throw new UnauthorizedException('Company user is missing company');
      }

      return context.companyId;
    }

    const requestedCompanyId =
      this.optionalString(body.company_id) ??
      this.optionalString(
        (body.metadata as Record<string, unknown> | undefined)?.company_id,
      ) ??
      context?.companyId;

    if (!requestedCompanyId) {
      throw new BadRequestException(
        'company_id is required for import requests made by platform users',
      );
    }

    return requestedCompanyId;
  }

  async findAll(
    { page, limit, search }: FindProductsArgs,
    authorization?: string,
  ) {
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
      products.flatMap((product) =>
        product.stocks.map((stock) => stock.branchCode),
      ),
    );

    return {
      count,
      total: 0,
      products: products.map((product) =>
        this.toProductResponseV2(product, shopLookup),
      ),
    };
  }

  async findAllV2Extended(
    {
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
      wholesalePriceFrom,
      wholesalePriceTo,
      wholesalePrice,
      freePrice,
      brandIds,
      supplierIds,
      order,
    }: FindProductsArgs,
    authorization?: string,
  ) {
    const context = await this.getRequestContext(authorization);
    const safePage = Math.max(1, page);
    const safeLimit = Math.min(Math.max(1, limit), 1000);
    const resolvedShopBranchCodes = await this.resolveBranchCodesForFilter(
      shopIds,
      context,
    );
    const where = this.applyProductScope(
      this.buildProductWhere(
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
        wholesalePriceFrom,
        wholesalePriceTo,
        wholesalePrice,
        freePrice,
      ),
      context,
    );
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
      products.flatMap((product) =>
        product.stocks.map((stock) => stock.branchCode),
      ),
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
          companyId: true,
          unit: true,
          quantity: true,
          metadata: true,
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

  async getCatalogStatistics(
    {
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
      wholesalePriceFrom,
      wholesalePriceTo,
      wholesalePrice,
      freePrice,
    }: Omit<FindProductsArgs, 'page' | 'limit' | 'statistics' | 'order'>,
    authorization?: string,
  ) {
    const context = await this.getRequestContext(authorization);
    const resolvedShopBranchCodes = await this.resolveBranchCodesForFilter(
      shopIds,
      context,
    );
    const where = this.applyProductScope(
      this.buildProductWhere(
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
        wholesalePriceFrom,
        wholesalePriceTo,
        wholesalePrice,
        freePrice,
      ),
      context,
    );

    const productsForStatistics = await this.prisma.product.findMany({
      where,
      select: {
        id: true,
        companyId: true,
        unit: true,
        quantity: true,
        metadata: true,
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
    const productCompanyId = this.resolveProductCompanyId(body, context);
    const name = this.requireString(body.name, 'name');
    const sku = this.optionalString(body.sku);
    const barcode = this.optionalString(body.barcode);
    const photo = this.normalizeProductPhotoValue(this.optionalString(body.photo));
    const productType = this.optionalString(body.product_type);
    const variantType = this.optionalString(body.variant_type);
    const unit = this.optionalString(body.unit);
    const purchasePrice = this.toNumber(body.purchase_price);
    const markupPercent = this.toNumber(body.markup_percent);
    const salePrice = this.toNumber(body.sale_price);
    const quantity = this.toNumber(body.quantity) ?? 0;
    const metadataInput = this.toJsonFieldValue(body.metadata);
    const stocks = Array.isArray(body.stocks)
      ? this.filterStockPayloadByContext(body.stocks, context)
      : [];
    const supplierIds = Array.isArray(body.supplier_ids)
      ? body.supplier_ids
      : [];

    const metadataObject =
      body.metadata &&
      typeof body.metadata === 'object' &&
      !Array.isArray(body.metadata)
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
        sum + (this.toNumber((stock as Record<string, unknown>).quantity) ?? 0)
      );
    }, 0);

    const createdProduct = await this.prisma.product.create({
      data: {
        company: {
          connect: {
            id: productCompanyId,
          },
        },
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
                where: {
                  companyId_name: {
                    companyId: productCompanyId,
                    name: categoryName,
                  },
                },
                create: {
                  company: {
                    connect: {
                      id: productCompanyId,
                    },
                  },
                  name: categoryName,
                },
              },
            }
          : undefined,
        brand: brandName
          ? {
              connectOrCreate: {
                where: {
                  companyId_name: {
                    companyId: productCompanyId,
                    name: brandName,
                  },
                },
                create: {
                  company: {
                    connect: {
                      id: productCompanyId,
                    },
                  },
                  name: brandName,
                },
              },
            }
          : undefined,
        suppliers: supplierNames.size
          ? {
              create: [...supplierNames].map((supplierName) => ({
                supplier: {
                  connectOrCreate: {
                    where: {
                      companyId_name: {
                        companyId: productCompanyId,
                        name: supplierName,
                      },
                    },
                    create: {
                      company: {
                        connect: {
                          id: productCompanyId,
                        },
                      },
                      name: supplierName,
                    },
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
                  quantity: this.toNumber(stock.quantity) ?? 0,
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
    const productCompanyId = this.resolveProductCompanyId(body, writeContext);
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
    const scopedSupplierIds = await this.resolveSupplierIdsForCompany(
      supplierIdNumbers,
      productCompanyId,
    );
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

    const measurementUnit =
      this.isGoodsProductType(productType) || isServiceProduct
        ? await this.resolveMeasurementUnitSnapshot(
            measurementUnitId!,
            productCompanyId,
          )
        : null;
    const unit = this.resolveMeasurementTypeValue(
      this.optionalString(body.measurement_type),
      measurementUnit?.short_name,
    );

    const createdProduct = await this.prisma.product.create({
      data: {
        company: {
          connect: {
            id: productCompanyId,
          },
        },
        name,
        sku,
        barcode,
        photo: this.normalizeProductPhotoValue(imageUrl),
        productType,
        variantType,
        unit,
        purchasePrice,
        markupPercent,
        salePrice,
        quantity: totalQuantity,
        metadata: this.buildCatalogMetadata(
          body,
          description,
          {
            isVariative,
            selectedAttributes,
            variants,
          },
          measurementUnit,
          writeContext,
        ),
        brand: brandName
          ? {
              connectOrCreate: {
                where: {
                  companyId_name: {
                    companyId: productCompanyId,
                    name: brandName,
                  },
                },
                create: {
                  company: {
                    connect: {
                      id: productCompanyId,
                    },
                  },
                  name: brandName,
                },
              },
            }
          : undefined,
        suppliers: scopedSupplierIds.length
          ? {
              create: scopedSupplierIds.map((supplierId) => ({
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

  async getProductById(id: string, authorization?: string) {
    const context = await this.getRequestContext(authorization);
    const product = await this.prisma.product.findFirst({
      where: this.applyProductScope(
        this.buildProductIdentifierWhere(id),
        context,
      ),
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

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    const visibleStocks = this.filterStocksByBranchCodes(
      product.stocks,
      context?.allowedBranchCodes,
    );
    const salesSummary = await this.buildProductSalesSummary(
      product.id,
      context,
    );
    const shopLookup = await this.buildShopLookupByBranchCodes(
      [
        ...visibleStocks.map((stock) => stock.branchCode),
        ...salesSummary.soldByBranchCode.keys(),
      ],
      product.companyId ?? context?.companyId,
    );

    return this.toProductDetailResponse(
      {
        ...product,
        stocks: visibleStocks,
      },
      shopLookup,
      salesSummary,
      context,
    );
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
    const existingProduct = await this.prisma.product.findFirst({
      where: this.applyProductScope(
        {
          id: productId,
        },
        writeContext,
      ),
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

    const measurementUnit = measurementUnitId
      ? await this.resolveMeasurementUnitSnapshot(
          measurementUnitId,
          existingProduct.companyId ?? writeContext.companyId,
        )
      : null;

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
    const scopedSupplierIds = await this.resolveSupplierIdsForCompany(
      supplierIdNumbers,
      writeContext.companyId ?? null,
    );
    const description = this.optionalString(body.description);

    const updatedProduct = await this.prisma.product.update({
      where: { id: productId },
      data: {
        name: this.optionalString(body.name) ?? existingProduct.name,
        sku: this.optionalString(body.sku) ?? existingProduct.sku,
        barcode: this.optionalString(body.barcode) ?? existingProduct.barcode,
        photo:
          this.normalizeProductPhotoValue(this.extractFirstImage(body.images)) ??
          this.normalizeProductPhotoValue(existingProduct.photo),
        productType,
        variantType: isVariative ? 'variative' : 'simple',
        unit:
          this.resolveMeasurementTypeValue(
            this.optionalString(body.measurement_type) ?? existingProduct.unit,
            measurementUnit?.short_name ??
              this.optionalString(
                (existingProduct.metadata as Record<string, unknown> | null)
                  ?.measurement_unit_short_name,
              ),
          ),
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
        metadata: this.buildCatalogMetadata(
          body,
          description,
          {
            isVariative,
            selectedAttributes,
            variants,
          },
          measurementUnit,
          writeContext,
          (existingProduct.metadata as Record<string, unknown> | null) ?? null,
        ),
        suppliers:
          body.supplier_ids !== undefined
            ? {
                deleteMany: {},
                ...(scopedSupplierIds.length
                  ? {
                      create: scopedSupplierIds.map((supplierId) => ({
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

  async bulkArchiveProducts(
    body: Record<string, unknown>,
    authorization?: string,
  ) {
    const context = await this.getRequestContext(authorization);
    const writeContext = this.requireCatalogWriteContext(context);
    const productIdentifiers = this.toStringArrayValue(body.product_ids);

    if (!productIdentifiers.length) {
      throw new BadRequestException('product_ids must contain at least one id');
    }

    const products = await this.prisma.product.findMany({
      where: this.applyProductScope(
        this.buildBulkProductIdentifierWhere(productIdentifiers),
        writeContext,
      ),
      select: {
        id: true,
        publicId: true,
        archivedAt: true,
      },
    });

    if (!products.length) {
      throw new NotFoundException('Products not found');
    }

    const productsToArchive = products.filter((product) => !product.archivedAt);
    const archivedAt = new Date();

    if (productsToArchive.length) {
      await this.prisma.product.updateMany({
        where: {
          id: {
            in: productsToArchive.map((product) => product.id),
          },
        },
        data: {
          archivedAt,
          archivedByUserId: writeContext.userId,
          archivedByName: writeContext.fullName,
        },
      });
    }

    return {
      count: productsToArchive.length,
      product_ids: products.map((product) => product.publicId),
      archived_at: this.companySettingsService.toIsoForCompany(
        archivedAt,
        writeContext.companyId ?? undefined,
      ),
      archived_by: {
        id: String(writeContext.userId),
        name: writeContext.fullName,
      },
    };
  }

  async generateSku(body: Record<string, unknown>, authorization?: string) {
    const context = await this.getRequestContext(authorization);
    const companyId = this.resolveProductCompanyId(body, context);
    const requestedPrefix = this.optionalString(body.prefix);
    const name = this.optionalString(body.name);
    const prefix = this.normalizeSkuPrefix(
      requestedPrefix ?? this.buildSkuPrefix(name),
    );
    const nextSkuNumber = await this.getNextSkuNumber(companyId, prefix);
    const maxSkuNumber = 10 ** SKU_NUMBER_LENGTH - 1;

    for (
      let skuNumber = nextSkuNumber;
      skuNumber <= maxSkuNumber;
      skuNumber += 1
    ) {
      const candidate = this.formatSku(prefix, skuNumber);
      const existing = await this.prisma.product.findFirst({
        where: {
          companyId,
          sku: candidate,
        },
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

  async getProductMovement(
    id: string,
    query: {
      limit: number;
      page: number;
      fromCreatedAt?: string;
      toCreatedAt?: string;
      movementType?: string;
      shopId?: string;
    },
    authorization?: string,
  ) {
    const context = await this.getRequestContext(authorization);
    const product = await this.prisma.product.findFirst({
      where: this.applyProductScope(
        this.buildProductIdentifierWhere(id),
        context,
      ),
      include: {
        stocks: true,
      },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    const visibleStocks = this.filterStocksByBranchCodes(
      product.stocks,
      context?.allowedBranchCodes,
    );
    const safeLimit = Math.max(1, Math.trunc(query.limit || 10));
    const safePage = Math.max(1, Math.trunc(query.page || 1));
    const movementWhere = await this.buildProductMovementWhere(
      product.id,
      query,
      context,
    );
    const [count, stockMovements] = await this.prisma.$transaction([
      this.prisma.stockMovement.count({
        where: movementWhere,
      }),
      this.prisma.stockMovement.findMany({
        where: movementWhere,
        include: {
          shop: {
            select: {
              id: true,
              name: true,
              branchCode: true,
            },
          },
          createdBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
          order: {
            select: {
              id: true,
              orderNumber: true,
              orderType: true,
              status: true,
              createdAt: true,
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
    const movementStats = await this.prisma.stockMovement.findMany({
      where: movementWhere,
      select: {
        type: true,
        quantity: true,
      },
    });
    const supplyPriceHistory = await this.prisma.productSupplyPriceHistory.findMany({
      where: {
        productId: product.id,
        ...(context?.userType === 'company' && context.allowedShopIds?.length
          ? {
              shopId: {
                in: context.allowedShopIds,
              },
            }
          : {}),
      },
      include: {
        shop: {
          select: {
            id: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
    const acceptedOrderAggregate = await this.prisma.orderItem.aggregate({
      where: {
        productId: product.id,
        order: {
          status: {
            in: ['DRAFT', 'PARKED'],
          },
          orderType: 'SALE',
          ...(context?.companyId ? { companyId: context.companyId } : {}),
          ...(context?.userType === 'company' && context.allowedShopIds?.length
            ? {
                shopId: {
                  in: context.allowedShopIds,
                },
              }
            : {}),
        },
      },
      _sum: {
        quantity: true,
      },
    });
    const pagedMovements = stockMovements.map((movement) =>
      this.toLegacyProductMovementItem(movement),
    );
    const stats = this.buildProductMovementStats(movementStats);

    return {
      total_measurement_value: visibleStocks.reduce(
        (sum, stock) => sum + stock.quantity,
        0,
      ),
      imported: stats.imported,
      sold: stats.sold,
      transfer_arrived: stats.transferArrived,
      transfer_returned: 0,
      transfered: stats.transferred,
      written_off: stats.writtenOff,
      count,
      movements: pagedMovements,
      supply_price_history: supplyPriceHistory.map((item) => ({
        product_id: product.publicId,
        shop_id: item.shop.id,
        supply_price: Number(item.supplyPrice ?? 0),
        supply_currency: item.supplyCurrency,
        old_supply_price: Number(item.oldSupplyPrice ?? 0),
        created_at: this.companySettingsService.toIsoForCompany(
          item.createdAt,
          context?.companyId ?? undefined,
        ),
      })),
      accepted_order: Number(acceptedOrderAggregate._sum.quantity ?? 0),
    };
  }

  async generateBarcode(
    body: Record<string, unknown> = {},
    authorization?: string,
  ) {
    const context = await this.getRequestContext(authorization);
    const companyId = this.resolveProductCompanyId(body, context);
    const latestBarcodeRecords = await this.prisma.product.findMany({
      where: {
        companyId,
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

    const latestPayload = latestBarcodeRecords.reduce<number | null>(
      (maxPayload, record) => {
        const payload = this.extractEan13Payload(record.barcode);
        if (payload === null) {
          return maxPayload;
        }

        return maxPayload === null ? payload : Math.max(maxPayload, payload);
      },
      null,
    );
    let nextPayload =
      latestPayload !== null ? latestPayload + 1 : BARCODE_PAYLOAD_BASE;

    while (nextPayload <= BARCODE_PAYLOAD_MAX) {
      const barcode = this.formatEan13Barcode(nextPayload);
      const existing = await this.prisma.product.findFirst({
        where: {
          companyId,
          barcode,
        },
        select: { id: true },
      });

      if (!existing) {
        return {
          barcode,
        };
      }

      nextPayload += 1;
    }

    throw new BadRequestException('Barcode range exceeded');
  }

  async listTransfers(
    query: TransferListQuery,
    authorization?: string,
  ) {
    const context = await this.getRequestContext(authorization);
    const transferDb = (this.prisma as any).transfer;
    const safeLimit = Math.max(1, Math.trunc(query.limit || 10));
    const safePage = Math.max(1, Math.trunc(query.page || 1));
    const where = this.buildTransferScope(context);

    const [count, transfers] = await this.prisma.$transaction([
      transferDb.count({ where }),
      transferDb.findMany({
        where,
        include: this.transferInclude(),
        orderBy: {
          createdAt: 'desc',
        },
        skip: (safePage - 1) * safeLimit,
        take: safeLimit,
      }),
    ]);

    return {
      count,
      transfer: transfers.map((transfer: any) =>
        this.toTransferListItem(transfer),
      ),
    };
  }

  async getTransferById(id: string, authorization?: string) {
    const context = await this.getRequestContext(authorization);
    const transfer = await this.findTransferOrThrow(id, context);
    const branchCodes = [
      transfer.departureShop?.branchCode,
      transfer.arrivalShop?.branchCode,
    ].filter((value): value is string => Boolean(value));
    const shopLookup = await this.buildShopLookupByBranchCodes(
      branchCodes,
      transfer.companyId,
    );

    return {
      ...this.toTransferListItem(transfer),
      items: transfer.items.map((item: any) =>
        this.toTransferItemResponse(item, transfer, shopLookup, true),
      ),
    };
  }

  async createTransfer(
    body: Record<string, unknown>,
    authorization?: string,
  ) {
    const context = await this.getRequestContext(authorization);
    if (!context?.companyId) {
      throw new UnauthorizedException('Company context is required');
    }
    const companyId = context.companyId;
    const userId = context.userId;
    const currentShopId = context.currentShopId ?? '';

    const departureIdentifier =
      this.optionalString(body.departure_shop_id) ??
      this.optionalString(body.departureShopId) ??
      this.optionalString(body.from_shop_id) ??
      currentShopId ??
      '';
    const arrivalIdentifier =
      this.optionalString(body.arrival_shop_id) ??
      this.optionalString(body.arrivalShopId) ??
      this.optionalString(body.to_shop_id) ??
      '';

    if (!departureIdentifier || !arrivalIdentifier) {
      throw new BadRequestException(
        'departure_shop_id and arrival_shop_id are required',
      );
    }

    const departureBranchCode = await this.resolveBranchCodeForWrite(
      departureIdentifier,
      context,
    );
    const arrivalBranchCode = await this.resolveBranchCodeForWrite(
      arrivalIdentifier,
      context,
    );

    const [departureShop, arrivalShop] = await Promise.all([
      this.prisma.shop.findFirst({
        where: {
          companyId,
          branchCode: departureBranchCode,
        },
      }),
      this.prisma.shop.findFirst({
        where: {
          companyId,
          branchCode: arrivalBranchCode,
        },
      }),
    ]);

    if (!departureShop || !arrivalShop) {
      throw new NotFoundException('Departure or arrival shop was not found');
    }

    if (departureShop.id === arrivalShop.id) {
      throw new BadRequestException(
        'Departure and arrival shops must be different',
      );
    }

    const createdTransfer = await this.prisma.$transaction(async (tx) => {
      const db = tx as any;
      const latestTransfer = await db.transfer.findFirst({
        where: {
          companyId,
        },
        orderBy: {
          externalId: 'desc',
        },
        select: {
          externalId: true,
        },
      });
      const nextExternalId = Number(latestTransfer?.externalId ?? 1000000) + 1;
      const now = new Date();
      const defaultName = `Трансфер ${now.getFullYear()}.${String(
        now.getMonth() + 1,
      ).padStart(2, '0')}.${String(now.getDate()).padStart(2, '0')} ${String(
        now.getHours(),
      ).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

      return db.transfer.create({
        data: {
          externalId: nextExternalId,
          companyId,
          name: this.optionalString(body.name) ?? defaultName,
          departureShopId: departureShop.id,
          arrivalShopId: arrivalShop.id,
          status: 'DRAFT',
          comment: this.optionalString(body.comment) ?? '',
          useDepartureShopPrices: this.toBooleanValue(
            body.use_departure_shop_prices ?? body.useDepartureShopPrices,
          ),
          createdById: userId,
        },
        include: this.transferInclude(),
      });
    });

    return this.toTransferListItem(createdTransfer);
  }

  async getTransferProducts(
    id: string,
    query: TransferProductsQuery,
    authorization?: string,
  ) {
    const context = await this.getRequestContext(authorization);
    const transfer = await this.findTransferOrThrow(id, context);
    const departureBranchCode = transfer.departureShop.branchCode;
    const arrivalBranchCode = transfer.arrivalShop.branchCode;
    const safeLimit = Math.max(1, Math.trunc(query.limit || 20));
    const safePage = Math.max(1, Math.trunc(query.page || 1));
    const transferProductIds = transfer.items.map((item: any) => item.productId);

    const where: Prisma.ProductWhereInput = {
      companyId: transfer.companyId,
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { sku: { contains: query.search, mode: 'insensitive' } },
              { barcode: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(query.productTypeId
        ? {
            productType: query.productTypeId,
          }
        : {}),
      ...(query.status === 'active'
        ? {
            archivedAt: null,
          }
        : {}),
      AND: [
        {
          OR: [
            {
              stocks: {
                some: {
                  branchCode: departureBranchCode,
                  quantity: {
                    gt: 0,
                  },
                },
              },
            },
            ...(transferProductIds.length
              ? [
                  {
                    id: {
                      in: transferProductIds,
                    },
                  },
                ]
              : []),
          ],
        },
      ],
    };

    const productInclude = {
      category: true,
      brand: true,
      suppliers: {
        include: {
          supplier: true,
        },
      },
      stocks: {
        where: {
          branchCode: {
            in: [departureBranchCode, arrivalBranchCode],
          },
        },
      },
    } satisfies Prisma.ProductInclude;

    const [count, products] = await this.prisma.$transaction([
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({
        where,
        include: productInclude,
        orderBy: {
          name: 'asc',
        },
        skip: (safePage - 1) * safeLimit,
        take: safeLimit,
      }),
    ]);

    const shopLookup = await this.buildShopLookupByBranchCodes(
      [departureBranchCode, arrivalBranchCode],
      transfer.companyId,
    );

    return {
      items: products.map((product) => {
        const existingItem = transfer.items.find(
          (item: any) => item.productId === product.id,
        );
        return this.toTransferProductCatalogItem(
          product,
          transfer,
          existingItem,
          shopLookup,
        );
      }),
      count,
      ...this.buildTransferTotals(transfer),
      fields: TRANSFER_FIELDS,
      stocktaking_id: '',
    };
  }

  async getTransferItems(
    id: string,
    query: TransferItemsQuery,
    authorization?: string,
  ) {
    const context = await this.getRequestContext(authorization);
    const transfer = await this.findTransferOrThrow(id, context);
    const safeLimit = Math.max(1, Math.trunc(query.limit || 20));
    const safePage = Math.max(1, Math.trunc(query.page || 1));
    const normalizedSearch = query.search?.trim().toLowerCase();
    const filteredItems = transfer.items.filter((item: any) => {
      if (!normalizedSearch) {
        return true;
      }

      const product = item.product;
      const categoryName = product.category?.name?.toLowerCase() ?? '';
      return (
        product.name.toLowerCase().includes(normalizedSearch) ||
        (product.sku ?? '').toLowerCase().includes(normalizedSearch) ||
        (product.barcode ?? '').toLowerCase().includes(normalizedSearch) ||
        categoryName.includes(normalizedSearch)
      );
    });

    const shopLookup = await this.buildShopLookupByBranchCodes(
      [transfer.departureShop.branchCode, transfer.arrivalShop.branchCode],
      transfer.companyId,
    );
    const pagedItems = filteredItems.slice(
      (safePage - 1) * safeLimit,
      (safePage - 1) * safeLimit + safeLimit,
    );

    return {
      items: pagedItems.map((item: any) =>
        this.toTransferItemResponse(item, transfer, shopLookup, true),
      ),
      count: filteredItems.length,
      ...this.buildTransferTotals(transfer),
      fields: TRANSFER_FIELDS,
      stocktaking_id: '',
    };
  }

  async upsertTransferItem(
    id: string,
    body: Record<string, unknown>,
    authorization?: string,
  ) {
    const context = await this.getRequestContext(authorization);
    const transfer = await this.findTransferOrThrow(id, context);

    if (transfer.status !== 'DRAFT') {
      throw new BadRequestException('Only draft transfers can be changed');
    }

    const productIdentifier =
      this.optionalString(body.product_id) ??
      this.optionalString(body.productId) ??
      '';
    const quantity =
      this.toNumber(
        body.transfer_measurement_value ?? body.quantity ?? body.measurement_value,
      ) ?? 0;

    if (!productIdentifier) {
      throw new BadRequestException('product_id is required');
    }

    const product = await this.prisma.product.findFirst({
      where: {
        ...this.buildProductIdentifierWhere(productIdentifier),
        companyId: transfer.companyId,
      },
      include: {
        stocks: true,
      },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    const departureStock = product.stocks.find(
      (stock) => stock.branchCode === transfer.departureShop.branchCode,
    );
    const existingItem = transfer.items.find(
      (item: any) => item.productId === product.id,
    );
    const availableQuantity = departureStock?.quantity ?? 0;

    if (quantity > 0 && availableQuantity < quantity) {
      throw new BadRequestException(
        'Transfer quantity exceeds stock in departure shop',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      const db = tx as any;

      if (quantity <= 0) {
        if (existingItem) {
          await db.transferItem.delete({
            where: {
              id: existingItem.id,
            },
          });
        }
        return;
      }

      if (existingItem) {
        await db.transferItem.update({
          where: {
            id: existingItem.id,
          },
          data: {
            quantity,
          },
        });
        return;
      }

      await db.transferItem.create({
        data: {
          transferId: transfer.id,
          productId: product.id,
          quantity,
        },
      });
    });

    return this.getTransferItems(
      id,
      {
        page: 1,
        limit: 50,
      },
      authorization,
    );
  }

  async sendTransfer(id: string, authorization?: string) {
    const context = await this.getRequestContext(authorization);
    if (!context) {
      throw new UnauthorizedException('Authentication is required');
    }
    const transfer = await this.findTransferOrThrow(id, context);

    if (transfer.status !== 'DRAFT') {
      throw new BadRequestException('Transfer is already sent');
    }

    if (!transfer.items.length) {
      throw new BadRequestException('Transfer does not contain any items');
    }

    await this.prisma.$transaction(async (tx) => {
      const db = tx as any;

      for (const item of transfer.items) {
        const departureStock = await tx.productStock.findFirst({
          where: {
            productId: item.productId,
            branchCode: transfer.departureShop.branchCode,
          },
        });

        const quantity = Number(item.quantity ?? 0);
        const beforeQuantity = departureStock?.quantity ?? 0;

        if (!departureStock || beforeQuantity < quantity) {
          throw new BadRequestException(
            `Not enough stock for product ${item.product.name}`,
          );
        }

        const afterQuantity = beforeQuantity - quantity;

        await tx.productStock.update({
          where: {
            id: departureStock.id,
          },
          data: {
            quantity: afterQuantity,
          },
        });

        await this.syncProductTotalQuantity(tx, item.productId);
        await this.createStockMovementRecord(tx, {
          companyId: transfer.companyId,
          shopId: transfer.departureShopId,
          productId: item.productId,
          type: 'TRANSFER',
          quantity,
          beforeQuantity,
          afterQuantity,
          createdById: context.userId,
          externalId: String(transfer.externalId ?? ''),
          fromShopId: transfer.departureShopId,
          toShopId: transfer.arrivalShopId,
          supplyPrice:
            departureStock.purchasePrice ?? item.product.purchasePrice ?? 0,
          retailPrice:
            departureStock.salePrice ?? item.product.salePrice ?? 0,
          newRetailPrice:
            departureStock.salePrice ?? item.product.salePrice ?? 0,
          fromRetailPrice:
            departureStock.salePrice ?? item.product.salePrice ?? 0,
          fromSupplyPrice:
            departureStock.purchasePrice ?? item.product.purchasePrice ?? 0,
        });
      }

      await db.transfer.update({
        where: {
          id: transfer.id,
        },
        data: {
          status: 'SENT',
          sentAt: new Date(),
        },
      });
    });

    return this.getTransferById(id, authorization);
  }

  async acceptTransfer(id: string, authorization?: string) {
    const context = await this.getRequestContext(authorization);
    if (!context) {
      throw new UnauthorizedException('Authentication is required');
    }
    const transfer = await this.findTransferOrThrow(id, context);

    if (transfer.status !== 'SENT') {
      throw new BadRequestException('Only sent transfers can be accepted');
    }

    await this.prisma.$transaction(async (tx) => {
      const db = tx as any;

      for (const item of transfer.items) {
        const quantity = Number(item.quantity ?? 0);
        const arrivalStock = await tx.productStock.findFirst({
          where: {
            productId: item.productId,
            branchCode: transfer.arrivalShop.branchCode,
          },
        });
        const beforeQuantity = arrivalStock?.quantity ?? 0;
        const afterQuantity = beforeQuantity + quantity;
        const departureStock = item.product.stocks.find(
          (stock: any) => stock.branchCode === transfer.departureShop.branchCode,
        );
        const supplyPrice =
          arrivalStock?.purchasePrice ??
          departureStock?.purchasePrice ??
          item.product.purchasePrice ??
          0;
        const retailPrice =
          arrivalStock?.salePrice ??
          departureStock?.salePrice ??
          item.product.salePrice ??
          0;

        if (arrivalStock) {
          await tx.productStock.update({
            where: {
              id: arrivalStock.id,
            },
            data: {
              quantity: afterQuantity,
              purchasePrice: supplyPrice,
              salePrice: retailPrice,
            },
          });
        } else {
          await tx.productStock.create({
            data: {
              productId: item.productId,
              branchCode: transfer.arrivalShop.branchCode,
              quantity,
              purchasePrice: supplyPrice,
              salePrice: retailPrice,
            },
          });
        }

        await db.transferItem.update({
          where: {
            id: item.id,
          },
          data: {
            arrivedQuantity: quantity,
          },
        });

        await this.syncProductTotalQuantity(tx, item.productId);
        await this.createStockMovementRecord(tx, {
          companyId: transfer.companyId,
          shopId: transfer.arrivalShopId,
          productId: item.productId,
          type: 'TRANSFER',
          quantity,
          beforeQuantity,
          afterQuantity,
          createdById: context.userId,
          externalId: String(transfer.externalId ?? ''),
          fromShopId: transfer.departureShopId,
          toShopId: transfer.arrivalShopId,
          supplyPrice,
          retailPrice,
          newRetailPrice: retailPrice,
          fromRetailPrice: retailPrice,
          fromSupplyPrice: supplyPrice,
        });
      }

      await db.transfer.update({
        where: {
          id: transfer.id,
        },
        data: {
          status: 'ACCEPTED',
          acceptedAt: new Date(),
          acceptedById: context.userId,
        },
      });
    });

    return this.getTransferById(id, authorization);
  }

  private buildTransferScope(context: any) {
    if (context?.userType === 'company') {
      return {
        companyId: context.companyId,
        ...(context.allowedShopIds?.length
          ? {
              OR: [
                {
                  departureShopId: {
                    in: context.allowedShopIds,
                  },
                },
                {
                  arrivalShopId: {
                    in: context.allowedShopIds,
                  },
                },
              ],
            }
          : {}),
      };
    }

    return context?.companyId ? { companyId: context.companyId } : {};
  }

  private transferInclude() {
    return {
      departureShop: true,
      arrivalShop: true,
      createdBy: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
        },
      },
      acceptedBy: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
        },
      },
      items: {
        include: {
          product: {
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
          },
        },
      },
    };
  }

  private async findTransferOrThrow(id: string, context: any) {
    const transfer = await (this.prisma as any).transfer.findFirst({
      where: {
        id,
        ...this.buildTransferScope(context),
      },
      include: this.transferInclude(),
    });

    if (!transfer) {
      throw new NotFoundException('Transfer not found');
    }

    return transfer;
  }

  private buildTransferTotals(transfer: any) {
    const totalMeasurementValue = transfer.items.reduce(
      (sum: number, item: any) => sum + Number(item.quantity ?? 0),
      0,
    );
    const totalTransferValue = transfer.items.reduce(
      (sum: number, item: any) => sum + Number(item.arrivedQuantity ?? 0),
      0,
    );
    const totalSupplyPrice = transfer.items.reduce((sum: number, item: any) => {
      const departureStock = item.product.stocks.find(
        (stock: any) => stock.branchCode === transfer.departureShop.branchCode,
      );
      const supplyPrice =
        departureStock?.purchasePrice ?? item.product.purchasePrice ?? 0;
      return sum + supplyPrice * Number(item.quantity ?? 0);
    }, 0);
    const totalRetailPrice = transfer.items.reduce((sum: number, item: any) => {
      const departureStock = item.product.stocks.find(
        (stock: any) => stock.branchCode === transfer.departureShop.branchCode,
      );
      const retailPrice = departureStock?.salePrice ?? item.product.salePrice ?? 0;
      return sum + retailPrice * Number(item.quantity ?? 0);
    }, 0);

    return {
      total_measurement_value: totalMeasurementValue,
      total_transfer_value: totalTransferValue,
      total_supply_price: totalSupplyPrice,
      total_retail_price: totalRetailPrice,
    };
  }

  private toTransferListItem(transfer: any) {
    const totals = this.buildTransferTotals(transfer);

    return {
      id: transfer.id,
      external_id: transfer.externalId ?? 0,
      company_id: transfer.companyId ?? '',
      name: transfer.name,
      departure_shop_id: transfer.departureShopId,
      departure_shop: {
        id: transfer.departureShop?.id ?? '',
        name: transfer.departureShop?.name ?? '',
      },
      arrival_shop_id: transfer.arrivalShopId,
      arrival_shop: {
        id: transfer.arrivalShop?.id ?? '',
        name: transfer.arrivalShop?.name ?? '',
      },
      total_loaded_measurement_value: totals.total_measurement_value,
      total_arrived_measurement_value: transfer.items.reduce(
        (sum: number, item: any) => sum + Number(item.arrivedQuantity ?? 0),
        0,
      ),
      total_retail_price: totals.total_retail_price,
      total_supply_price: totals.total_supply_price,
      status_id: this.resolveTransferStatusId(transfer.status),
      status: String(transfer.status ?? 'DRAFT').toLowerCase(),
      created_by: this.toLegacyTransferActor(transfer.createdBy),
      accepted_by: this.toLegacyTransferActor(transfer.acceptedBy),
      created_at: this.formatDateTime(transfer.createdAt, transfer.companyId),
      accepted_at: transfer.acceptedAt
        ? this.formatDateTime(transfer.acceptedAt, transfer.companyId)
        : '',
      transfer_items: null,
      differs: 'false',
      use_departure_shop_prices: Boolean(transfer.useDepartureShopPrices),
      comment: transfer.comment ?? '',
      is_last_event: false,
      session_id: '',
      stocktaking_id: '',
    };
  }

  private toLegacyTransferActor(
    actor:
      | {
          id: number;
          firstName: string | null;
          lastName: string | null;
        }
      | null
      | undefined,
  ) {
    return {
      id: actor ? String(actor.id) : '',
      name: actor
        ? `${actor.firstName ?? ''} ${actor.lastName ?? ''}`.trim()
        : '',
    };
  }

  private resolveTransferStatusId(status: string | null | undefined) {
    switch (status) {
      case 'SENT':
        return TRANSFER_STATUS_IDS.SENT;
      case 'ACCEPTED':
        return TRANSFER_STATUS_IDS.ACCEPTED;
      case 'CANCELLED':
        return TRANSFER_STATUS_IDS.CANCELLED;
      case 'DRAFT':
      default:
        return TRANSFER_STATUS_IDS.DRAFT;
    }
  }

  private toTransferProductCatalogItem(
    product: CatalogProductWithRelations,
    transfer: any,
    item: any,
    shopLookup: Map<string, ResolvedShop>,
  ) {
    return {
      id: item?.id ?? '',
      transfer_id: item?.transferId ?? '',
      product_id: this.getProductPublicId(product),
      transfer_measurement_value: Number(item?.quantity ?? 0),
      updated_at: item?.updatedAt
        ? this.formatDate(item.updatedAt, product.companyId ?? transfer.companyId ?? undefined)
        : '',
      updated_at_int: item?.updatedAt ? Number(item.updatedAt.getTime()) : 0,
      product: this.buildTransferProductPayload(
        product,
        transfer.departureShop.branchCode,
        transfer.arrivalShop.branchCode,
        shopLookup,
      ),
      arrived_measurement_value: Number(item?.arrivedQuantity ?? 0),
      product_info: null,
    };
  }

  private toTransferItemResponse(
    item: any,
    transfer: any,
    shopLookup: Map<string, ResolvedShop>,
    includeProductInfo: boolean,
  ) {
    return {
      id: item.id,
      transfer_id: item.transferId,
      product_id: this.getProductPublicId(item.product),
      transfer_measurement_value: Number(item.quantity ?? 0),
      updated_at: this.formatDate(
        item.updatedAt,
        item.product?.companyId ?? transfer.companyId ?? undefined,
      ),
      updated_at_int: Number(item.updatedAt.getTime()),
      product: this.buildTransferProductPayload(
        item.product,
        transfer.departureShop.branchCode,
        transfer.arrivalShop.branchCode,
        shopLookup,
      ),
      arrived_measurement_value: Number(item.arrivedQuantity ?? 0),
      product_info: includeProductInfo
        ? this.toProductDetailResponse(
            item.product,
            shopLookup,
            {
              sold: 0,
              soldByBranchCode: new Map<string, number>(),
            },
            {
              companyId: transfer.companyId,
            },
          )
        : null,
    };
  }

  private buildTransferProductPayload(
    product: CatalogProductWithRelations,
    departureBranchCode: string,
    arrivalBranchCode: string,
    shopLookup: Map<string, ResolvedShop>,
  ) {
    const metadata =
      product.metadata &&
      typeof product.metadata === 'object' &&
      !Array.isArray(product.metadata)
        ? (product.metadata as Record<string, unknown>)
        : {};
    const measurementUnit = this.buildMeasurementUnitFromMetadata(
      metadata,
      product.companyId ?? COMPANY_ID,
      product.unit,
    );
    const departureShop = this.resolveShopByBranchCode(
      departureBranchCode,
      shopLookup,
    );
    const arrivalShop = this.resolveShopByBranchCode(
      arrivalBranchCode,
      shopLookup,
    );
    const departureStock = product.stocks.find(
      (stock) => stock.branchCode === departureBranchCode,
    );
    const arrivalStock = product.stocks.find(
      (stock) => stock.branchCode === arrivalBranchCode,
    );
    const departureMeasurement = departureStock?.quantity ?? 0;
    const arrivalMeasurement = arrivalStock?.quantity ?? 0;
    const departureSupplyPrice =
      departureStock?.purchasePrice ?? product.purchasePrice ?? 0;
    const departureRetailPrice =
      departureStock?.salePrice ?? product.salePrice ?? 0;
    const arrivalSupplyPrice =
      arrivalStock?.purchasePrice ?? departureSupplyPrice;
    const arrivalRetailPrice =
      arrivalStock?.salePrice ?? product.salePrice ?? departureRetailPrice;

    return {
      id: this.getProductPublicId(product),
      parent_id: '',
      company_id: product.companyId ?? COMPANY_ID,
      categories: product.category
        ? [
            {
              id: String(product.category.id),
              name: product.category.name,
              parent_id: '',
              all_parent_ids: null,
              subRows: null,
              product_count: 0,
              company_id: '',
              is_open: false,
              level_number: 0,
              from_parent: false,
              super_parent_id: '',
              deleted_at: 0,
            },
          ]
        : [],
      name: product.name,
      sku: product.sku ?? '',
      barcode: product.barcode ?? '',
      category_name: product.category?.name ?? '',
      departure_shop_measurement_value: {
        small_left_measurement_value: 0,
        has_trigger: false,
        shop_id: departureShop.shop_id,
        total_measurement_value: departureMeasurement,
        total_min_supply_price: departureMeasurement ? departureSupplyPrice : null,
        total_max_supply_price: departureMeasurement ? departureSupplyPrice : null,
        total_supply_sum: departureMeasurement * departureSupplyPrice,
        total_active_measurement_value: departureMeasurement,
        total_active_min_supply_price: departureMeasurement
          ? departureSupplyPrice
          : null,
        total_active_max_supply_price: departureMeasurement
          ? departureSupplyPrice
          : null,
        total_active_supply_sum: departureMeasurement * departureSupplyPrice,
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
        total_retail_sum: departureMeasurement * departureRetailPrice,
        total_active_retail_sum: departureMeasurement * departureRetailPrice,
        total_inactive_retail_sum: 0,
      },
      arrival_shop_measurement_values: {
        small_left_measurement_value: 0,
        has_trigger: false,
        shop_id: arrivalShop.shop_id,
        total_measurement_value: arrivalMeasurement,
        total_min_supply_price: arrivalMeasurement ? arrivalSupplyPrice : null,
        total_max_supply_price: arrivalMeasurement ? arrivalSupplyPrice : null,
        total_supply_sum: arrivalMeasurement * arrivalSupplyPrice,
        total_active_measurement_value: arrivalMeasurement,
        total_active_min_supply_price: arrivalMeasurement
          ? arrivalSupplyPrice
          : null,
        total_active_max_supply_price: arrivalMeasurement
          ? arrivalSupplyPrice
          : null,
        total_active_supply_sum: arrivalMeasurement * arrivalSupplyPrice,
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
        total_retail_sum: arrivalMeasurement * arrivalRetailPrice,
        total_active_retail_sum: arrivalMeasurement * arrivalRetailPrice,
        total_inactive_retail_sum: 0,
      },
      departure_shop_retail_price: departureRetailPrice,
      arrival_shop_retail_price: arrivalRetailPrice,
      measurement_values: {
        total_measurement_value: product.stocks.reduce(
          (sum, stock) => sum + stock.quantity,
          0,
        ),
        total_active_measurement_value: product.stocks.reduce(
          (sum, stock) => sum + stock.quantity,
          0,
        ),
        total_inactive_measurement_value: 0,
      },
      supply_price: product.purchasePrice ?? 0,
      departure_shop_supply_price: departureSupplyPrice,
      measurement_unit: measurementUnit,
      custom_fields: null,
      base_name: product.name,
      product_attributes: [],
      additional_barcodes: [],
    };
  }

  private async syncProductTotalQuantity(
    tx: Prisma.TransactionClient,
    productId: number,
  ) {
    const allStocks = await tx.productStock.findMany({
      where: {
        productId,
      },
      select: {
        quantity: true,
      },
    });

    await tx.product.update({
      where: {
        id: productId,
      },
      data: {
        quantity: allStocks.reduce((sum, stock) => sum + stock.quantity, 0),
      },
    });
  }

  private formatDate(value: Date, companyId?: string | null) {
    return this.companySettingsService.formatDateForCompany(
      value,
      companyId ?? undefined,
    );
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
      photo: this.normalizeProductPhotoValue(product.photo),
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

  private toProductResponseV2(
    product: {
      id: number;
      companyId?: string | null;
      unit?: string | null;
      name: string;
      sku: string | null;
      barcode: string | null;
      photo: string | null;
      quantity: number;
      metadata?: unknown;
      purchasePrice: number | null;
      salePrice: number | null;
      productType: string | null;
      createdAt: Date;
      updatedAt: Date;
      archivedAt?: Date | null;
      archivedByUserId?: number | null;
      archivedByName?: string | null;
      category: { name: string } | null;
      brand: { name: string } | null;
      suppliers: { supplier: { id: number; name: string } }[];
      stocks: {
        branchCode: string;
        quantity: number;
        purchasePrice: number | null;
        salePrice: number | null;
      }[];
    },
    shopLookup?: Map<string, ResolvedShop>,
    visibleBranchCodes?: string[],
  ) {
    const currencyCode =
      this.companySettingsService.getDefaultCurrencyIsoCode();
    const metadata =
      product.metadata &&
      typeof product.metadata === 'object' &&
      !Array.isArray(product.metadata)
        ? (product.metadata as Record<string, unknown>)
        : {};
    const measurementUnit = this.buildMeasurementUnitFromMetadata(
      metadata,
      product.companyId ?? '',
      product.unit,
    );
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
      public_id: this.getProductPublicId(product),
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
      measurement_unit: measurementUnit,
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
      created_at: this.formatDateTime(product.createdAt, product.companyId),
      updated_at: this.formatDateTime(product.updatedAt, product.companyId),
      base_name: product.name,
      archived_at: this.toArchivedAtResponse(product.archivedAt),
      archived_by: this.toArchivedByResponse(product),
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
      status: product.archivedAt ? 0 : 1,
      scale_plu: 0,
      scale_code: 0,
      is_scalable: false,
      shop_free_prices: null,
      brand_name: product.brand?.name ?? null,
      category_name: product.category?.name ?? null,
      photo: this.normalizeProductPhotoValue(product.photo),
      is_archived: Boolean(product.archivedAt),
    };
  }

  private toProductDetailResponse(
    product: CatalogProductWithRelations,
    shopLookup: Map<string, ResolvedShop>,
    salesSummary: {
      sold: number;
      soldByBranchCode: Map<string, number>;
    },
    context?: {
      companyId?: string | null;
    } | null,
  ) {
    const currencyCode = this.companySettingsService.getDefaultCurrencyIsoCode(
      product.companyId ?? context?.companyId ?? undefined,
    );
    const metadata =
      product.metadata &&
      typeof product.metadata === 'object' &&
      !Array.isArray(product.metadata)
        ? (product.metadata as Record<string, unknown>)
        : {};
    const measurementUnit = this.buildMeasurementUnitFromMetadata(
      metadata,
      product.companyId ?? context?.companyId ?? '',
      product.unit,
    );
    const measurementUnitId = measurementUnit.id;
    const description = this.optionalString(metadata.description) ?? '';
    const freePrice = this.toBooleanValue(metadata.free_price);
    const isVariative = this.toBooleanValue(metadata.is_variative);
    const selectedAttributes = Array.isArray(metadata.selected_attributes)
      ? metadata.selected_attributes
      : [];
    const variants = Array.isArray(metadata.variants) ? metadata.variants : [];
    const totalMeasurementValue = product.stocks.reduce(
      (sum, stock) => sum + stock.quantity,
      0,
    );
    const allBranchCodes = [
      ...new Set([
        ...product.stocks.map((stock) => stock.branchCode),
        ...salesSummary.soldByBranchCode.keys(),
      ]),
    ];
    const stockByBranchCode = new Map(
      product.stocks.map((stock) => [stock.branchCode, stock]),
    );
    const stockSummaries = allBranchCodes.map((branchCode) => {
      const stock = stockByBranchCode.get(branchCode);
      const shop = this.resolveShopByBranchCode(branchCode, shopLookup);
      const supplyPrice = stock?.purchasePrice ?? product.purchasePrice ?? 0;
      const retailPrice = stock?.salePrice ?? product.salePrice ?? 0;
      const measurementValue = stock?.quantity ?? 0;
      const soldValue = salesSummary.soldByBranchCode.get(branchCode) ?? 0;

      return {
        stock,
        shop,
        supplyPrice,
        retailPrice,
        measurementValue,
        soldValue,
        supplySum: measurementValue * supplyPrice,
        retailSum: measurementValue * retailPrice,
      };
    });
    const primarySupplier = product.suppliers[0]?.supplier;

    return {
      id: this.getProductPublicId(product),
      internal_id: String(product.id),
      public_id: this.getProductPublicId(product),
      parent_id: '',
      company_id: product.companyId ?? context?.companyId ?? COMPANY_ID,
      product_type_id: product.productType ?? DEFAULT_PRODUCT_TYPE_ID,
      is_variative: isVariative,
      is_marked: false,
      name: product.name,
      sku: product.sku ?? '',
      main_image_url: this.normalizeProductPhotoValue(product.photo) ?? '',
      images: product.photo
        ? [{ url: this.normalizeProductPhotoValue(product.photo) ?? product.photo }]
        : null,
      barcode: product.barcode ?? '',
      additional_barcodes: null,
      categories: product.category
        ? [
            {
              id: String(product.category.id),
              name: product.category.name,
              parent_id: '',
              all_parent_ids: null,
              subRows: null,
              product_count: 0,
              company_id: product.companyId ?? '',
              is_open: false,
              level_number: 0,
              from_parent: false,
              super_parent_id: '',
              deleted_at: 0,
            },
          ]
        : [],
      brand_id: product.brandId ? String(product.brandId) : '',
      measurement_unit_id: measurementUnitId,
      set_products: [],
      retail_price: product.salePrice ?? 0,
      supply_price: product.purchasePrice ?? 0,
      description,
      measurement_type: this.resolveMeasurementTypeValue(
        product.unit,
        measurementUnit.short_name,
      ),
      measurement_values: {
        total_measurement_value: totalMeasurementValue,
        total_active_measurement_value: totalMeasurementValue,
        total_inactive_measurement_value: 0,
      },
      shop_measurement_values: stockSummaries.map((item) => ({
        small_left_measurement_value: 0,
        has_trigger: false,
        shop_id: item.shop.shop_id,
        total_measurement_value: item.measurementValue,
        total_min_supply_price: item.measurementValue ? item.supplyPrice : null,
        total_max_supply_price: item.measurementValue ? item.supplyPrice : null,
        total_supply_sum: item.supplySum,
        total_active_measurement_value: item.measurementValue,
        total_active_min_supply_price: item.measurementValue
          ? item.supplyPrice
          : null,
        total_active_max_supply_price: item.measurementValue
          ? item.supplyPrice
          : null,
        total_active_supply_sum: item.supplySum,
        total_inactive_measurement_value: 0,
        total_inactive_min_supply_price: null,
        total_inactive_max_supply_price: null,
        total_inactive_supply_sum: 0,
        total_sold_measurement_value: item.soldValue,
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
      })),
      shop_prices: stockSummaries.map((item) => ({
        shop_id: item.shop.shop_id,
        retail_price: item.retailPrice,
        retail_currency: currencyCode,
        supply_currency: currencyCode,
        min_supply_price: item.supplyPrice,
        max_supply_price: item.supplyPrice,
        supply_price: item.supplyPrice,
        wholesale_price: 0,
        min_price: 0,
        max_price: 0,
        prices_list: [],
        from_supply_price: 0,
        currency_prices: [
          {
            currency: currencyCode,
            retail_price: item.retailPrice,
            min_supply_price: item.supplyPrice,
            max_supply_price: item.supplyPrice,
            supply_price: item.supplyPrice,
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
        total_supply_price: 0,
        total_retail_price: 0,
        total_active_supply_price: 0,
        total_active_retail_price: 0,
        total_inactive_supply_price: 0,
        total_inactive_retail_price: 0,
      },
      has_expiration_date: false,
      packages: [],
      product_attributes: selectedAttributes,
      supplier_id: primarySupplier ? String(primarySupplier.id) : '',
      supplier_ids: product.suppliers.length
        ? product.suppliers.map((item) => String(item.supplier.id))
        : null,
      suppliers: product.suppliers.map((item) => ({
        id: String(item.supplier.id),
        company_id: item.supplier.companyId,
        name: item.supplier.name,
        deleted_at: 0,
      })),
      is_divisible: false,
      measurement_unit: measurementUnit,
      custom_fields: [],
      created_at: this.companySettingsService.toIsoForCompany(
        product.createdAt,
        product.companyId ?? context?.companyId ?? undefined,
      ),
      updated_at: this.companySettingsService.toIsoForCompany(
        product.updatedAt,
        product.companyId ?? context?.companyId ?? undefined,
      ),
      is_archived: Boolean(product.archivedAt),
      brand_name: product.brand?.name ?? '',
      product_supply_stock: stockSummaries.map((item) => ({
        shop_id: item.shop.shop_id,
        shop_name: item.shop.shop_name,
        measurement_value: item.measurementValue,
        active_measurement_value: item.measurementValue,
        inactive_measurement_value: 0,
        supply_price: item.supplyPrice,
        supplier_ids: product.suppliers.length
          ? product.suppliers.map((supplier) => String(supplier.supplier.id))
          : null,
      })),
      product_supplier_stock: product.suppliers.length
        ? stockSummaries.map((item) => ({
            supplier_id: primarySupplier ? String(primarySupplier.id) : '',
            supplier_name: primarySupplier?.name ?? '',
            shop_id: item.shop.shop_id,
            measurement_value: item.measurementValue,
            min_supply_price: item.measurementValue ? item.supplyPrice : null,
            max_supply_price: item.measurementValue ? item.supplyPrice : null,
            retail_price: item.retailPrice,
            wholesale_price: 0,
          }))
        : null,
      variations: variants,
      base_name: product.name,
      variation_id: '',
      free_price: freePrice,
      archived_at: this.toArchivedAtResponse(product.archivedAt),
      archived_by: this.toArchivedByResponse(product),
      deleted: false,
      status: product.archivedAt ? 0 : 1,
      all_promos: [],
      scale_plu: 0,
      scale_code: 0,
      is_scalable: false,
      shop_free_prices: null,
      supplier_order_ids: null,
      import_ids: null,
      is_default: false,
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
    const currencyCode = this.companySettingsService.getDefaultCurrencyIsoCode(
      context.companyId ?? undefined,
    );
    const metadata =
      product.metadata &&
      typeof product.metadata === 'object' &&
      !Array.isArray(product.metadata)
        ? (product.metadata as Record<string, unknown>)
        : {};
    const shopPrices = this.extractShopPrices(
      body,
      shipments,
      product.purchasePrice ?? 0,
      product.salePrice ?? 0,
    );
    const shopFreePrices = this.extractShopFreePrices(body, shipments);
    const measurementUnitId =
      this.optionalString(metadata.measurement_unit_id) ??
      this.optionalString(body.measurement_unit_id) ??
      DEFAULT_MEASUREMENT_UNIT.id;
    const measurementUnit = this.buildMeasurementUnitFromMetadata(
      metadata,
      context.companyId ?? COMPANY_ID,
    );
    const productType = this.resolveProductType(body.product_type_id);
    const isVariative = this.toBooleanValue(body.is_variative);
    const measurementType = this.resolveMeasurementTypeValue(
      this.optionalString(body.measurement_type),
      measurementUnit.short_name,
    );
    const selectedAttributes = this.extractSelectedAttributes(
      body.selected_attributes,
    );
    const variants = this.extractVariants(body.variants);
    const supportsStock = !this.isServiceProductType(productType);
    const stockSummaries = shipments.map((shipment) => {
      const shop = this.resolveShopByBranchCode(
        shipment.branchCode,
        shopLookup,
      );
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
      archived_at: this.toArchivedAtResponse(product.archivedAt),
      archived_by: this.toArchivedByResponse(product),
      barcode: product.barcode,
      barcode_lower: '',
      barcode_upper: '',
      base_name: product.name,
      brand_id: this.optionalString(body.brand_id) ?? '',
      brand_name: product.brand?.name ?? '',
      categories: null,
      company_id: context.companyId ?? COMPANY_ID,
      created_at: this.formatDateTime(
        product.createdAt,
        product.companyId ?? context?.companyId ?? undefined,
      ),
      custom_fields: [],
      deleted: false,
      description: this.optionalString(body.description) ?? '',
      free_price: false,
      id: String(product.id),
      public_id: this.getProductPublicId(product),
      is_archived: Boolean(product.archivedAt),
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
      product_attributes: selectedAttributes,
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
      variations: variants,
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
    wholesalePriceFrom?: number,
    wholesalePriceTo?: number,
    wholesalePrice?: number,
    freePrice?: boolean,
  ): Prisma.ProductWhereInput | undefined {
    const and: Prisma.ProductWhereInput[] = [];
    const normalizedStatus = this.normalizeCatalogStatus(status);

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

    if (normalizedStatus === 'active') {
      and.push({
        archivedAt: null,
      });
    }

    if (normalizedStatus === 'inactive') {
      and.push({
        archivedAt: {
          not: null,
        },
      });
    }

    if (normalizedStatus === 'small_left') {
      and.push({
        quantity: {
          gt: 0,
          lte: 5,
        },
      });
    }

    if (normalizedStatus === 'zero_left') {
      and.push({
        quantity: {
          lte: 0,
        },
      });
    }

    if (
      normalizedStatus !== 'active' &&
      normalizedStatus !== 'inactive' &&
      archivedList
    ) {
      and.push({
        archivedAt: {
          not: null,
        },
      });
    } else if (
      normalizedStatus !== 'active' &&
      normalizedStatus !== 'inactive'
    ) {
      and.push({
        archivedAt: null,
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

    if (
      wholesalePriceFrom !== undefined ||
      wholesalePriceTo !== undefined ||
      wholesalePrice !== undefined
    ) {
      and.push({
        metadata: {
          path: ['wholesale_price'],
          ...(wholesalePriceFrom !== undefined
            ? { gte: wholesalePriceFrom }
            : {}),
          ...(wholesalePriceTo !== undefined
            ? { lte: wholesalePriceTo }
            : {}),
          ...(wholesalePriceFrom === undefined &&
          wholesalePriceTo === undefined &&
          wholesalePrice !== undefined
            ? { equals: wholesalePrice }
            : {}),
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

  private normalizeCatalogStatus(
    status?: string,
  ): 'active' | 'inactive' | 'small_left' | 'zero_left' | undefined {
    const normalized = status?.trim().toLowerCase();

    switch (normalized) {
      case '1':
      case 'active':
        return 'active';
      case '0':
      case 'inactive':
        return 'inactive';
      case 'small_left':
      case 'small-left':
      case 'low_stock':
      case 'low-stock':
        return 'small_left';
      case 'zero_left':
      case 'zero-left':
      case 'zero_stock':
      case 'zero-stock':
        return 'zero_left';
      default:
        return undefined;
    }
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
      companyId?: string | null;
      unit?: string | null;
      quantity: number;
      metadata?: unknown;
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
    const measurementUnits = new Map<string, number>();
    const totals = products.reduce(
      (acc, product) => {
        const measurementValue = product.stocks.length
          ? product.stocks.reduce((sum, stock) => sum + stock.quantity, 0)
          : product.quantity;
        const metadata =
          product.metadata &&
          typeof product.metadata === 'object' &&
          !Array.isArray(product.metadata)
            ? (product.metadata as Record<string, unknown>)
            : {};
        const measurementUnit = this.buildMeasurementUnitFromMetadata(
          metadata,
          product.companyId ?? '',
          product.unit,
        );

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
        measurementUnits.set(
          measurementUnit.short_name,
          (measurementUnits.get(measurementUnit.short_name) ?? 0) +
            measurementValue,
        );
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
    const measurementUnitsList = [
      ...measurementUnits.entries(),
    ].map(([measurementUnit, measurementValue]) => ({
      measurement_unit: measurementUnit,
      measurement_value: measurementValue,
    }));

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
          measurement_units: measurementUnitsList,
        },
        active_measurement_value: {
          total: totals.totalMeasurementValue,
          measurement_units: measurementUnitsList,
        },
        inactive_measurement_value: {
          total: 0,
          measurement_units: measurementUnitsList.map((item) => ({
            measurement_unit: item.measurement_unit,
            measurement_value: 0,
          })),
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
        PRODUCT_CHARACTERISTICS.find(
          (field) => field.system_name === systemName,
        ),
      )
      .filter(
        (field): field is (typeof PRODUCT_CHARACTERISTICS)[number] => !!field,
      )
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
          this.toNumber(item.measurement_value) ??
          this.toNumber(item.total_measurement_value) ??
          0;

        return {
          shopId,
          quantity,
          supplyPrice: this.resolvePriceForShop(body, shopId, 'supply_price'),
          retailPrice: this.resolvePriceForShop(body, shopId, 'retail_price'),
          supplierId: this.optionalString(item.supplier_id),
          hasTrigger: this.toBooleanValue(item.has_trigger),
          smallLeftMeasurementValue:
            this.toNumber(item.small_left_measurement_value) ?? 0,
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
    const currencyCode = this.companySettingsService.getDefaultCurrencyIsoCode(
      companyId ?? undefined,
    );

    return shipments.map((shipment) => {
      const shop = this.resolveShopByBranchCode(
        shipment.branchCode,
        shopLookup,
      );

      return {
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
      };
    });
  }

  private extractImportRows(body: Record<string, unknown>): ImportRowInput[] {
    if (!Array.isArray(body.rows)) {
      throw new BadRequestException('rows must be an array');
    }

    return body.rows.flatMap((row, index) => {
      if (!row || typeof row !== 'object' || Array.isArray(row)) {
        return [];
      }

      const item = row as Record<string, unknown>;
      const quantity = this.toNumber(item.quantity) ?? 0;
      const supplyPrice = this.toNumber(item.supply_price) ?? 0;
      const retailPrice = this.toNumber(item.retail_price) ?? 0;
      const name = this.optionalString(item.name);

      return [
        {
          name: name ?? '',
          sku: this.optionalString(item.sku),
          barcode: this.optionalString(item.barcode),
          quantity,
          supplyPrice,
          retailPrice,
          categoryName: this.optionalString(item.category_name),
          brandName: this.optionalString(item.brand_name),
          measurementUnit: this.optionalString(item.measurement_unit),
          supplier: this.optionalString(item.supplier),
          description: this.optionalString(item.description),
          rowNumber: index + 1,
        },
      ].map(({ rowNumber, ...prepared }) => {
        if (!prepared.name && !prepared.sku && !prepared.barcode) {
          throw new BadRequestException(
            `Row ${rowNumber} must contain at least name, sku, or barcode`,
          );
        }

        return prepared;
      });
    });
  }

  private extractImportFields(body: Record<string, unknown>) {
    const properties = Array.isArray(body.properties) ? body.properties : [];

    return properties
      .filter(
        (item): item is Record<string, unknown> =>
          !!item && typeof item === 'object' && !Array.isArray(item),
      )
      .map((item, index) => ({
        id: this.optionalString(item.id) ?? '',
        name:
          this.optionalString(item.name) ??
          this.optionalString(item.system_name) ??
          '',
        sequence_number: this.toInt(item.sequence_number) ?? index + 1,
        is_active: true,
        is_attribute: false,
        is_custom_field: false,
      }));
  }

  private async prepareImportItems(
    importId: string,
    companyId: string,
    rows: ImportRowInput[],
    branchCode: string,
    contextCompanyId?: string | null,
  ) {
    const currencyCode = this.companySettingsService.getDefaultCurrencyIsoCode(
      contextCompanyId ?? companyId,
    );
    const { skuCounts, barcodeCounts } = this.buildImportDuplicateCounts(rows);

    const items: PreparedImportItem[] = [];
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      let existingProduct: CatalogProductWithRelations | null = null;
      let matchError: string | null = null;

      if (!matchError) {
        try {
          existingProduct = await this.findImportMatchedProduct(companyId, row);
        } catch (error) {
          matchError =
            error instanceof Error
              ? error.message
              : 'Failed to match import row';
        }
      }

      const validationIssues = this.buildImportValidationIssues(row, {
        skuCounts,
        barcodeCounts,
        matchError,
      });
      const differentFields = this.collectDifferentFields(
        existingProduct,
        row,
        branchCode,
      );
      const measurementUnit = this.buildImportMeasurementUnit(
        companyId,
        row.measurementUnit,
      );
      const measurementType =
        this.resolveMeasurementTypeValue(
          row.measurementUnit,
          measurementUnit.short_name,
        ) || 'COUNTABLE';

      items.push({
        id: randomUUID(),
        import_id: importId,
        row_number: index + 1,
        product_id: existingProduct ? String(existingProduct.id) : '',
        product_name: row.name,
        product_base_name: row.name,
        product_sku: row.sku ?? '',
        product_barcode: row.barcode ?? '',
        supply_price: row.supplyPrice,
        retail_price: row.retailPrice,
        supply_currency: currencyCode,
        retail_currency: currencyCode,
        measurement_type: measurementType,
        measurement_value: row.quantity,
        measurement_unit: measurementUnit,
        company_id: companyId,
        difference: differentFields.length > 0,
        different_fields: differentFields,
        old_product: existingProduct
          ? this.toImportExistingProductResponse(existingProduct, branchCode)
          : null,
        product_info: existingProduct
          ? this.toImportExistingProductResponse(existingProduct, branchCode)
          : null,
        free_price: false,
        declared_measurement_value: 0,
        is_undeclared: false,
        supplier_id: '',
        description: row.description ?? '',
        error: validationIssues[0]?.message,
        validation_issues: validationIssues,
        action:
          validationIssues.length > 0
            ? 'error'
            : existingProduct
              ? 'update'
              : 'create',
        raw: row,
      });
    }

    return items;
  }

  private validateImportRow(row: ImportRowInput) {
    return this.buildImportValidationIssues(row)[0]?.message ?? null;
  }

  private async findImportMatchedProduct(
    companyId: string,
    row: ImportRowInput,
  ) {
    const sku = row.sku?.trim();
    const barcode = row.barcode?.trim();

    if (!sku && !barcode) {
      return null;
    }

    if (sku && barcode) {
      const exactMatch = await this.prisma.product.findFirst({
        where: {
          companyId,
          sku,
          barcode,
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
      if (exactMatch) {
        return exactMatch;
      }
    }

    const [skuMatch, barcodeMatch] = await Promise.all([
      sku
        ? this.prisma.product.findFirst({
            where: {
              companyId,
              sku,
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
          })
        : Promise.resolve(null),
      barcode
        ? this.prisma.product.findFirst({
            where: {
              companyId,
              barcode,
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
          })
        : Promise.resolve(null),
    ]);

    if (skuMatch && barcodeMatch && skuMatch.id !== barcodeMatch.id) {
      throw new BadRequestException(
        'Import row matches different products by sku and barcode',
      );
    }

    return skuMatch ?? barcodeMatch;
  }

  private collectDifferentFields(
    product: CatalogProductWithRelations | null,
    row: ImportRowInput,
    branchCode: string,
  ) {
    if (!product) {
      return [];
    }

    const differentFields: string[] = [];
    const existingStock = product.stocks.find(
      (stock) => stock.branchCode === branchCode,
    );
    const currentSupplyPrice =
      existingStock?.purchasePrice ?? product.purchasePrice ?? 0;
    const currentRetailPrice = existingStock?.salePrice ?? product.salePrice ?? 0;
    const currentMeasurementUnit = this.normalizeImportFieldValue(product.unit);
    const fileMeasurementUnit = this.normalizeImportFieldValue(
      row.measurementUnit,
    );
    const currentSupplier = this.normalizeImportFieldValue(
      this.resolveProductCurrentSupplierName(product),
    );
    const fileSupplier = this.normalizeImportFieldValue(row.supplier);
    const currentDescription = this.normalizeImportFieldValue(
      this.resolveProductCurrentDescription(product),
    );
    const fileDescription = this.normalizeImportFieldValue(row.description);

    if (row.name && product.name.trim() !== row.name.trim()) {
      differentFields.push('name');
    }

    if (
      row.brandName &&
      (product.brand?.name ?? '').trim() !== row.brandName.trim()
    ) {
      differentFields.push('brand');
    }

    if (
      row.categoryName &&
      (product.category?.name ?? '').trim() !== row.categoryName.trim()
    ) {
      differentFields.push('category');
    }

    if (row.supplyPrice !== currentSupplyPrice) {
      differentFields.push('supply_price');
    }

    if (row.retailPrice !== currentRetailPrice) {
      differentFields.push('retail_price');
    }

    if (fileMeasurementUnit && currentMeasurementUnit !== fileMeasurementUnit) {
      differentFields.push('measurement_unit');
    }

    if (fileSupplier && currentSupplier !== fileSupplier) {
      differentFields.push('supplier');
    }

    if (fileDescription && currentDescription !== fileDescription) {
      differentFields.push('description');
    }

    return differentFields;
  }

  private toImportExistingProductResponse(
    product: CatalogProductWithRelations,
    branchCode: string,
  ) {
    const metadata =
      product.metadata &&
      typeof product.metadata === 'object' &&
      !Array.isArray(product.metadata)
        ? (product.metadata as Record<string, unknown>)
        : {};
    const measurementUnit = this.buildMeasurementUnitFromMetadata(
      metadata,
      product.companyId ?? '',
      product.unit,
    );
    const relevantStock = product.stocks.find(
      (stock) => stock.branchCode === branchCode,
    );
    const totalMeasurementValue = product.stocks.reduce(
      (sum, stock) => sum + stock.quantity,
      0,
    );

    return {
      id: String(product.id),
      public_id: this.getProductPublicId(product),
      company_id: product.companyId ?? '',
      name: product.name,
      sku: product.sku ?? '',
      barcode: product.barcode ?? '',
      categories: product.category
        ? [
            {
              id: String(product.category.id),
              name: product.category.name,
            },
          ]
        : [],
      measurement_values: {
        total_measurement_value: totalMeasurementValue,
        total_active_measurement_value: totalMeasurementValue,
        total_inactive_measurement_value: 0,
      },
      measurement_unit: measurementUnit,
      shop_measurement_values: product.stocks.map((stock) => ({
        small_left_measurement_value: 0,
        has_trigger: false,
        shop_id: this.resolveShopByBranchCode(stock.branchCode).shop_id,
        total_measurement_value: stock.quantity,
        total_sold_measurement_value: 0,
        total_imported_measurement_value: 0,
        import_started_measurement_value: 0,
      })),
      shop_prices: product.stocks.map((stock) => ({
        shop_id: this.resolveShopByBranchCode(stock.branchCode).shop_id,
        retail_price: stock.salePrice ?? product.salePrice ?? 0,
        supply_price: stock.purchasePrice ?? product.purchasePrice ?? 0,
        min_supply_price: stock.purchasePrice ?? product.purchasePrice ?? 0,
        max_supply_price: stock.purchasePrice ?? product.purchasePrice ?? 0,
        retail_currency: 'UZS',
        supply_currency: 'UZS',
      })),
      brand_id: product.brandId ? String(product.brandId) : '',
      brand_name: product.brand?.name ?? '',
      base_name: product.name,
      archived_at: this.toArchivedAtResponse(product.archivedAt),
      archived_by: this.toArchivedByResponse(product),
      product_supply_stock: [],
      status: product.archivedAt ? 0 : 1,
      scale_plu: 0,
      scale_code: 0,
      is_scalable: false,
      shop_free_prices: relevantStock
        ? [
            {
              shop_id: this.resolveShopByBranchCode(branchCode).shop_id,
              sell_with_free_price: false,
            },
          ]
        : null,
      suppliers: product.suppliers.map((item) => ({
        id: String(item.supplier.id),
        company_id: item.supplier.companyId,
        name: item.supplier.name,
        deleted_at: 0,
      })),
      is_archived: Boolean(product.archivedAt),
    };
  }

  private async applyImportRows(
    rows: ImportRowInput[],
    companyId: string,
    shopId: string,
    branchCode: string,
    onMatchPolicy: ImportOnMatchPolicy,
    createdById: number,
  ) {
    let createdCount = 0;
    let updatedCount = 0;
    const errors: Array<{ row: number; message: string }> = [];
    const auditRows: ImportAuditRow[] = [];

    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      const error = this.validateImportRow(row);
      if (error) {
        errors.push({
          row: index + 1,
          message: error,
        });
        auditRows.push({
          row: index + 1,
          action: 'error',
          reason: error,
        });
        continue;
      }

      const productLockKey = this.resolveImportProductLockKey(companyId, row);

      try {
        const actionResult = await this.withImportProductLock(
          productLockKey,
          async () => {
            const matchedProduct = await this.findImportMatchedProduct(
              companyId,
              row,
            );
            if (matchedProduct) {
              const changedFields = await this.applyImportUpdate(
                matchedProduct.id,
                row,
                companyId,
                shopId,
                branchCode,
                onMatchPolicy,
                createdById,
              );

              return {
                action: 'update' as const,
                productId: matchedProduct.id,
                changedFields,
              };
            }

            const createdProduct = await this.applyImportCreate(
              row,
              companyId,
              shopId,
              branchCode,
              createdById,
            );
            return {
              action: 'create' as const,
              productId: createdProduct.id,
              changedFields: [
                {
                  field: 'product',
                  reason: 'created_new_product',
                },
              ],
            };
          },
        );

        if (actionResult.action === 'update') {
          updatedCount += 1;
        } else {
          createdCount += 1;
        }

        auditRows.push({
          row: index + 1,
          action: actionResult.action,
          reason:
            actionResult.action === 'update'
              ? 'matched_by_exact_sku_and_barcode'
              : 'product_not_found_by_exact_sku_and_barcode',
          product_id: actionResult.productId,
          changed_fields: actionResult.changedFields,
        });
      } catch (applyError) {
        errors.push({
          row: index + 1,
          message:
            applyError instanceof Error
              ? applyError.message
              : 'Import failed for row',
        });
        auditRows.push({
          row: index + 1,
          action: 'error',
          reason:
            applyError instanceof Error
              ? applyError.message
              : 'Import failed for row',
        });
      }
    }

    return {
      created_count: createdCount,
      updated_count: updatedCount,
      error_count: errors.length,
      errors,
      audit_rows: auditRows,
    };
  }

  private async applyImportCreate(
    row: ImportRowInput,
    companyId: string,
    shopId: string,
    branchCode: string,
    createdById: number,
  ) {
    const identifiers = await this.resolveIdentifiersForImportCreate(
      row,
      companyId,
    );
    const createdProduct = await this.prisma.$transaction(async (tx) => {
      const product = await tx.product.create({
        data: {
          company: {
            connect: {
              id: companyId,
            },
          },
          name:
            row.name ||
            identifiers.sku ||
            identifiers.barcode ||
            `Imported ${Date.now()}`,
          sku: identifiers.sku,
          barcode: identifiers.barcode,
          purchasePrice: row.supplyPrice,
          salePrice: row.retailPrice,
          quantity: row.quantity,
          unit: row.measurementUnit,
          metadata: this.buildImportMetadata(
            companyId,
            row.description ?? '',
            row.measurementUnit,
          ),
          category: row.categoryName
            ? {
                connectOrCreate: {
                  where: {
                    companyId_name: {
                      companyId,
                      name: row.categoryName,
                    },
                  },
                  create: {
                    companyId,
                    name: row.categoryName,
                  },
                },
              }
            : undefined,
          brand: row.brandName
            ? {
                connectOrCreate: {
                  where: {
                    companyId_name: {
                      companyId,
                      name: row.brandName,
                    },
                  },
                  create: {
                    companyId,
                    name: row.brandName,
                  },
                },
              }
            : undefined,
          suppliers: row.supplier
            ? {
                create: [
                  {
                    supplier: {
                      connectOrCreate: {
                        where: {
                          companyId_name: {
                            companyId,
                            name: row.supplier,
                          },
                        },
                        create: {
                          companyId,
                          name: row.supplier,
                        },
                      },
                    },
                  },
                ],
              }
            : undefined,
          stocks: {
            create: {
              branchCode,
              quantity: row.quantity,
              purchasePrice: row.supplyPrice,
              salePrice: row.retailPrice,
            },
          },
        },
      });

      await this.recordSupplyPriceHistory(tx, {
        productId: product.id,
        shopId,
        supplyPrice: row.supplyPrice,
        oldSupplyPrice: 0,
        createdById,
      });

      await this.createStockMovementRecord(tx, {
        companyId,
        shopId,
        productId: product.id,
        type: 'PURCHASE',
        quantity: row.quantity,
        beforeQuantity: 0,
        afterQuantity: row.quantity,
        createdById,
        externalId: '',
        fromShopId: shopId,
        toShopId: shopId,
        supplyPrice: row.supplyPrice,
        retailPrice: row.retailPrice,
        newRetailPrice: row.retailPrice,
        fromRetailPrice: 0,
        fromSupplyPrice: 0,
      });

      return product;
    });

    return createdProduct;
  }

  private async applyImportUpdate(
    productId: number,
    row: ImportRowInput,
    companyId: string,
    shopId: string,
    branchCode: string,
    onMatchPolicy: ImportOnMatchPolicy,
    createdById: number,
  ): Promise<Array<{ field: string; reason: string }>> {
    const changedFields: Array<{ field: string; reason: string }> = [];

    await this.prisma.$transaction(async (tx) => {
      const existingProduct = await tx.product.findUnique({
        where: { id: productId },
        include: {
          category: true,
          brand: true,
        },
      });

      if (!existingProduct) {
        throw new NotFoundException(`Product ${productId} not found`);
      }

      const existingStock = await tx.productStock.findFirst({
        where: {
          productId,
          branchCode,
        },
      });
      const previousSupplyPrice =
        existingStock?.purchasePrice ?? existingProduct.purchasePrice ?? 0;
      const previousRetailPrice =
        existingStock?.salePrice ?? existingProduct.salePrice ?? 0;
      const beforeQuantity = existingStock?.quantity ?? 0;
      const afterQuantity = beforeQuantity + row.quantity;
      const appliedSupplyPrice = this.shouldUseFileValue(onMatchPolicy.supplyPrice)
        ? row.supplyPrice
        : previousSupplyPrice;
      const appliedRetailPrice = this.shouldUseFileValue(onMatchPolicy.retailPrice)
        ? row.retailPrice
        : previousRetailPrice;

      if (existingStock) {
        await tx.productStock.update({
          where: {
            id: existingStock.id,
          },
          data: {
            quantity: afterQuantity,
            purchasePrice: appliedSupplyPrice,
            salePrice: appliedRetailPrice,
          },
        });
        changedFields.push({
          field: 'quantity',
          reason: 'existing_stock_incremented',
        });
      } else {
        await tx.productStock.create({
          data: {
            productId,
            branchCode,
            quantity: afterQuantity,
            purchasePrice: appliedSupplyPrice,
            salePrice: appliedRetailPrice,
          },
        });
        changedFields.push({
          field: 'quantity',
          reason: 'new_stock_row_created',
        });
      }

      if (this.shouldUseFileValue(onMatchPolicy.supplyPrice)) {
        changedFields.push({
          field: 'purchasePrice',
          reason: 'replaced_with_last_arrival',
        });
      }
      if (this.shouldUseFileValue(onMatchPolicy.retailPrice)) {
        changedFields.push({
          field: 'salePrice',
          reason: 'replaced_with_last_arrival',
        });
      }

      const allStocks = await tx.productStock.findMany({
        where: {
          productId,
        },
      });

      await tx.product.update({
        where: {
          id: productId,
        },
        data: {
          name:
            this.shouldUseFileValue(onMatchPolicy.name) && row.name
              ? row.name
              : undefined,
          purchasePrice: appliedSupplyPrice,
          salePrice: appliedRetailPrice,
          quantity: allStocks.reduce((sum, stock) => sum + stock.quantity, 0),
          unit:
            this.shouldUseFileValue(onMatchPolicy.measurementUnit) &&
            row.measurementUnit
              ? row.measurementUnit
              : undefined,
          metadata: this.buildImportMetadata(
            companyId,
            this.shouldUseFileValue(onMatchPolicy.description)
              ? (row.description ?? '')
              : this.resolveDescriptionFromMetadata(existingProduct.metadata),
            this.shouldUseFileValue(onMatchPolicy.measurementUnit)
              ? row.measurementUnit
              : existingProduct.unit,
          ),
          category:
            this.shouldUseFileValue(onMatchPolicy.category) && row.categoryName
              ? {
                  connectOrCreate: {
                    where: {
                      companyId_name: {
                        companyId,
                        name: row.categoryName,
                      },
                    },
                    create: {
                      companyId,
                      name: row.categoryName,
                    },
                  },
                }
              : undefined,
          brand:
            this.shouldUseFileValue(onMatchPolicy.brand) && row.brandName
              ? {
                  connectOrCreate: {
                    where: {
                      companyId_name: {
                        companyId,
                        name: row.brandName,
                      },
                    },
                    create: {
                      companyId,
                      name: row.brandName,
                    },
                  },
                }
              : undefined,
        },
      });

      if (this.shouldUseFileValue(onMatchPolicy.supplier) && row.supplier) {
        const supplier = await tx.supplier.upsert({
          where: {
            companyId_name: {
              companyId,
              name: row.supplier,
            },
          },
          update: {},
          create: {
            companyId,
            name: row.supplier,
          },
        });

        await tx.productSupplier.upsert({
          where: {
            productId_supplierId: {
              productId,
              supplierId: supplier.id,
            },
          },
          update: {},
          create: {
            productId,
            supplierId: supplier.id,
          },
        });
        changedFields.push({
          field: 'supplier',
          reason: 'updated_from_file_by_policy',
        });
      }

      if (previousSupplyPrice !== appliedSupplyPrice) {
        await this.recordSupplyPriceHistory(tx, {
          productId,
          shopId,
          supplyPrice: appliedSupplyPrice,
          oldSupplyPrice: previousSupplyPrice,
          createdById,
        });
      }

      await this.createStockMovementRecord(tx, {
        companyId,
        shopId,
        productId,
        type: 'PURCHASE',
        quantity: row.quantity,
        beforeQuantity,
        afterQuantity,
        createdById,
        externalId: '',
        fromShopId: shopId,
        toShopId: shopId,
        supplyPrice: appliedSupplyPrice,
        retailPrice: appliedRetailPrice,
        newRetailPrice: appliedRetailPrice,
        fromRetailPrice: previousRetailPrice,
        fromSupplyPrice: previousSupplyPrice,
      });
    });

    if (this.shouldUseFileValue(onMatchPolicy.name) && row.name) {
      changedFields.push({
        field: 'name',
        reason: 'updated_from_file_by_policy',
      });
    }
    if (
      this.shouldUseFileValue(onMatchPolicy.measurementUnit) &&
      row.measurementUnit
    ) {
      changedFields.push({
        field: 'measurementUnit',
        reason: 'updated_from_file_by_policy',
      });
    }
    if (this.shouldUseFileValue(onMatchPolicy.description)) {
      changedFields.push({
        field: 'description',
        reason: 'updated_from_policy',
      });
    }
    if (this.shouldUseFileValue(onMatchPolicy.brand) && row.brandName) {
      changedFields.push({
        field: 'brand',
        reason: 'updated_from_file_by_policy',
      });
    }
    if (this.shouldUseFileValue(onMatchPolicy.category) && row.categoryName) {
      changedFields.push({
        field: 'category',
        reason: 'updated_from_file_by_policy',
      });
    }
    if (this.shouldUseFileValue(onMatchPolicy.supplyPrice)) {
      changedFields.push({
        field: 'supplyPrice',
        reason: 'updated_from_file_by_policy',
      });
    }
    if (this.shouldUseFileValue(onMatchPolicy.retailPrice)) {
      changedFields.push({
        field: 'retailPrice',
        reason: 'updated_from_file_by_policy',
      });
    }

    return changedFields;
  }

  private resolveDescriptionFromMetadata(metadata: Prisma.JsonValue | null) {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
      return '';
    }

    const description = (metadata as Record<string, unknown>).description;
    return typeof description === 'string' ? description : '';
  }

  private async resolveIdentifiersForImportCreate(
    row: ImportRowInput,
    companyId: string,
  ) {
    let sku = row.sku?.trim() ?? '';
    let barcode = row.barcode?.trim() ?? '';

    if (!sku) {
      sku = await this.generateUniqueImportIdentifier(companyId, 'sku', 'SKU');
    }

    if (!barcode) {
      barcode = await this.generateUniqueImportIdentifier(
        companyId,
        'barcode',
        'BC',
      );
    }

    return { sku, barcode };
  }

  private async generateUniqueImportIdentifier(
    companyId: string,
    field: 'sku' | 'barcode',
    prefix: string,
  ) {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const candidate = `${prefix}-${randomUUID().replace(/-/g, '').slice(0, 12)}`;
      const existing = await this.prisma.product.findFirst({
        where: {
          companyId,
          [field]: candidate,
        },
        select: { id: true },
      });

      if (!existing) {
        return candidate;
      }
    }

    throw new BadRequestException(
      `Unable to generate unique ${field} for import`,
    );
  }

  private resolveImportProductLockKey(companyId: string, row: ImportRowInput) {
    const sku = row.sku?.trim();
    const barcode = row.barcode?.trim();
    if (sku && barcode) {
      return `${companyId}:${sku}:${barcode}`;
    }

    if (sku) {
      return `${companyId}:sku:${sku}`;
    }

    if (barcode) {
      return `${companyId}:barcode:${barcode}`;
    }

    return `${companyId}:row:${randomUUID()}`;
  }

  private async buildProductSalesSummary(
    productId: number,
    context: any,
    options?: {
      fromCreatedAt?: string;
      toCreatedAt?: string;
    },
  ) {
    const createdAtFilter = this.buildCreatedAtFilter(
      options?.fromCreatedAt,
      options?.toCreatedAt,
    );
    const visibleBranchCodes = context?.allowedBranchCodes?.length
      ? context.allowedBranchCodes
      : undefined;
    const saleItems = await this.prisma.saleItem.findMany({
      where: {
        productId,
        sale: {
          isDraft: false,
          ...(context?.companyId ? { companyId: context.companyId } : {}),
          ...(visibleBranchCodes?.length
            ? {
                branchCode: {
                  in: visibleBranchCodes,
                },
              }
            : {}),
          ...(createdAtFilter ? { createdAt: createdAtFilter } : {}),
        },
      },
      include: {
        sale: {
          select: {
            id: true,
            number: true,
            branchCode: true,
            createdAt: true,
          },
        },
      },
      orderBy: {
        sale: {
          createdAt: 'desc',
        },
      },
    });

    const soldByBranchCode = new Map<string, number>();
    for (const saleItem of saleItems) {
      const branchCode = saleItem.sale.branchCode ?? '';
      if (!branchCode) {
        continue;
      }

      soldByBranchCode.set(
        branchCode,
        (soldByBranchCode.get(branchCode) ?? 0) + saleItem.quantity,
      );
    }

    const branchCodes = [
      ...new Set(
        saleItems
          .map((saleItem) => saleItem.sale.branchCode)
          .filter((branchCode): branchCode is string => !!branchCode),
      ),
    ];
    const shopLookup = await this.buildShopLookupByBranchCodes(
      branchCodes,
      context?.companyId,
    );

    return {
      sold: saleItems.reduce((sum, item) => sum + item.quantity, 0),
      soldByBranchCode,
      movements: saleItems.map((saleItem) => {
        const branchCode = saleItem.sale.branchCode ?? '';
        const shop = this.resolveShopByBranchCode(branchCode, shopLookup);

        return {
          internal_id: saleItem.id,
          id: String(saleItem.id),
          type: 'order',
          created_at: this.formatDateTime(
            saleItem.sale.createdAt,
            context?.companyId ?? undefined,
          ),
          external_id: saleItem.sale.number,
          measurement_value: saleItem.quantity,
          loaded_measurement_value: 0,
          from_shop: shop.shop_id,
          to_shop: shop.shop_id,
          supply_price: 0,
          retail_price: saleItem.salePrice ?? 0,
          new_retail_price: 0,
          from_retail_price: 0,
          from_supply_price: 0,
        };
      }),
    };
  }

  private buildCreatedAtFilter(fromCreatedAt?: string, toCreatedAt?: string) {
    const fromDate = this.parseDateBoundary(fromCreatedAt, 'from_created_at');
    const toDate = this.parseDateBoundary(toCreatedAt, 'to_created_at');

    if (!fromDate && !toDate) {
      return undefined;
    }

    return {
      ...(fromDate ? { gte: fromDate } : {}),
      ...(toDate ? { lte: toDate } : {}),
    };
  }

  private async buildProductMovementWhere(
    productId: number,
    query: {
      fromCreatedAt?: string;
      toCreatedAt?: string;
      movementType?: string;
      shopId?: string;
    },
    context: any,
  ): Promise<Prisma.StockMovementWhereInput> {
    const and: Prisma.StockMovementWhereInput[] = [{ productId }];
    const createdAt = this.buildCreatedAtFilter(
      query.fromCreatedAt,
      query.toCreatedAt,
    );

    if (context?.companyId) {
      and.push({ companyId: context.companyId });
    }

    if (createdAt) {
      and.push({ createdAt });
    }

    const normalizedMovementType = this.normalizeProductMovementType(
      query.movementType,
    );
    if (normalizedMovementType) {
      and.push({ type: normalizedMovementType });
    }

    const resolvedShopIds = await this.resolveMovementShopFilter(
      query.shopId,
      context,
    );
    if (resolvedShopIds?.length) {
      and.push({
        shopId: {
          in: resolvedShopIds,
        },
      });
    } else if (context?.userType === 'company' && context.allowedShopIds?.length) {
      and.push({
        shopId: {
          in: context.allowedShopIds,
        },
      });
    }

    return and.length === 1 ? and[0] : { AND: and };
  }

  private normalizeProductMovementType(value?: string) {
    const normalized = value?.trim().toUpperCase();
    if (!normalized) {
      return undefined;
    }

    const supportedTypes = new Set([
      'SALE',
      'RETURN',
      'WRITE_OFF',
      'PURCHASE',
      'TRANSFER',
    ]);

    return supportedTypes.has(normalized)
      ? (normalized as
          | 'SALE'
          | 'RETURN'
          | 'WRITE_OFF'
          | 'PURCHASE'
          | 'TRANSFER')
      : undefined;
  }

  private async resolveMovementShopFilter(shopId: string | undefined, context: any) {
    const normalizedShopId = shopId?.trim();
    if (!normalizedShopId) {
      return undefined;
    }

    const shops = await this.prisma.shop.findMany({
      where: {
        ...(context?.companyId ? { companyId: context.companyId } : {}),
        OR: [{ id: normalizedShopId }, { branchCode: normalizedShopId }],
      },
      select: {
        id: true,
      },
    });

    const resolvedShopIds = shops.map((shop) => shop.id);
    if (!resolvedShopIds.length) {
      return [normalizedShopId];
    }

    if (context?.userType !== 'company') {
      return resolvedShopIds;
    }

    return resolvedShopIds.filter((id) => context.allowedShopIds.includes(id));
  }

  private async recordSupplyPriceHistory(
    tx: Prisma.TransactionClient,
    input: {
      productId: number;
      shopId: string;
      supplyPrice: number;
      oldSupplyPrice: number;
      createdById: number;
    },
  ) {
    await tx.productSupplyPriceHistory.create({
      data: {
        productId: input.productId,
        shopId: input.shopId,
        supplyPrice: input.supplyPrice,
        oldSupplyPrice: input.oldSupplyPrice,
        createdById: input.createdById,
      },
    });
  }

  private async createStockMovementRecord(
    tx: Prisma.TransactionClient,
    input: {
      companyId: string;
      shopId: string;
      productId: number;
      orderId?: string;
      type: 'SALE' | 'RETURN' | 'WRITE_OFF' | 'PURCHASE' | 'TRANSFER';
      quantity: number;
      beforeQuantity: number;
      afterQuantity: number;
      createdById: number;
      externalId: string;
      fromShopId: string;
      toShopId: string;
      supplyPrice: number;
      retailPrice: number;
      newRetailPrice: number;
      fromRetailPrice: number;
      fromSupplyPrice: number;
      orderType?: string;
      orderStatus?: string;
    },
  ) {
    await tx.stockMovement.create({
      data: {
        companyId: input.companyId,
        shopId: input.shopId,
        productId: input.productId,
        orderId: input.orderId,
        type: input.type,
        displayTypeCode: this.mapProductMovementTypeToCode(
          input.type,
          input.orderType,
          input.orderStatus,
        ),
        displayTypeLabel: this.mapProductMovementTypeToLegacyType(
          input.type,
          input.orderType,
          input.orderStatus,
        ),
        externalId: input.externalId,
        quantity: input.quantity,
        loadedMeasurementValue: input.afterQuantity,
        beforeQuantity: input.beforeQuantity,
        afterQuantity: input.afterQuantity,
        fromShopId: input.fromShopId,
        toShopId: input.toShopId,
        supplyPrice: input.supplyPrice,
        retailPrice: input.retailPrice,
        newRetailPrice: input.newRetailPrice,
        fromRetailPrice: input.fromRetailPrice,
        fromSupplyPrice: input.fromSupplyPrice,
        createdById: input.createdById,
      },
    });
  }

  private toLegacyProductMovementItem(
    movement: {
      id: string;
      type: 'SALE' | 'RETURN' | 'WRITE_OFF' | 'PURCHASE' | 'TRANSFER';
      displayTypeCode: string;
      displayTypeLabel: string;
      externalId: string;
      quantity: Prisma.Decimal | number;
      loadedMeasurementValue: Prisma.Decimal | number;
      beforeQuantity: Prisma.Decimal | number;
      afterQuantity: Prisma.Decimal | number;
      fromShopId: string;
      toShopId: string;
      supplyPrice: Prisma.Decimal | number;
      retailPrice: Prisma.Decimal | number;
      newRetailPrice: Prisma.Decimal | number;
      fromRetailPrice: Prisma.Decimal | number;
      fromSupplyPrice: Prisma.Decimal | number;
      createdAt: Date;
      shop?: {
        id: string;
        name: string;
        branchCode: string;
      } | null;
      createdBy?: {
        id: number;
        firstName: string | null;
        lastName: string | null;
      } | null;
      order?: {
        id: string;
        orderNumber: string;
        orderType: string;
        status: string;
        createdAt: Date;
      } | null;
    },
  ) {
    return {
      internal_id: 0,
      id: movement.id,
      type:
        movement.displayTypeCode ||
        this.mapProductMovementTypeToCode(
          movement.type,
          movement.order?.orderType,
          movement.order?.status,
        ),
      type_label:
        movement.displayTypeLabel ||
        this.mapProductMovementTypeToLegacyType(
          movement.type,
          movement.order?.orderType,
          movement.order?.status,
        ),
      created_at: this.formatDateTime(
        movement.createdAt,
        undefined,
      ),
      external_id: movement.externalId || movement.order?.orderNumber || '',
      measurement_value: Number(movement.quantity ?? 0),
      loaded_measurement_value: Number(
        movement.loadedMeasurementValue ?? movement.afterQuantity ?? 0,
      ),
      from_shop: movement.fromShopId || movement.shop?.id || '',
      to_shop: movement.toShopId || movement.shop?.id || '',
      supply_price: Number(movement.supplyPrice ?? 0),
      retail_price: Number(movement.retailPrice ?? 0),
      new_retail_price: Number(movement.newRetailPrice ?? 0),
      from_retail_price: Number(movement.fromRetailPrice ?? 0),
      from_supply_price: Number(movement.fromSupplyPrice ?? 0),
    };
  }

  private mapProductMovementTypeToCode(
    type: 'SALE' | 'RETURN' | 'WRITE_OFF' | 'PURCHASE' | 'TRANSFER',
    orderType?: string,
    orderStatus?: string,
  ) {
    switch (type) {
      case 'RETURN':
        return 'return';
      case 'PURCHASE':
        return 'import';
      case 'WRITE_OFF':
        return 'write_off';
      case 'TRANSFER':
        return 'transfer';
      case 'SALE':
        if (orderType === 'RETURN' || orderStatus === 'RETURNED') {
          return 'return';
        }
        if (orderStatus === 'PARKED') {
          return 'parked';
        }
        if (orderStatus === 'DRAFT') {
          return 'order';
        }
        return 'sale';
    }
  }

  private mapProductMovementTypeToLegacyType(
    type: 'SALE' | 'RETURN' | 'WRITE_OFF' | 'PURCHASE' | 'TRANSFER',
    orderType?: string,
    orderStatus?: string,
  ) {
    switch (type) {
      case 'RETURN':
        return 'Возврат';
      case 'PURCHASE':
        return 'Импорт';
      case 'WRITE_OFF':
        return 'Списание';
      case 'TRANSFER':
        return 'Трансфер';
      case 'SALE':
        if (orderType === 'RETURN' || orderStatus === 'RETURNED') {
          return 'Возврат';
        }
        if (orderStatus === 'PARKED') {
          return 'Отложка';
        }
        if (orderStatus === 'DRAFT') {
          return 'Заказ';
        }
        return 'Продажа';
    }
  }

  private buildProductMovementStats(
    movements: Array<{
      type: 'SALE' | 'RETURN' | 'WRITE_OFF' | 'PURCHASE' | 'TRANSFER';
      quantity: Prisma.Decimal | number;
    }>,
  ) {
    return movements.reduce(
      (acc, movement) => {
        const quantity = Number(movement.quantity ?? 0);

        switch (movement.type) {
          case 'SALE':
            acc.sold += quantity;
            break;
          case 'RETURN':
            acc.returned += quantity;
            break;
          case 'WRITE_OFF':
            acc.writtenOff += quantity;
            break;
          case 'PURCHASE':
            acc.imported += quantity;
            break;
          case 'TRANSFER':
            acc.transferred += quantity;
            acc.transferArrived += quantity;
            break;
        }

        return acc;
      },
      {
        imported: 0,
        sold: 0,
        returned: 0,
        transferArrived: 0,
        transferred: 0,
        writtenOff: 0,
      },
    );
  }

  private parseDateBoundary(value: string | undefined, field: string) {
    const normalized = value?.trim();
    if (!normalized) {
      return undefined;
    }

    const parsed = new Date(normalized);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(`${field} must be a valid date`);
    }

    return parsed;
  }

  private async withImportProductLock<T>(
    key: string,
    callback: () => Promise<T>,
  ) {
    while (PRODUCT_IMPORT_LOCKS.has(key)) {
      await new Promise((resolve) => {
        setTimeout(resolve, 10);
      });
    }

    PRODUCT_IMPORT_LOCKS.add(key);
    try {
      return await callback();
    } finally {
      PRODUCT_IMPORT_LOCKS.delete(key);
    }
  }

  private buildImportMeasurementUnit(
    companyId: string,
    measurementUnit?: string | null,
  ) {
    return this.buildMeasurementUnitFromMetadata(
      {},
      companyId,
      measurementUnit,
    );
  }

  private buildImportMetadata(
    companyId: string,
    description: string,
    measurementUnit?: string | null,
  ) {
    const normalizedMeasurementUnit = this.normalizeMeasurementUnitShortName(
      measurementUnit,
    );
    return {
      company_id: companyId,
      description,
      imported: true,
      measurement_unit_name:
        this.normalizeMeasurementUnitName(normalizedMeasurementUnit) ?? null,
      measurement_unit_short_name: normalizedMeasurementUnit ?? null,
      measurement_unit_precision: DEFAULT_MEASUREMENT_UNIT.precision,
    } satisfies Prisma.InputJsonObject;
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

  private applyProductScope(
    where: Prisma.ProductWhereInput | undefined,
    context: any,
  ) {
    if (!context || context.userType !== 'company') {
      return where;
    }

    const scopedFilters: Prisma.ProductWhereInput[] = [];

    if (where) {
      scopedFilters.push(where);
    }

    if (context.companyId) {
      scopedFilters.push({
        companyId: context.companyId,
      });
    }

    if (context.allowedBranchCodes.length > 0) {
      scopedFilters.push({
        stocks: {
          some: {
            branchCode: {
              in: context.allowedBranchCodes,
            },
          },
        },
      });
    }

    if (!scopedFilters.length) {
      return undefined;
    }

    if (scopedFilters.length === 1) {
      return scopedFilters[0] as Prisma.ProductWhereInput;
    }

    return { AND: scopedFilters } satisfies Prisma.ProductWhereInput;
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

  private resolveProductCompanyId(
    body: Record<string, unknown>,
    context?: {
      userType?: string;
      companyId?: string | null;
    } | null,
  ) {
    if (context?.userType === 'company') {
      if (!context.companyId) {
        throw new UnauthorizedException('Company user is missing company');
      }

      return context.companyId;
    }

    const requestedCompanyId =
      this.optionalString(body.company_id) ??
      this.optionalString(
        (body.metadata as Record<string, unknown> | undefined)?.company_id,
      ) ??
      context?.companyId ??
      COMPANY_ID;

    if (!requestedCompanyId) {
      throw new BadRequestException('company_id is required');
    }

    return requestedCompanyId;
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
    const normalizedIdentifiers = [
      ...new Set(
        shipments
          .map((shipment) => shipment.shopId.trim())
          .filter((identifier) => identifier.length > 0),
      ),
    ];

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

  private async resolveBranchCodeForWrite(
    shopIdentifier: string,
    context: any,
  ) {
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

    const shop = await this.prisma.shop.findFirst({
      where: {
        OR: [
          { id: normalizedIdentifier },
          { branchCode: normalizedIdentifier },
        ],
      },
      select: {
        branchCode: true,
      },
    });

    if (shop) {
      return shop.branchCode;
    }

    const shopDirectory = await this.companySettingsService.getShops({
      page: 1,
      limit: 1000,
      companyId: context?.companyId,
    });
    const shopFromDirectory = shopDirectory.shops.find((item) => {
      if (!item || typeof item !== 'object') {
        return false;
      }

      const candidate = item as Record<string, unknown>;
      const id = this.optionalString(candidate.id);
      return id === normalizedIdentifier;
    });
    const directoryBranchCode = this.optionalString(
      (shopFromDirectory as Record<string, unknown> | undefined)?.branch_code,
    );
    if (directoryBranchCode) {
      return directoryBranchCode;
    }

    const legacyBranchCode =
      this.resolveBranchCodeByShopId(normalizedIdentifier);
    if (legacyBranchCode) {
      const legacyShop = await this.prisma.shop.findFirst({
        where: {
          branchCode: legacyBranchCode,
          ...(context?.companyId ? { companyId: context.companyId } : {}),
        },
        select: {
          id: true,
        },
      });

      if (legacyShop) {
        return legacyBranchCode;
      }
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

  private normalizeSkuPrefix(prefix?: string) {
    const cleaned = prefix?.replace(/[^A-Za-z0-9]/g, '').toUpperCase() ?? '';
    return (cleaned || 'SKU')
      .slice(0, SKU_PREFIX_LENGTH)
      .padEnd(SKU_PREFIX_LENGTH, 'X');
  }

  private formatSku(prefix: string, skuNumber: number) {
    return `${prefix}-${String(skuNumber).padStart(SKU_NUMBER_LENGTH, '0')}`;
  }

  private async getNextSkuNumber(companyId: string, prefix: string) {
    const latestSkuRecords = await this.prisma.product.findMany({
      where: {
        companyId,
        sku: {
          startsWith: `${prefix}-`,
        },
      },
      orderBy: {
        sku: 'desc',
      },
      select: {
        sku: true,
      },
    });

    const maxSkuNumber = latestSkuRecords.reduce((maxValue, record) => {
      const parsed = this.extractSkuNumber(record.sku, prefix);
      return parsed === null ? maxValue : Math.max(maxValue, parsed);
    }, 0);

    return maxSkuNumber + 1;
  }

  private extractSkuNumber(sku: string | null, prefix: string) {
    if (!sku) {
      return null;
    }

    const match = new RegExp(
      `^${this.escapeRegExp(prefix)}-(\\d{${SKU_NUMBER_LENGTH}})$`,
    ).exec(sku);
    if (!match) {
      return null;
    }

    const parsed = Number(match[1]);
    return Number.isInteger(parsed) ? parsed : null;
  }

  private extractEan13Payload(barcode: string | null) {
    if (!barcode || !/^\d{13}$/.test(barcode) || !barcode.startsWith('2')) {
      return null;
    }

    if (!this.isValidEan13Barcode(barcode)) {
      return null;
    }

    const payload = Number(barcode.slice(0, 12));
    return Number.isInteger(payload) ? payload : null;
  }

  private formatEan13Barcode(payload: number) {
    const payloadString = String(payload).padStart(12, '0');
    return `${payloadString}${this.calculateEan13CheckDigit(payloadString)}`;
  }

  private isValidEan13Barcode(barcode: string) {
    return (
      this.calculateEan13CheckDigit(barcode.slice(0, 12)) ===
      Number(barcode[12])
    );
  }

  private calculateEan13CheckDigit(payload: string) {
    const sum = payload.split('').reduce((total, digit, index) => {
      const value = Number(digit);
      return total + value * (index % 2 === 0 ? 1 : 3);
    }, 0);

    return (10 - (sum % 10)) % 10;
  }

  private escapeRegExp(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private parseProductId(id: string) {
    const parsed = Number(id);
    if (!Number.isInteger(parsed)) {
      throw new BadRequestException('product id must be a number');
    }

    return parsed;
  }

  private buildProductIdentifierWhere(id: string): Prisma.ProductWhereInput {
    const normalized = id.trim();
    if (!normalized) {
      throw new BadRequestException('product id must be provided');
    }

    const parsed = Number(normalized);
    if (Number.isInteger(parsed) && String(parsed) === normalized) {
      return {
        OR: [
          { id: parsed },
          { publicId: normalized } as unknown as Prisma.ProductWhereInput,
        ],
      } as Prisma.ProductWhereInput;
    }

    return {
      publicId: normalized,
    } as unknown as Prisma.ProductWhereInput;
  }

  private buildBulkProductIdentifierWhere(
    ids: string[],
  ): Prisma.ProductWhereInput {
    const normalizedIds = ids.map((id) => id.trim()).filter(Boolean);
    const numericIds = normalizedIds
      .map((id) => Number(id))
      .filter((id) => Number.isInteger(id));
    const orConditions: Prisma.ProductWhereInput[] = [];

    if (numericIds.length) {
      orConditions.push({
        id: {
          in: numericIds,
        },
      });
    }

    orConditions.push({
      publicId: {
        in: normalizedIds,
      },
    } as unknown as Prisma.ProductWhereInput);

    return orConditions.length === 1
      ? orConditions[0]
      : ({
          OR: orConditions,
        } as Prisma.ProductWhereInput);
  }

  private getProductPublicId(
    product: { id: number } & Record<string, unknown>,
  ) {
    const publicId =
      typeof (product as Record<string, unknown>).publicId === 'string'
        ? ((product as Record<string, unknown>).publicId as string).trim()
        : '';

    return publicId || String(product.id);
  }

  private toArchivedAtResponse(value?: Date | null, companyId?: string | null) {
    return this.companySettingsService.toIsoForCompany(
      value,
      companyId ?? undefined,
    );
  }

  private toArchivedByResponse(product: {
    archivedByUserId?: number | null;
    archivedByName?: string | null;
  }) {
    return {
      id: product.archivedByUserId ? String(product.archivedByUserId) : '',
      name: product.archivedByName ?? '',
    };
  }

  private async resolveSupplierIdsForCompany(
    supplierIds: number[],
    companyId?: string | null,
  ) {
    if (!supplierIds.length) {
      return [];
    }

    if (!companyId) {
      return supplierIds;
    }

    const suppliers = await this.prisma.supplier.findMany({
      where: {
        id: {
          in: supplierIds,
        },
        companyId,
      },
      select: {
        id: true,
      },
    });

    if (suppliers.length !== supplierIds.length) {
      throw new BadRequestException(
        'One or more suppliers are not available for this company',
      );
    }

    return suppliers.map((supplier) => supplier.id);
  }

  private async resolveMeasurementUnitSnapshot(
    measurementUnitId: string,
    companyId?: string | null,
  ) {
    const normalizedCompanyId = companyId?.trim();
    if (!normalizedCompanyId) {
      throw new BadRequestException('company_id is required');
    }

    const measurementUnit = await this.prisma.measurementUnitSetting.findFirst({
      where: {
        id: measurementUnitId,
        companyId: normalizedCompanyId,
      },
    });

    if (!measurementUnit) {
      throw new BadRequestException('measurement_unit_id is invalid');
    }

    return {
      id: measurementUnit.id,
      name: measurementUnit.name,
      company_id: measurementUnit.companyId,
      short_name: measurementUnit.shortName,
      precision: measurementUnit.precision,
      is_editable: measurementUnit.isEditable,
      is_default: measurementUnit.isDefault,
    };
  }

  private buildMeasurementUnitFromMetadata(
    metadata: Record<string, unknown>,
    companyId?: string | null,
    fallbackUnit?: string | null,
  ) {
    const normalizedFallbackUnit = this.normalizeMeasurementUnitShortName(
      fallbackUnit,
    );
    const measurementUnitId =
      this.optionalString(metadata.measurement_unit_id) ?? null;
    const measurementUnitShortName =
      this.normalizeMeasurementUnitShortName(
        this.optionalString(metadata.measurement_unit_short_name),
      ) ??
      normalizedFallbackUnit ??
      DEFAULT_MEASUREMENT_UNIT.short_name;
    const measurementUnitName =
      this.normalizeMeasurementUnitName(
        this.optionalString(metadata.measurement_unit_name),
      ) ??
      normalizedFallbackUnit ??
      DEFAULT_MEASUREMENT_UNIT.name;

    return {
      ...DEFAULT_MEASUREMENT_UNIT,
      id:
        measurementUnitId ??
        (normalizedFallbackUnit &&
        normalizedFallbackUnit !== DEFAULT_MEASUREMENT_UNIT.short_name
          ? ''
          : DEFAULT_MEASUREMENT_UNIT.id),
      name: measurementUnitName,
      company_id: companyId ?? '',
      short_name: measurementUnitShortName,
      precision:
        this.optionalString(metadata.measurement_unit_precision) ??
        DEFAULT_MEASUREMENT_UNIT.precision,
      is_default:
        !measurementUnitId &&
        (!normalizedFallbackUnit ||
          normalizedFallbackUnit === DEFAULT_MEASUREMENT_UNIT.short_name),
    };
  }

  private resolveMeasurementTypeValue(
    value: string | undefined | null,
    measurementUnitShortName?: string | null,
  ) {
    const normalizedValue = this.optionalString(value);
    const normalizedShortName = this.normalizeMeasurementUnitShortName(
      measurementUnitShortName,
    );

    if (
      !normalizedValue ||
      normalizedValue.toLowerCase() === 'unit' ||
      normalizedValue.toLowerCase() === 'countable'
    ) {
      return normalizedShortName ?? normalizedValue ?? '';
    }

    return normalizedValue;
  }

  private normalizeMeasurementUnitShortName(value?: string | null) {
    const normalizedValue = this.optionalString(value);
    if (!normalizedValue) {
      return null;
    }

    if (
      normalizedValue.toLowerCase() === 'unit' ||
      normalizedValue.toLowerCase() === 'countable'
    ) {
      return DEFAULT_MEASUREMENT_UNIT.short_name;
    }

    return normalizedValue;
  }

  private normalizeMeasurementUnitName(value?: string | null) {
    const normalizedValue = this.optionalString(value);
    if (!normalizedValue) {
      return null;
    }

    if (
      normalizedValue.toLowerCase() === 'unit' ||
      normalizedValue.toLowerCase() === 'countable'
    ) {
      return DEFAULT_MEASUREMENT_UNIT.name;
    }

    return normalizedValue;
  }

  private buildCatalogMetadata(
    body: Record<string, unknown>,
    description: string | undefined,
    options: {
      isVariative: boolean;
      selectedAttributes: Prisma.InputJsonObject[];
      variants: Prisma.InputJsonObject[];
    },
    measurementUnit?: {
      id: string;
      name: string;
      company_id: string;
      short_name: string;
      precision: string;
      is_editable: boolean;
      is_default: boolean;
    } | null,
    context?: {
      companyId?: string | null;
    },
    existingMetadata?: Record<string, unknown> | null,
  ): Prisma.InputJsonObject {
    const firstShopPrice = Array.isArray(body.shop_prices)
      ? body.shop_prices.find(
          (item): item is Record<string, unknown> =>
            !!item && typeof item === 'object',
        )
      : undefined;
    return {
      brand_id:
        this.optionalString(body.brand_id) ??
        this.optionalString(existingMetadata?.brand_id) ??
        null,
      brand_name:
        this.optionalString(body.brand_name) ??
        this.optionalString(existingMetadata?.brand_name) ??
        null,
      description:
        description ??
        this.optionalString(existingMetadata?.description) ??
        null,
      measurement_unit_id:
        measurementUnit?.id ??
        this.optionalString(body.measurement_unit_id) ??
        this.optionalString(existingMetadata?.measurement_unit_id) ??
        null,
      measurement_unit_name:
        measurementUnit?.name ??
        this.normalizeMeasurementUnitName(
          this.optionalString(existingMetadata?.measurement_unit_name),
        ) ??
        null,
      measurement_unit_short_name:
        measurementUnit?.short_name ??
        this.normalizeMeasurementUnitShortName(
          this.optionalString(existingMetadata?.measurement_unit_short_name),
        ) ??
        null,
      measurement_unit_precision:
        measurementUnit?.precision ??
        this.optionalString(existingMetadata?.measurement_unit_precision) ??
        null,
      company_id:
        context?.companyId ??
        this.optionalString(body.company_id) ??
        this.optionalString(existingMetadata?.company_id) ??
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
    const normalizedBranchCodes = [
      ...new Set(
        branchCodes.map((branchCode) => branchCode.trim()).filter(Boolean),
      ),
    ];
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

  private formatDateTime(value: Date, companyId?: string | null) {
    return this.companySettingsService.formatDateTimeForCompany(
      value,
      companyId ?? undefined,
    );
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
      return this.normalizeProductPhotoValue(firstImage);
    }

    if (firstImage && typeof firstImage === 'object') {
      return this.normalizeProductPhotoValue(
        this.optionalString((firstImage as Record<string, unknown>).url),
      );
    }

    return undefined;
  }

  private normalizeProductPhotoValue(value: string | null | undefined) {
    const src = String(value ?? '').trim();
    if (!src) {
      return undefined;
    }

    if (/^(https?:)?\/\//i.test(src) || src.startsWith('data:')) {
      return src;
    }

    if (src.startsWith('/uploads/')) {
      const origin =
        process.env.APP_URL?.trim() ||
        `http://localhost:${process.env.PORT?.trim() || '3001'}`;

      return `${origin}${src}`;
    }

    if (!src.includes('/')) {
      return this.buildProductPhotoUrl(src);
    }

    return src;
  }

  private buildProductPhotoUrl(fileName: string) {
    const origin =
      process.env.APP_URL?.trim() ||
      `http://localhost:${process.env.PORT?.trim() || '3001'}`;

    return `${origin}/uploads/products/${fileName}`;
  }
}

