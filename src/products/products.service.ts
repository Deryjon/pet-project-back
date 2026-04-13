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
  action: 'create' | 'update' | 'error';
  raw: ImportRowInput;
};

type ImportSession = {
  id: string;
  jobId: string;
  companyId: string;
  shopId: string;
  branchCode: string;
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

type ImportJob = {
  correlation_id: string;
  message: string;
  total: number;
  current: number;
  percent: number;
  is_finished: boolean;
  importId: string;
};

type ImportFieldResolution = 'keep_store' | 'from_file';

type ImportOnMatchPolicy = {
  name: ImportFieldResolution;
  brand: ImportFieldResolution;
  category: ImportFieldResolution;
  description: ImportFieldResolution;
  measurementUnit: ImportFieldResolution;
  supplier: ImportFieldResolution;
};

type ImportDryRunSummary = {
  create_count: number;
  update_count: number;
  error_count: number;
  conflict_fields: Record<string, number>;
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
    const branchCode = await this.resolveBranchCodeForWrite(shopId, writeContext);
    const rows = this.extractImportRows(body);
    const fields = this.extractImportFields(body);
    const onMatchPolicy =
      this.extractImportOnMatchPolicy(body) ?? this.defaultImportOnMatchPolicy();
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

    await this.persistImportSession(session);

    return {
      ...this.toImportSessionSummary(session),
    };
  }

  async listImports(
    query: { page?: number; limit?: number },
    authorization?: string,
  ) {
    const context = await this.getImportSessionContext(authorization);
    const safePage = Math.max(1, query.page ?? 1);
    const safeLimit = Math.min(Math.max(1, query.limit ?? 10), 100);
    const sessions = await this.importSessionDelegate().findMany({
      where: this.buildImportSessionWhere(context),
      orderBy: {
        createdAt: 'desc',
      },
      skip: (safePage - 1) * safeLimit,
      take: safeLimit,
    });
    const total = await this.importSessionDelegate().count({
      where: this.buildImportSessionWhere(context),
    });
    const items = sessions
      .map((session) => this.mapImportSessionRecord(session))
      .map((session) => this.toImportSessionSummary(session));

    return {
      count: total,
      items,
    };
  }

  async getImportById(id: string, authorization?: string) {
    const context = await this.getImportSessionContext(authorization);
    const session = await this.resolveImportSession(id, context);
    if (!session) {
      throw new NotFoundException('Import session not found');
    }

    return {
      ...this.toImportSessionSummary(session),
      fields: session.fields,
      rows_count: session.rows.length,
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
    const companyId = this.resolveImportCompanyId(body, writeContext);
    const shopId = this.requireString(body.shop_id, 'shop_id');
    const branchCode = await this.resolveBranchCodeForWrite(shopId, writeContext);
    const rows = this.extractImportRows(body);
    const importId =
      this.optionalString(body.import_id) ??
      this.optionalString(body.id) ??
      randomUUID();
    const existingSession = await this.resolveImportSession(importId, writeContext);
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
      mode: existingSession?.mode ?? this.parseImportMode(body.mode),
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
    await this.persistImportSession(session);

    await this.persistImportJob({
      id: jobId,
      correlation_id: importId,
      message: 'product-load',
      total: rows.length,
      current: rows.length,
      percent: 100,
      is_finished: true,
      importId,
    }, companyId);

    return {
      message: jobId,
      correlation_id: importId,
      import_id: importId,
      dry_run_summary: dryRunSummary,
    };
  }

  async getImportProgress(id: string, authorization?: string) {
    const context = await this.getImportSessionContext(authorization);
    const jobRecord = await this.importJobDelegate().findUnique({
      where: { id },
    });
    const job = jobRecord ? this.mapImportJobRecord(jobRecord) : null;
    const session = job ? await this.resolveImportSession(job.importId, context) : null;
    if (!job || !session) {
      throw new NotFoundException('Import job not found');
    }

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

  async getImportItemsDp(id: string, authorization?: string) {
    const context = await this.getImportSessionContext(authorization);
    const session = await this.resolveImportSession(id, context);
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
    authorization?: string,
  ) {
    const context = await this.getImportSessionContext(authorization);
    const session = await this.resolveImportSession(id, context);
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
      dry_run_summary: session.dryRunSummary ?? this.buildImportDryRunSummary(session.items),
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
    const branchCode = await this.resolveBranchCodeForWrite(shopId, writeContext);
    const rows = this.extractImportRows(body);
    const onMatchPolicy =
      this.extractImportOnMatchPolicy(body) ?? this.defaultImportOnMatchPolicy();
    const now = this.formatDateTime(new Date());
    const importId = randomUUID();
    const result = await this.applyImportRows(
      rows,
      companyId,
      branchCode,
      onMatchPolicy,
    );

    await this.persistImportSession({
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
      items: [],
      onMatchPolicy,
      dryRunSummary: undefined,
      result,
      createdAt: now,
      updatedAt: now,
    });

    return {
      import_id: importId,
      ...result,
    };
  }

  async commitImport(id: string, authorization?: string) {
    const context = await this.getRequestContext(authorization);
    const writeContext = this.requireCatalogWriteContext(context);
    const session = await this.resolveImportSession(id, writeContext);
    if (!session) {
      throw new NotFoundException('Import session not found');
    }

    if (session.status === 'cancelled' || session.status === 'failed') {
      throw new BadRequestException(
        `Cannot commit import session with status "${session.status}"`,
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
      const result = await this.applyImportRows(
        session.items
          .filter((item) => item.action !== 'error')
          .map((item) => item.raw),
        session.companyId,
        session.branchCode,
        session.onMatchPolicy,
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
    } catch (error) {
      session.status = 'failed';
      session.updatedAt = this.formatDateTime(new Date());
      await this.persistImportSession(session);
      throw error;
    } finally {
      IMPORT_COMMIT_LOCKS.delete(session.id);
    }

    return {
      import_id: session.id,
      ...session.result,
    };
  }

  async cancelImport(id: string, authorization?: string) {
    const context = await this.getImportSessionContext(authorization);
    const session = await this.resolveImportSession(id, context);
    if (!session) {
      throw new NotFoundException('Import session not found');
    }

    if (session.status === 'completed') {
      throw new BadRequestException('Completed import cannot be cancelled');
    }

    session.status = 'cancelled';
    session.updatedAt = this.formatDateTime(new Date());
    await this.persistImportSession(session);

    return this.toImportSessionSummary(session);
  }

  private async resolveImportSession(
    id: string,
    context?: {
      userType?: string;
      companyId?: string | null;
    } | null,
  ) {
    const directSession = await this.importSessionDelegate().findFirst({
      where: {
        id,
        ...this.buildImportSessionWhere(context),
      },
    });
    if (directSession) {
      return this.mapImportSessionRecord(directSession);
    }

    const job = await this.importJobDelegate().findUnique({
      where: { id },
    });
    if (!job) {
      return undefined;
    }

    const session = await this.importSessionDelegate().findFirst({
      where: {
        id: job.importId,
        ...this.buildImportSessionWhere(context),
      },
    });
    if (!session) {
      return undefined;
    }

    return this.mapImportSessionRecord(session);
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

  private parseImportMode(value: unknown): 'with_check' | 'without_check' {
    return value === 'without_check' ? 'without_check' : 'with_check';
  }

  private defaultImportOnMatchPolicy(): ImportOnMatchPolicy {
    return {
      name: 'keep_store',
      brand: 'keep_store',
      category: 'keep_store',
      description: 'keep_store',
      measurementUnit: 'keep_store',
      supplier: 'keep_store',
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
    ]);

    for (const key of Object.keys(policy)) {
      if (!allowedKeys.has(key) && strict) {
        throw new BadRequestException(`on_match.${key} is not supported`);
      }
    }

    return {
      name: this.parseImportFieldResolution(policy.name, 'name', strict),
      brand: this.parseImportFieldResolution(policy.brand, 'brand', strict),
      category: this.parseImportFieldResolution(policy.category, 'category', strict),
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
      supplier: this.parseImportFieldResolution(policy.supplier, 'supplier', strict),
    };
  }

  private shouldUseFileValue(value: ImportFieldResolution) {
    return value === 'from_file';
  }

  private buildImportDryRunSummary(items: PreparedImportItem[]): ImportDryRunSummary {
    const summary: ImportDryRunSummary = {
      create_count: 0,
      update_count: 0,
      error_count: 0,
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

      for (const field of item.different_fields) {
        summary.conflict_fields[field] = (summary.conflict_fields[field] ?? 0) + 1;
      }
    }

    return summary;
  }

  private toImportSessionSummary(session: ImportSession) {
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
      created_at: session.createdAt,
      updated_at: session.updatedAt,
      rows_count: session.rows.length,
      on_match: session.onMatchPolicy,
      dry_run_summary: session.dryRunSummary ?? null,
      result: session.result ?? null,
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

  private async getImportSessionContext(authorization?: string) {
    const context = await this.getRequestContext(authorization);
    return this.requireCatalogWriteContext(context);
  }

  private buildImportSessionWhere(context?: {
    userType?: string;
    companyId?: string | null;
  } | null): Record<string, unknown> {
    if (context?.userType === 'company') {
      return {
        companyId: context.companyId ?? '',
      };
    }

    return {};
  }

  private canAccessImportSession(
    session: ImportSession,
    context?: {
      userType?: string;
      companyId?: string | null;
    } | null,
  ) {
    if (!context) {
      return false;
    }

    if (context.userType === 'platform') {
      return true;
    }

    if (context.userType === 'company') {
      return context.companyId === session.companyId;
    }

    return false;
  }

  private mapImportSessionRecord(record: {
    id: string;
    jobId: string | null;
    companyId: string;
    shopId: string;
    branchCode: string;
    name: string;
    mode: string;
    status: string;
    fields: Prisma.JsonValue;
    rows: Prisma.JsonValue;
    items: Prisma.JsonValue;
    onMatchPolicy: Prisma.JsonValue;
    dryRunSummary: Prisma.JsonValue | null;
    result: Prisma.JsonValue | null;
    createdAt: Date;
    updatedAt: Date;
  }): ImportSession {
    return {
      id: record.id,
      jobId: record.jobId ?? '',
      companyId: record.companyId,
      shopId: record.shopId,
      branchCode: record.branchCode,
      name: record.name,
      mode: record.mode as ImportSession['mode'],
      status: record.status as ImportSession['status'],
      fields: Array.isArray(record.fields)
        ? (record.fields as ImportSession['fields'])
        : [],
      rows: Array.isArray(record.rows)
        ? (record.rows as ImportRowInput[])
        : [],
      items: Array.isArray(record.items)
        ? (record.items as PreparedImportItem[])
        : [],
      onMatchPolicy: record.onMatchPolicy as ImportOnMatchPolicy,
      dryRunSummary:
        (record.dryRunSummary as ImportDryRunSummary | null) ?? undefined,
      result:
        (record.result as ImportSession['result'] | null) ?? undefined,
      createdAt: this.formatDateTime(record.createdAt),
      updatedAt: this.formatDateTime(record.updatedAt),
    };
  }

  private mapImportJobRecord(record: {
    id: string;
    correlationId: string;
    message: string;
    total: number;
    current: number;
    percent: number;
    isFinished: boolean;
    importId: string;
  }): ImportJob & { id: string } {
    return {
      id: record.id,
      correlation_id: record.correlationId,
      message: record.message,
      total: record.total,
      current: record.current,
      percent: record.percent,
      is_finished: record.isFinished,
      importId: record.importId,
    };
  }

  private importSessionDelegate() {
    return (this.prisma as PrismaService & {
      importSession: {
        findMany: (args: Record<string, unknown>) => Promise<any[]>;
        count: (args: Record<string, unknown>) => Promise<number>;
        findFirst: (args: Record<string, unknown>) => Promise<any | null>;
        upsert: (args: Record<string, unknown>) => Promise<any>;
      };
    }).importSession;
  }

  private importJobDelegate() {
    return (this.prisma as PrismaService & {
      importJob: {
        findUnique: (args: Record<string, unknown>) => Promise<any | null>;
        upsert: (args: Record<string, unknown>) => Promise<any>;
      };
    }).importJob;
  }

  private async persistImportSession(session: ImportSession) {
    await this.importSessionDelegate().upsert({
      where: {
        id: session.id,
      },
      create: {
        id: session.id,
        jobId: session.jobId || null,
        companyId: session.companyId,
        shopId: session.shopId,
        branchCode: session.branchCode,
        name: session.name,
        mode: session.mode,
        status: session.status,
        fields: session.fields as Prisma.InputJsonValue,
        rows: session.rows as Prisma.InputJsonValue,
        items: session.items as Prisma.InputJsonValue,
        onMatchPolicy: session.onMatchPolicy as Prisma.InputJsonValue,
        dryRunSummary:
          (session.dryRunSummary as Prisma.InputJsonValue | undefined) ?? undefined,
        result: (session.result as Prisma.InputJsonValue | undefined) ?? undefined,
        createdAt: new Date(session.createdAt),
        updatedAt: new Date(session.updatedAt),
      },
      update: {
        jobId: session.jobId || null,
        shopId: session.shopId,
        branchCode: session.branchCode,
        name: session.name,
        mode: session.mode,
        status: session.status,
        fields: session.fields as Prisma.InputJsonValue,
        rows: session.rows as Prisma.InputJsonValue,
        items: session.items as Prisma.InputJsonValue,
        onMatchPolicy: session.onMatchPolicy as Prisma.InputJsonValue,
        dryRunSummary:
          (session.dryRunSummary as Prisma.InputJsonValue | undefined) ?? Prisma.JsonNull,
        result:
          (session.result as Prisma.InputJsonValue | undefined) ?? Prisma.JsonNull,
        updatedAt: new Date(session.updatedAt),
      },
    });
  }

  private async persistImportJob(
    job: ImportJob & { id: string },
    companyId: string,
  ) {
    await this.importJobDelegate().upsert({
      where: {
        id: job.id,
      },
      create: {
        id: job.id,
        correlationId: job.correlation_id,
        message: job.message,
        total: job.total,
        current: job.current,
        percent: job.percent,
        isFinished: job.is_finished,
        importId: job.importId,
        companyId,
      },
      update: {
        correlationId: job.correlation_id,
        message: job.message,
        total: job.total,
        current: job.current,
        percent: job.percent,
        isFinished: job.is_finished,
        importId: job.importId,
        companyId,
      },
    });
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
    const productCompanyId = this.resolveProductCompanyId(body, context);
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
      const existing = await this.prisma.product.findFirst({
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
    const existing = await this.prisma.product.findFirst({
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

  private extractImportRows(body: Record<string, unknown>): ImportRowInput[] {
    if (!Array.isArray(body.rows)) {
      throw new BadRequestException('rows must be an array');
    }

    return body.rows.flatMap((row, index) => {
      if (!row || typeof row !== 'object' || Array.isArray(row)) {
        return [];
      }

      const item = row as Record<string, unknown>;
      const quantity = this.toInt(item.quantity) ?? 0;
      const supplyPrice = this.toNumber(item.supply_price) ?? 0;
      const retailPrice = this.toNumber(item.retail_price) ?? 0;
      const name = this.optionalString(item.name);

      return [{
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
      }].map(({ rowNumber, ...prepared }) => {
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
    const currencyCode =
      this.companySettingsService.getDefaultCurrencyIsoCode(
        contextCompanyId ?? companyId,
      );

    const items: PreparedImportItem[] = [];
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      let existingProduct: CatalogProductWithRelations | null = null;
      let error = this.validateImportRow(row);

      if (!error) {
        try {
          existingProduct = await this.findImportMatchedProduct(companyId, row);
        } catch (matchError) {
          error =
            matchError instanceof Error
              ? matchError.message
              : 'Failed to match import row';
        }
      }

      const differentFields = this.collectDifferentFields(existingProduct, row);

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
        measurement_type: 'COUNTABLE',
        measurement_value: row.quantity,
        measurement_unit: DEFAULT_MEASUREMENT_UNIT,
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
        error: error ?? undefined,
        action: error ? 'error' : existingProduct ? 'update' : 'create',
        raw: row,
      });
    }

    return items;
  }

  private validateImportRow(row: ImportRowInput) {
    if (row.quantity <= 0) {
      return 'quantity must be greater than 0';
    }

    if (row.retailPrice < row.supplyPrice) {
      return 'retail_price cannot be lower than supply_price';
    }

    if (!row.name && !row.sku && !row.barcode) {
      return 'row must contain at least one identifier';
    }

    return null;
  }

  private async findImportMatchedProduct(companyId: string, row: ImportRowInput) {
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
  ) {
    if (!product) {
      return [];
    }

    const differentFields: string[] = [];

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

    return differentFields;
  }

  private toImportExistingProductResponse(
    product: CatalogProductWithRelations,
    branchCode: string,
  ) {
    const relevantStock = product.stocks.find(
      (stock) => stock.branchCode === branchCode,
    );
    const totalMeasurementValue = product.stocks.reduce(
      (sum, stock) => sum + stock.quantity,
      0,
    );

    return {
      id: String(product.id),
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
      measurement_unit: DEFAULT_MEASUREMENT_UNIT,
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
      product_supply_stock: [],
      status: 0,
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
    };
  }

  private async applyImportRows(
    rows: ImportRowInput[],
    companyId: string,
    branchCode: string,
    onMatchPolicy: ImportOnMatchPolicy,
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
            const matchedProduct = await this.findImportMatchedProduct(companyId, row);
            if (matchedProduct) {
              const changedFields = await this.applyImportUpdate(
                matchedProduct.id,
                row,
                companyId,
                branchCode,
                onMatchPolicy,
              );

              return {
                action: 'update' as const,
                productId: matchedProduct.id,
                changedFields,
              };
            }

            const createdProduct = await this.applyImportCreate(row, companyId, branchCode);
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
    branchCode: string,
  ) {
    const identifiers = await this.resolveIdentifiersForImportCreate(row, companyId);
    const createdProduct = await this.prisma.product.create({
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
        metadata: this.buildImportMetadata(companyId, row.description ?? ''),
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

    return createdProduct;
  }

  private async applyImportUpdate(
    productId: number,
    row: ImportRowInput,
    companyId: string,
    branchCode: string,
    onMatchPolicy: ImportOnMatchPolicy,
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

      if (existingStock) {
        await tx.productStock.update({
          where: {
            id: existingStock.id,
          },
          data: {
            quantity: existingStock.quantity + row.quantity,
            purchasePrice: row.supplyPrice,
            salePrice: row.retailPrice,
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
            quantity: row.quantity,
            purchasePrice: row.supplyPrice,
            salePrice: row.retailPrice,
          },
        });
        changedFields.push({
          field: 'quantity',
          reason: 'new_stock_row_created',
        });
      }

      changedFields.push({
        field: 'purchasePrice',
        reason: 'replaced_with_last_arrival',
      });
      changedFields.push({
        field: 'salePrice',
        reason: 'replaced_with_last_arrival',
      });

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
          purchasePrice: row.supplyPrice,
          salePrice: row.retailPrice,
          quantity: allStocks.reduce((sum, stock) => sum + stock.quantity, 0),
          unit:
            this.shouldUseFileValue(onMatchPolicy.measurementUnit) &&
            row.measurementUnit
              ? row.measurementUnit
              : undefined,
          metadata: this.buildImportMetadata(
            companyId,
            this.shouldUseFileValue(onMatchPolicy.description)
              ? row.description ?? ''
              : this.resolveDescriptionFromMetadata(existingProduct.metadata),
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
    });

    if (this.shouldUseFileValue(onMatchPolicy.name) && row.name) {
      changedFields.push({
        field: 'name',
        reason: 'updated_from_file_by_policy',
      });
    }
    if (this.shouldUseFileValue(onMatchPolicy.measurementUnit) && row.measurementUnit) {
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

    throw new BadRequestException(`Unable to generate unique ${field} for import`);
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

  private async withImportProductLock<T>(key: string, callback: () => Promise<T>) {
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

  private buildImportMetadata(companyId: string, description: string) {
    return {
      company_id: companyId,
      description,
      imported: true,
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

  private applyProductScope(where: Prisma.ProductWhereInput | undefined, context: any) {
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
