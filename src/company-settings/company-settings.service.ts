import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

type CurrencyConfig = {
  id: string;
  name: string;
  symbol: string;
  iso_code: string;
  exchange_rate: number;
  precision: number;
};

type CompanyCurrencyConfig = {
  id: string;
  company_id: string;
  currency: CurrencyConfig;
  is_editable: boolean;
};

type CountryItem = {
  id: string;
  name: string;
  code: string;
};

type TimeZoneItem = {
  id: string;
  country_id: string;
  name: string;
  short_name: string;
  gmt_offset: string;
};

type CompanyTariff = Record<string, unknown>;
type CompanyProfile = Record<string, unknown>;
type ShopProfile = Record<string, unknown>;
type CompanyPaymentType = Record<string, unknown>;
type CashBoxProfile = Record<string, unknown>;
type ChequeProfile = Record<string, unknown>;
type MeasurementUnitProfile = Record<string, unknown>;
type PriceTagProfile = Record<string, unknown>;

const DEFAULT_COMPANY_ID =
  process.env.COMPANY_ID ?? '3b791c40-5394-49ea-8779-fcf8af1459ee';
const DEFAULT_CURRENCY_NAME = process.env.DEFAULT_CURRENCY_NAME ?? 'Сум';
const DEFAULT_CURRENCY_SYMBOL = process.env.DEFAULT_CURRENCY_SYMBOL ?? "so'm";
const DEFAULT_CURRENCY_ISO_CODE =
  process.env.DEFAULT_CURRENCY_ISO_CODE ?? 'UZS';
const DEFAULT_CURRENCY_EXCHANGE_RATE = Number(
  process.env.DEFAULT_CURRENCY_EXCHANGE_RATE ?? '1',
);
const DEFAULT_CURRENCY_PRECISION = Number(
  process.env.DEFAULT_CURRENCY_PRECISION ?? '0',
);
const DEFAULT_CURRENCY_EDITABLE =
  String(process.env.DEFAULT_CURRENCY_EDITABLE ?? 'false').toLowerCase() ===
  'true';
const DEFAULT_CURRENCY_CONFIG_ID =
  process.env.DEFAULT_CURRENCY_CONFIG_ID ??
  '810ee86f-ce2d-4de0-a9f0-635aff745a48';
const DEFAULT_CURRENCY_ID =
  process.env.DEFAULT_CURRENCY_ID ?? '925d8f76-70f8-4a4c-ada8-0e61a906b56e';

const DEFAULT_COUNTRIES: CountryItem[] = [
  { id: 'ce6a779e-edd4-47c2-92de-751f0b0c2c7a', name: 'Казахстан', code: 'KZ' },
  {
    id: 'ff320c70-e85a-4e8f-ad16-1d08c48e54ba',
    name: 'Кыргызстан',
    code: 'KG',
  },
  {
    id: 'c5df2f41-0b7b-4bcb-b8cb-afca59ac143a',
    name: 'Узбекистан',
    code: 'UZ',
  },
];

const DEFAULT_TIME_ZONES: TimeZoneItem[] = [
  {
    id: '77541aa3-eab8-4fa0-9086-f790a33c5d2b',
    country_id: 'c5df2f41-0b7b-4bcb-b8cb-afca59ac143a',
    name: 'Ташкент',
    short_name: 'Asia/Tashkent',
    gmt_offset: '+05:00',
  },
  {
    id: 'dd2139d9-2af6-4024-aef6-5d15419e7458',
    country_id: '',
    name: 'Самарканд',
    short_name: 'Asia/Samarkand',
    gmt_offset: '+05:00',
  },
];

const DEFAULT_COMPANY_PROFILE: CompanyProfile = {
  id: DEFAULT_COMPANY_ID,
  country_id: '',
  time_zone_id: '',
  name: process.env.COMPANY_NAME ?? 'Konkurentcases',
  email: '',
  legal_name: '',
  address: '',
  legal_country_id: '',
  postcode: '',
  inn: '',
  mfo: '',
  bank_accounts: [],
  subdomen: process.env.COMPANY_SUBDOMAIN ?? 'konkurentcases',
  is_active: true,
  last_order: null,
  created_at: '',
  shops_count: 2,
  last_purchase_date: '',
  segment_id: '',
  segment_name: '',
  is_blocked: false,
  time_zone_name: 'Asia/Tashkent',
  time_zone_gmt: '+05:00',
  is_paid: false,
  is_test: false,
  login_from_web: true,
  finances_enabled: false,
  sales_manager: '',
  service_manager: '',
  link_to_amocrm: '',
  chargebee_client_id: '',
  cashbox_mode: 'default',
  default_product_class_code: '',
  default_product_package_code: '',
  legal_group: 'legal',
  contract_number: '',
  contract_date: '',
  onboarding_type: 'manual_service',
};

const DEFAULT_COMPANY_TARIFF: CompanyTariff = {
  id: 0,
  billz_company_id: DEFAULT_COMPANY_ID,
  status: 'active',
  billing_period_unit: 'month',
  billing_period: 1,
  currency_code: DEFAULT_CURRENCY_ISO_CODE,
  exchange_rate: DEFAULT_CURRENCY_EXCHANGE_RATE,
  base_currency_code: DEFAULT_CURRENCY_ISO_CODE,
  due_invoices_count: 0,
  total_dues: 0,
  mrr: 0,
  internal_status: 'active',
  info_state: 'active',
  info_date: '',
  info_next_date: '',
};

const DEFAULT_COMPANY_PAYMENT_TYPES: CompanyPaymentType[] = [
  {
    id: '41839fa3-4121-4572-ab19-394e3a7319fe',
    company_id: DEFAULT_COMPANY_ID,
    name: 'Наличные',
    token: '',
    is_editable: false,
    dont_show_in_make_payment: false,
    dont_show_in_settings: false,
    is_cash_payment_type: true,
    payment_type: {
      id: '00ed9cff-9576-432f-849b-7bbcc2fed640',
      name: 'Кастомный',
    },
  },
  {
    id: '611aeb8e-2aba-4b63-9a7e-3eeb96151fb4',
    company_id: DEFAULT_COMPANY_ID,
    name: 'Карта',
    token: '',
    is_editable: false,
    dont_show_in_make_payment: false,
    dont_show_in_settings: false,
    is_cash_payment_type: false,
    payment_type: {
      id: '00ed9cff-9576-432f-849b-7bbcc2fed640',
      name: 'Кастомный',
    },
  },
  {
    id: 'a1936be5-92c9-4b8d-a142-c8caeca34196',
    company_id: DEFAULT_COMPANY_ID,
    name: 'Certificate',
    token: '',
    is_editable: false,
    dont_show_in_make_payment: false,
    dont_show_in_settings: false,
    is_cash_payment_type: false,
    payment_type: {
      id: '86eb2a13-0a4e-410f-8bfd-759427b11a80',
      name: 'Сертификат',
    },
  },
  {
    id: 'e4ac5ce7-9bd6-4dd9-9ab8-847b82fa007c',
    company_id: DEFAULT_COMPANY_ID,
    name: 'Voucher',
    token: '',
    is_editable: false,
    dont_show_in_make_payment: false,
    dont_show_in_settings: false,
    is_cash_payment_type: false,
    payment_type: {
      id: '5070b973-97a7-4400-8263-edf5f8b224e2',
      name: 'Ваучер',
    },
  },
  {
    id: 'a55db462-8d14-4243-8c01-370bc4d71dc6',
    company_id: DEFAULT_COMPANY_ID,
    name: 'Перевод на карту',
    token: '',
    is_editable: true,
    dont_show_in_make_payment: false,
    dont_show_in_settings: false,
    is_cash_payment_type: false,
    payment_type: {
      id: '00ed9cff-9576-432f-849b-7bbcc2fed640',
      name: 'Кастомный',
    },
  },
  {
    id: '3d798d63-b2fc-4f3a-ba9b-e293520c3a30',
    company_id: DEFAULT_COMPANY_ID,
    name: 'Click QR',
    token: '',
    is_editable: true,
    dont_show_in_make_payment: false,
    dont_show_in_settings: false,
    is_cash_payment_type: false,
    payment_type: {
      id: '00ed9cff-9576-432f-849b-7bbcc2fed640',
      name: 'Кастомный',
    },
  },
  {
    id: 'e5611782-9cda-418d-a12f-9435df0424f1',
    company_id: DEFAULT_COMPANY_ID,
    name: 'Solfy',
    token: '',
    is_editable: true,
    dont_show_in_make_payment: false,
    dont_show_in_settings: false,
    is_cash_payment_type: false,
    payment_type: {
      id: '00ed9cff-9576-432f-849b-7bbcc2fed640',
      name: 'Кастомный',
    },
  },
  {
    id: '99637023-f622-4b43-9802-dacbcb595ba8',
    company_id: DEFAULT_COMPANY_ID,
    name: 'PayME QR',
    token: '',
    is_editable: true,
    dont_show_in_make_payment: false,
    dont_show_in_settings: false,
    is_cash_payment_type: false,
    payment_type: {
      id: '00ed9cff-9576-432f-849b-7bbcc2fed640',
      name: 'Кастомный',
    },
  },
  {
    id: '08a4c91d-046c-4842-8345-732b5f5a08c0',
    company_id: DEFAULT_COMPANY_ID,
    name: 'UzumPay',
    token: '',
    is_editable: true,
    dont_show_in_make_payment: false,
    dont_show_in_settings: false,
    is_cash_payment_type: false,
    payment_type: {
      id: '00ed9cff-9576-432f-849b-7bbcc2fed640',
      name: 'Кастомный',
    },
  },
  {
    id: '48f7d9e8-30fc-4d39-8520-6c70dfb153a6',
    company_id: DEFAULT_COMPANY_ID,
    name: 'Баланс поставщика',
    token: '',
    is_editable: false,
    dont_show_in_make_payment: true,
    dont_show_in_settings: true,
    is_cash_payment_type: false,
    payment_type: {
      id: '6406dc66-6b92-4008-a081-2d1da545ab01',
      name: 'Баланс поставщика',
    },
  },
  {
    id: '4ed64c2c-ecfb-4f56-81e6-2c002882fe63',
    company_id: DEFAULT_COMPANY_ID,
    name: 'Olcha',
    token: '',
    is_editable: true,
    dont_show_in_make_payment: false,
    dont_show_in_settings: false,
    is_cash_payment_type: false,
    payment_type: {
      id: '00ed9cff-9576-432f-849b-7bbcc2fed640',
      name: 'Кастомный',
    },
  },
  {
    id: 'f7ad16d9-c307-4be3-baf2-08a18590936c',
    company_id: DEFAULT_COMPANY_ID,
    name: 'Payme Go',
    token: '',
    is_editable: false,
    dont_show_in_make_payment: false,
    dont_show_in_settings: false,
    is_cash_payment_type: false,
    payment_type: {
      id: 'bbfe5028-3b3e-4120-b407-65773f5bb258',
      name: 'Payme Go',
    },
  },
];

const DEFAULT_SHOPS: ShopProfile[] = [
  {
    id: 'be25385b-8db2-4d96-8240-f1bb6bb3420c',
    company_id: DEFAULT_COMPANY_ID,
    name: 'Globus Mall',
    branch_code: 'a',
    address: '',
    phone_numbers: [],
    cash_boxes_count: 1,
    cash_boxes: [
      {
        id: 'b55f4353-d49a-4eac-b698-35da8b710fc3',
        name: 'Касса Globus Mall',
        is_active: true,
        e_pos: 0,
        web_kassa: 0,
      },
    ],
  },
  {
    id: '11dc3536-e1ce-447b-aedb-ce3784c4b1ad',
    company_id: DEFAULT_COMPANY_ID,
    name: 'Samarqand Darvoza',
    branch_code: 'main',
    address: '',
    phone_numbers: [''],
    cash_boxes_count: 1,
    cash_boxes: [
      {
        id: '4624a925-1a9f-442d-85ca-24ec7a4946fd',
        name: 'Касса Konkurentcases',
        is_active: true,
        e_pos: 0,
        web_kassa: 0,
      },
    ],
  },
];

const DEFAULT_CASH_BOXES: CashBoxProfile[] = [
  {
    id: 'b55f4353-d49a-4eac-b698-35da8b710fc3',
    company_id: DEFAULT_COMPANY_ID,
    shop_id: 'be25385b-8db2-4d96-8240-f1bb6bb3420c',
    name: 'Касса Globus Mall',
    cheque_id: '00291d1d-9abe-41f5-8398-f05c12771735',
    e_pos: 0,
  },
  {
    id: '4624a925-1a9f-442d-85ca-24ec7a4946fd',
    company_id: DEFAULT_COMPANY_ID,
    shop_id: '11dc3536-e1ce-447b-aedb-ce3784c4b1ad',
    name: 'Касса Konkurentcases',
    cheque_id: '00291d1d-9abe-41f5-8398-f05c12771735',
    e_pos: 0,
  },
];

const DEFAULT_CHEQUES: ChequeProfile[] = [
  {
    id: '00291d1d-9abe-41f5-8398-f05c12771735',
    company_id: DEFAULT_COMPANY_ID,
    name: 'Стандартный чек',
    is_active: true,
  },
];

const DEFAULT_MEASUREMENT_UNIT: MeasurementUnitProfile = {
  id: '12a69bc0-c575-4586-9f0f-76e8295d4139',
  name: 'Штука',
  company_id: DEFAULT_COMPANY_ID,
  short_name: 'шт',
  precision: '1',
  is_editable: false,
  is_default: true,
};

const DEFAULT_PRICE_TAGS: PriceTagProfile[] = [
  {
    id: '157cb24e-4d81-4aee-a199-29a79c7e2617',
    company_id: DEFAULT_COMPANY_ID,
    name: 'маленький размер',
    width: 40,
    length: 20,
    barcode_type: 'CODE128',
    barcode_type_id: 'db83218c-a8d0-41fe-b981-c38d280321be',
    properties: null,
  },
  {
    id: 'fe27e598-45bb-4025-aa82-e001bd3dc88b',
    company_id: DEFAULT_COMPANY_ID,
    name: 'hh',
    width: 40,
    length: 20,
    barcode_type: 'CODE128',
    barcode_type_id: 'db83218c-a8d0-41fe-b981-c38d280321be',
    properties: null,
  },
  {
    id: '4c4a47e1-02ae-4fba-9cfb-1fa3746824ed',
    company_id: DEFAULT_COMPANY_ID,
    name: 'Ценник 1',
    width: 40,
    length: 20,
    barcode_type: 'EAN13',
    barcode_type_id: '5517af95-ea38-444e-bf19-90fe4e9e4df7',
    properties: null,
  },
];

@Injectable()
export class CompanySettingsService {
  private companyPaymentTypesStore?: CompanyPaymentType[];
  private priceTagsStore?: PriceTagProfile[];
  private chequesStore?: ChequeProfile[];

  constructor(private readonly prisma: PrismaService) {}

  private get db(): any {
    return this.prisma as any;
  }

  getDefaultCurrency(companyId?: string): CompanyCurrencyConfig {
    const targetCompanyId = companyId?.trim() || DEFAULT_COMPANY_ID;
    const map = this.parseJsonMap<CompanyCurrencyConfig>(
      process.env.COMPANY_CURRENCY_MAP_JSON,
    );
    const fromMap = targetCompanyId ? map[targetCompanyId] : undefined;

    return {
      id: fromMap?.id ?? DEFAULT_CURRENCY_CONFIG_ID,
      company_id: targetCompanyId,
      currency: {
        id: fromMap?.currency?.id ?? DEFAULT_CURRENCY_ID,
        name: fromMap?.currency?.name ?? DEFAULT_CURRENCY_NAME,
        symbol: fromMap?.currency?.symbol ?? DEFAULT_CURRENCY_SYMBOL,
        iso_code: fromMap?.currency?.iso_code ?? DEFAULT_CURRENCY_ISO_CODE,
        exchange_rate:
          fromMap?.currency?.exchange_rate ?? DEFAULT_CURRENCY_EXCHANGE_RATE,
        precision: fromMap?.currency?.precision ?? DEFAULT_CURRENCY_PRECISION,
      },
      is_editable: fromMap?.is_editable ?? DEFAULT_CURRENCY_EDITABLE,
    };
  }

  getDefaultCurrencyIsoCode(companyId?: string): string {
    return this.getDefaultCurrency(companyId).currency.iso_code;
  }

  getCountries(limit?: number) {
    const countries = this.parseJsonArray<CountryItem>(
      process.env.COUNTRIES_JSON,
      DEFAULT_COUNTRIES,
    );

    return {
      count: countries.length,
      countries: countries.slice(0, this.normalizeLimit(limit, 1000)),
    };
  }

  getTimeZones(limit?: number, countryId?: string) {
    const timeZones = this.parseJsonArray<TimeZoneItem>(
      process.env.TIME_ZONES_JSON,
      DEFAULT_TIME_ZONES,
    );
    const filtered = countryId
      ? timeZones.filter((item) => item.country_id === countryId)
      : timeZones;

    return {
      count: filtered.length,
      time_zones: filtered.slice(0, this.normalizeLimit(limit, 1000)),
    };
  }

  getCompanyTariff() {
    const custom = this.parseJsonObject(process.env.COMPANY_TARIFF_JSON);

    return {
      ...DEFAULT_COMPANY_TARIFF,
      ...custom,
      billz_company_id:
        this.stringOrDefault(custom.billz_company_id, DEFAULT_COMPANY_ID) ??
        DEFAULT_COMPANY_ID,
    };
  }

  async getCompany() {
    const companyFromDb = await this.db.company.findFirst({
      where: {
        isActive: true,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    const custom = this.parseJsonObject(process.env.COMPANY_PROFILE_JSON);
    const merged: Record<string, unknown> = {
      ...DEFAULT_COMPANY_PROFILE,
      ...custom,
      ...(companyFromDb
        ? {
            id: companyFromDb.id,
            name: companyFromDb.name,
            subdomen: companyFromDb.subdomain,
            is_active: companyFromDb.isActive,
          }
        : {}),
    };

    const zones = this.parseJsonArray<TimeZoneItem>(
      process.env.TIME_ZONES_JSON,
      DEFAULT_TIME_ZONES,
    );
    const selectedZone = zones.find(
      (item) =>
        item.id === this.stringOrDefault(merged.time_zone_id, '') ||
        item.short_name === this.stringOrDefault(merged.time_zone_name, ''),
    );

    if (!selectedZone) {
      return merged;
    }

    return {
      ...merged,
      time_zone_id: merged.time_zone_id || selectedZone.id,
      time_zone_name: selectedZone.short_name,
      time_zone_gmt: selectedZone.gmt_offset,
    };
  }

  async getShops(query: {
    page?: number;
    limit?: number;
    name?: string;
    companyId?: string;
    allowedShopIds?: string[];
  }) {
    const safeLimit = this.normalizeLimit(query.limit, 10);
    const safePage = Math.max(1, Number(query.page) || 1);
    const normalizedName = (query.name ?? '').trim().toLowerCase();
    const companyId = query.companyId?.trim() || DEFAULT_COMPANY_ID;
    const dbShops = await this.db.shop.findMany({
      where: {
        companyId,
        ...(query.allowedShopIds?.length
          ? {
              id: {
                in: query.allowedShopIds,
              },
            }
          : {}),
        ...(normalizedName
          ? {
              name: {
                contains: normalizedName,
                mode: 'insensitive',
              },
            }
          : {}),
      },
      orderBy: {
        name: 'asc',
      },
    });

    if (dbShops.length) {
      return {
        count: dbShops.length,
        shops: dbShops
          .slice((safePage - 1) * safeLimit, safePage * safeLimit)
          .map((shop) => ({
            id: shop.id,
            company_id: shop.companyId,
            name: shop.name,
            branch_code: shop.branchCode,
            address: '',
            phone_numbers: [],
            cash_boxes_count: 0,
            cash_boxes: [],
            is_active: shop.isActive,
          })),
      };
    }

    return {
      count: 0,
      shops: [],
    };
  }

  async getShopById(id: string, companyId?: string) {
    const shopId = this.requireString(id, 'id');
    const targetCompanyId = companyId?.trim() || DEFAULT_COMPANY_ID;

    const dbShop = await this.db.shop.findFirst({
      where: {
        companyId: targetCompanyId,
        OR: [{ id: shopId }, { branchCode: shopId }],
      },
    });

    if (dbShop) {
      return {
        id: dbShop.id,
        company_id: dbShop.companyId,
        name: dbShop.name,
        branch_code: dbShop.branchCode,
        address: '',
        phone_numbers: [],
        facebook: '',
        instagram: '',
        telegram: '',
        website: '',
        working_hours: null,
        cash_boxes_count: 0,
        cash_boxes: [],
        is_active: dbShop.isActive,
      };
    }

    const shop = this.parseJsonArray<ShopProfile>(
      process.env.SHOPS_JSON,
      DEFAULT_SHOPS,
    ).find(
      (item) =>
        this.stringOrDefault(item.id, '') === shopId &&
        this.stringOrDefault(item.company_id, DEFAULT_COMPANY_ID) ===
          targetCompanyId,
    );

    if (!shop) {
      throw new NotFoundException('Shop not found');
    }

    return {
      ...shop,
      company_id: targetCompanyId,
      facebook: this.stringOrDefault(shop.facebook, ''),
      instagram: this.stringOrDefault(shop.instagram, ''),
      telegram: this.stringOrDefault(shop.telegram, ''),
      website: this.stringOrDefault(shop.website, ''),
      working_hours: shop.working_hours ?? null,
    };
  }

  getCompanyCurrencies(companyId?: string) {
    const defaultCurrency = this.getDefaultCurrency(companyId);

    return {
      company_currencies: [defaultCurrency],
      count: 1,
    };
  }

  getLoyaltyProgram(companyId?: string) {
    return {
      id: '',
      company_id: companyId?.trim() || DEFAULT_COMPANY_ID,
      is_active: false,
      name: '',
      type: '',
      cashback_percent: 0,
      bonus_percent: 0,
      levels: [],
      has_customer_balance: false,
      has_customer_debt: false,
    };
  }

  getMeasurementUnitById(id: string, companyId?: string) {
    const measurementUnitId = this.requireString(id, 'id');
    const targetCompanyId = companyId?.trim() || DEFAULT_COMPANY_ID;
    const configuredUnits = this.parseJsonArray<MeasurementUnitProfile>(
      process.env.MEASUREMENT_UNITS_JSON,
      [DEFAULT_MEASUREMENT_UNIT],
    );

    const matchedUnit = configuredUnits.find(
      (unit) => this.stringOrDefault(unit.id, '') === measurementUnitId,
    );

    if (matchedUnit) {
      return {
        ...matchedUnit,
        company_id: this.stringOrDefault(
          matchedUnit.company_id,
          targetCompanyId,
        ),
      };
    }

    return {
      ...DEFAULT_MEASUREMENT_UNIT,
      id: measurementUnitId,
      company_id: targetCompanyId,
      is_default: measurementUnitId === DEFAULT_MEASUREMENT_UNIT.id,
    };
  }

  getPriceTags(companyId?: string) {
    const priceTags = this.getStoredPriceTags();
    const targetCompanyId = companyId?.trim() || DEFAULT_COMPANY_ID;

    return {
      price_tags: priceTags
        .filter(
          (priceTag) =>
            this.stringOrDefault(priceTag.company_id, '') === targetCompanyId,
        )
        .map((priceTag) => ({
          ...priceTag,
          company_id: targetCompanyId,
        })),
    };
  }

  createPriceTag(body: Record<string, unknown>) {
    const priceTags = this.getStoredPriceTags();
    const companyId =
      this.optionalString(body.company_id) ?? DEFAULT_COMPANY_ID;

    const created: PriceTagProfile = {
      id: randomUUID(),
      company_id: companyId,
      name: this.requireString(body.name, 'name'),
      width: this.toNumber(body.width) ?? 40,
      length: this.toNumber(body.length) ?? 20,
      barcode_type: this.optionalString(body.barcode_type) ?? 'EAN13',
      barcode_type_id:
        this.optionalString(body.barcode_type_id) ??
        '5517af95-ea38-444e-bf19-90fe4e9e4df7',
      properties: body.properties ?? null,
    };

    priceTags.unshift(created);
    return created;
  }

  updatePriceTag(id: string, body: Record<string, unknown>) {
    const priceTags = this.getStoredPriceTags();
    const priceTag = priceTags.find(
      (item) => this.stringOrDefault(item.id, '') === id,
    );

    if (!priceTag) {
      throw new NotFoundException('Price tag not found');
    }

    if (body.company_id !== undefined) {
      priceTag.company_id = this.requireString(body.company_id, 'company_id');
    }

    if (body.name !== undefined) {
      priceTag.name = this.requireString(body.name, 'name');
    }

    if (body.width !== undefined) {
      const width = this.toNumber(body.width);
      if (width === undefined) {
        throw new BadRequestException('width must be a number');
      }
      priceTag.width = width;
    }

    if (body.length !== undefined) {
      const length = this.toNumber(body.length);
      if (length === undefined) {
        throw new BadRequestException('length must be a number');
      }
      priceTag.length = length;
    }

    if (body.barcode_type !== undefined) {
      priceTag.barcode_type = this.requireString(
        body.barcode_type,
        'barcode_type',
      );
    }

    if (body.barcode_type_id !== undefined) {
      priceTag.barcode_type_id = this.requireString(
        body.barcode_type_id,
        'barcode_type_id',
      );
    }

    if (body.properties !== undefined) {
      priceTag.properties = body.properties;
    }

    return priceTag;
  }

  deletePriceTag(id: string) {
    const priceTags = this.getStoredPriceTags();
    const index = priceTags.findIndex(
      (item) => this.stringOrDefault(item.id, '') === id,
    );

    if (index === -1) {
      throw new NotFoundException('Price tag not found');
    }

    const [deleted] = priceTags.splice(index, 1);

    return {
      success: true,
      price_tag: deleted,
    };
  }

  getCheque(query?: { name?: string; limit?: number; page?: number }) {
    const cheques = this.getStoredCheques();
    const normalizedName = (query?.name ?? '').trim().toLowerCase();
    const prepared = cheques
      .filter(
        (cheque) =>
          !normalizedName ||
          this.stringOrDefault(cheque.name, '')
            .toLowerCase()
            .includes(normalizedName),
      )
      .map((cheque, index) => this.toChequeResponse(cheque, index));
    const safeLimit = this.normalizeLimit(query?.limit, 100);
    const safePage = Math.max(1, Number(query?.page) || 1);

    return {
      cheques: prepared.slice((safePage - 1) * safeLimit, safePage * safeLimit),
      count: prepared.length,
    };
  }

  getChequeById(id: string) {
    const chequeId = this.requireString(id, 'id');
    const cheques = this.getStoredCheques();
    const index = cheques.findIndex(
      (cheque) => this.stringOrDefault(cheque.id, '') === chequeId,
    );

    if (index === -1) {
      throw new NotFoundException('Cheque not found');
    }

    return this.toChequeResponse(cheques[index], index);
  }

  createCheque(body: Record<string, unknown>) {
    const cheques = this.getStoredCheques();
    const chequeId = randomUUID();
    const created: ChequeProfile = {
      id: chequeId,
      name: this.optionalString(body.name) ?? 'Новый чек',
      company_id: this.optionalString(body.company_id) ?? DEFAULT_COMPANY_ID,
      has_logo: this.optionalBoolean(body.has_logo) ?? false,
      logo_image: this.objectOrDefault(body.logo_image, {
        id: '',
        file_name: '',
        file_url: '',
        container_height: 0,
        height: 0,
        width: 0,
        rotation: 0,
        x_axis: 0,
        y_axis: 0,
      }),
      has_information_block:
        this.optionalBoolean(body.has_information_block) ?? true,
      has_additional_info:
        this.optionalBoolean(body.has_additional_info) ?? true,
      has_lower_block: this.optionalBoolean(body.has_lower_block) ?? true,
      display_text:
        this.optionalString(body.display_text) ?? 'Спасибо за вашу покупку!',
      cheque_items: this.normalizeChequeItems(body.cheque_items, chequeId),
      has_bar_code: this.optionalBoolean(body.has_bar_code) ?? false,
      is_default: this.optionalBoolean(body.is_default) ?? cheques.length === 0,
      type: this.optionalString(body.type) ?? 'cheque',
      has_additional_image:
        this.optionalBoolean(body.has_additional_image) ?? false,
      additional_image: this.objectOrDefault(body.additional_image, {
        id: '',
        file_name: '',
        file_url: '',
        container_height: 0,
        height: 0,
        width: 0,
        rotation: 0,
        x_axis: 0,
        y_axis: 0,
      }),
      has_customer_debt: this.optionalBoolean(body.has_customer_debt) ?? false,
      has_customer_balance:
        this.optionalBoolean(body.has_customer_balance) ?? false,
      printed_with_billz: this.optionalBoolean(body.printed_with_billz) ?? true,
      logo_url: this.optionalString(body.logo_url) ?? '',
      width: this.toNumber(body.width) ?? 0,
      length: this.toNumber(body.length) ?? 0,
      x_axis: this.toNumber(body.x_axis) ?? 0,
      y_axis: this.toNumber(body.y_axis) ?? 0,
      rotation: this.toNumber(body.rotation) ?? 0,
      logo: this.optionalString(body.logo) ?? '',
      compact: this.optionalBoolean(body.compact) ?? false,
    };

    if (created.is_default) {
      for (const cheque of cheques) {
        cheque.is_default = false;
      }
    }

    cheques.unshift(created);
    return this.toChequeResponse(created, 0);
  }

  updateCheque(id: string, body: Record<string, unknown>) {
    const chequeId = this.requireString(id, 'id');
    const cheques = this.getStoredCheques();
    const index = cheques.findIndex(
      (cheque) => this.stringOrDefault(cheque.id, '') === chequeId,
    );

    if (index === -1) {
      throw new NotFoundException('Cheque not found');
    }

    const cheque = cheques[index];
    this.applyChequePatch(cheque, body);

    if (cheque.is_default) {
      for (const item of cheques) {
        if (item !== cheque) {
          item.is_default = false;
        }
      }
    }

    return this.toChequeResponse(cheque, index);
  }

  deleteCheque(id: string) {
    const chequeId = this.requireString(id, 'id');
    const cheques = this.getStoredCheques();
    const index = cheques.findIndex(
      (cheque) => this.stringOrDefault(cheque.id, '') === chequeId,
    );

    if (index === -1) {
      throw new NotFoundException('Cheque not found');
    }

    const [deleted] = cheques.splice(index, 1);

    if (deleted.is_default && cheques.length > 0) {
      cheques[0].is_default = true;
    }

    return {
      success: true,
      cheque: this.toChequeResponse(deleted, index),
    };
  }

  private toChequeResponse(cheque: ChequeProfile, index: number) {
    const chequeId = this.stringOrDefault(
      cheque.id,
      '00291d1d-9abe-41f5-8398-f05c12771735',
    );
    const name = this.stringOrDefault(cheque.name, 'Konkurent Cases');
    const logoUrl = this.stringOrDefault(cheque.logo_url, '');
    const logo = this.stringOrDefault(cheque.logo, '');

    return {
      id: chequeId,
      name,
      company_id: this.stringOrDefault(cheque.company_id, DEFAULT_COMPANY_ID),
      has_logo: Boolean(cheque.has_logo ?? logoUrl),
      logo_image: this.objectOrDefault(cheque.logo_image, {
        id: '',
        file_name: logo,
        file_url: logoUrl,
        container_height: 0,
        height: Number(cheque.length) || 0,
        width: Number(cheque.width) || 0,
        rotation: Number(cheque.rotation) || 0,
        x_axis: Number(cheque.x_axis) || 0,
        y_axis: Number(cheque.y_axis) || 0,
      }),
      has_information_block: cheque.has_information_block ?? true,
      has_additional_info: cheque.has_additional_info ?? true,
      has_lower_block: cheque.has_lower_block ?? true,
      display_text:
        this.stringOrDefault(cheque.display_text, '') ||
        'Спасибо за вашу покупку!',
      cheque_items: Array.isArray(cheque.cheque_items)
        ? cheque.cheque_items
        : this.buildDefaultChequeItems(chequeId),
      has_bar_code: cheque.has_bar_code ?? false,
      is_default: cheque.is_default ?? index === 0,
      type: this.stringOrDefault(cheque.type, 'cheque'),
      has_additional_image: cheque.has_additional_image ?? false,
      additional_image: this.objectOrDefault(cheque.additional_image, {
        id: '',
        file_name: '',
        file_url: '',
        container_height: 0,
        height: 0,
        width: 0,
        rotation: 0,
        x_axis: 0,
        y_axis: 0,
      }),
      has_customer_debt: cheque.has_customer_debt ?? false,
      has_customer_balance: cheque.has_customer_balance ?? false,
      printed_with_billz: cheque.printed_with_billz ?? true,
      logo_url: logoUrl,
      width: Number(cheque.width) || 0,
      length: Number(cheque.length) || 0,
      x_axis: Number(cheque.x_axis) || 0,
      y_axis: Number(cheque.y_axis) || 0,
      rotation: Number(cheque.rotation) || 0,
      logo,
      compact: cheque.compact ?? false,
    };
  }

  private buildDefaultChequeItems(chequeId: string) {
    const options = [
      ['', '', '', 1, true],
      [
        '7ab57cd3-eae8-4ef8-ac76-87306421f908',
        'information_block',
        'Название магазина',
        1,
        true,
      ],
      [
        '4dbc9d80-45b7-4abe-8726-61f736bd55d2',
        'information_block',
        'Дата',
        2,
        true,
      ],
      [
        'fe9b1a27-f46f-4f04-8758-b2a47f952e69',
        'information_block',
        'Режим работы',
        3,
        true,
      ],
      [
        'cff3f41d-0661-4623-a97e-851a8dfef40d',
        'information_block',
        'Продавец',
        4,
        true,
      ],
      [
        '10375cd3-73af-414f-92c8-4bff64503b9d',
        'information_block',
        'Кассир',
        5,
        true,
      ],
      [
        'c4183629-4073-4f73-8f10-bddd45bbce82',
        'information_block',
        'Клиент',
        6,
        false,
      ],
      [
        '1abb2244-b4f3-48a6-8e3a-aa85da72d775',
        'information_block',
        'отображение товаров',
        17,
        true,
      ],
      [
        'a9944ae2-1893-45ef-ab0c-c1445b5db917',
        'information_block',
        'включение / выключение скидок на товарах',
        18,
        true,
      ],
      [
        '30e14632-dc10-40a1-b97a-1be73a53054a',
        'information_block',
        'включение / выключение сумм на товарах',
        19,
        true,
      ],
      [
        '8f610bdf-f875-4f14-aac7-2ffa0eb5f267',
        'information_block',
        'включение / выключение скидок на чеках',
        20,
        true,
      ],
      [
        'bf55661b-b18c-4c15-a806-3bffb50b9001',
        'information_block',
        'включение / выключение сумм на чеках',
        21,
        true,
      ],
    ] as const;

    return options.map(
      ([optionId, blockType, name, optionSequence, isActive], index) => ({
        id: randomUUID(),
        cheque_id: chequeId,
        cheque_option_id: optionId,
        product_characteristic_id:
          index === 0 ? '133f817b-ecd8-412d-a626-72f5c94a8b1f' : '',
        cheque_option: {
          id: optionId,
          block_type: blockType,
          name,
          sequence_number: optionSequence,
        },
        sequence_number: index,
        is_active: isActive,
        attribute_id: '',
      }),
    );
  }

  private normalizeChequeItems(value: unknown, chequeId: string) {
    if (!Array.isArray(value)) {
      return this.buildDefaultChequeItems(chequeId);
    }

    return value.map((rawItem, index) => {
      const item =
        rawItem && typeof rawItem === 'object' && !Array.isArray(rawItem)
          ? (rawItem as Record<string, unknown>)
          : {};
      const chequeOptionId = this.optionalString(item.cheque_option_id) ?? '';
      const sequenceNumber = this.toNumber(item.sequence_number) ?? index;
      const chequeOption = this.resolveChequeOption(
        chequeOptionId,
        sequenceNumber,
      );

      return {
        id: this.optionalString(item.id) ?? randomUUID(),
        cheque_id: chequeId,
        cheque_option_id: chequeOptionId,
        product_characteristic_id:
          this.optionalString(item.product_characteristic_id) ?? '',
        cheque_option: this.objectOrDefault(item.cheque_option, chequeOption),
        sequence_number: sequenceNumber,
        is_active: this.optionalBoolean(item.is_active) ?? true,
        attribute_id: this.optionalString(item.attribute_id) ?? '',
      };
    });
  }

  private applyChequePatch(
    cheque: ChequeProfile,
    body: Record<string, unknown>,
  ) {
    if (body.name !== undefined) {
      cheque.name = this.requireString(body.name, 'name');
    }

    if (body.company_id !== undefined) {
      cheque.company_id = this.requireString(body.company_id, 'company_id');
    }

    if (body.has_logo !== undefined) {
      cheque.has_logo = this.optionalBoolean(body.has_logo) ?? false;
    }

    if (body.logo_image !== undefined) {
      cheque.logo_image = this.objectOrDefault(body.logo_image, {});
    }

    if (body.has_information_block !== undefined) {
      cheque.has_information_block =
        this.optionalBoolean(body.has_information_block) ?? false;
    }

    if (body.has_additional_info !== undefined) {
      cheque.has_additional_info =
        this.optionalBoolean(body.has_additional_info) ?? false;
    }

    if (body.has_lower_block !== undefined) {
      cheque.has_lower_block =
        this.optionalBoolean(body.has_lower_block) ?? false;
    }

    if (body.display_text !== undefined) {
      cheque.display_text = this.optionalString(body.display_text) ?? '';
    }

    if (body.cheque_items !== undefined) {
      cheque.cheque_items = this.normalizeChequeItems(
        body.cheque_items,
        this.stringOrDefault(cheque.id, ''),
      );
    }

    if (body.has_bar_code !== undefined) {
      cheque.has_bar_code = this.optionalBoolean(body.has_bar_code) ?? false;
    }

    if (body.is_default !== undefined) {
      cheque.is_default = this.optionalBoolean(body.is_default) ?? false;
    }

    if (body.type !== undefined) {
      cheque.type = this.optionalString(body.type) ?? 'cheque';
    }

    if (body.has_additional_image !== undefined) {
      cheque.has_additional_image =
        this.optionalBoolean(body.has_additional_image) ?? false;
    }

    if (body.additional_image !== undefined) {
      cheque.additional_image = this.objectOrDefault(body.additional_image, {});
    }

    if (body.has_customer_debt !== undefined) {
      cheque.has_customer_debt =
        this.optionalBoolean(body.has_customer_debt) ?? false;
    }

    if (body.has_customer_balance !== undefined) {
      cheque.has_customer_balance =
        this.optionalBoolean(body.has_customer_balance) ?? false;
    }

    if (body.printed_with_billz !== undefined) {
      cheque.printed_with_billz =
        this.optionalBoolean(body.printed_with_billz) ?? false;
    }

    if (body.logo_url !== undefined) {
      cheque.logo_url = this.optionalString(body.logo_url) ?? '';
    }

    if (body.width !== undefined) {
      cheque.width = this.toNumber(body.width) ?? 0;
    }

    if (body.length !== undefined) {
      cheque.length = this.toNumber(body.length) ?? 0;
    }

    if (body.x_axis !== undefined) {
      cheque.x_axis = this.toNumber(body.x_axis) ?? 0;
    }

    if (body.y_axis !== undefined) {
      cheque.y_axis = this.toNumber(body.y_axis) ?? 0;
    }

    if (body.rotation !== undefined) {
      cheque.rotation = this.toNumber(body.rotation) ?? 0;
    }

    if (body.logo !== undefined) {
      cheque.logo = this.optionalString(body.logo) ?? '';
    }

    if (body.compact !== undefined) {
      cheque.compact = this.optionalBoolean(body.compact) ?? false;
    }
  }

  private resolveChequeOption(chequeOptionId: string, sequenceNumber: number) {
    const optionsById: Record<
      string,
      { block_type: string; name: string; sequence_number: number }
    > = {
      '7ab57cd3-eae8-4ef8-ac76-87306421f908': {
        block_type: 'information_block',
        name: 'Название магазина',
        sequence_number: 1,
      },
      '4dbc9d80-45b7-4abe-8726-61f736bd55d2': {
        block_type: 'information_block',
        name: 'Дата',
        sequence_number: 2,
      },
      'fe9b1a27-f46f-4f04-8758-b2a47f952e69': {
        block_type: 'information_block',
        name: 'Режим работы',
        sequence_number: 3,
      },
      'cff3f41d-0661-4623-a97e-851a8dfef40d': {
        block_type: 'information_block',
        name: 'Продавец',
        sequence_number: 4,
      },
      '10375cd3-73af-414f-92c8-4bff64503b9d': {
        block_type: 'information_block',
        name: 'Кассир',
        sequence_number: 5,
      },
      'c4183629-4073-4f73-8f10-bddd45bbce82': {
        block_type: 'information_block',
        name: 'Клиент',
        sequence_number: 6,
      },
      'c8a08dea-f4cc-45fa-81ef-b71f3968e11f': {
        block_type: 'information_block',
        name: 'контакты магазина',
        sequence_number: 7,
      },
      'e28e3891-191f-4bfc-9d43-e7a15aad6a43': {
        block_type: 'lower_block',
        name: 'Facebook',
        sequence_number: 11,
      },
      '5236c6a1-91c6-4e01-872d-50259588532c': {
        block_type: 'lower_block',
        name: 'Instagram',
        sequence_number: 12,
      },
      'f6c04db8-c20d-4c5f-a2cf-7ca35c9a5f25': {
        block_type: 'lower_block',
        name: 'Telegram',
        sequence_number: 13,
      },
      '72407314-caa7-45bc-95d0-f197280d6955': {
        block_type: 'lower_block',
        name: 'Сайт',
        sequence_number: 14,
      },
      'd78d4444-d388-405a-b521-b6683a7fe087': {
        block_type: 'lower_block',
        name: 'Баркод транзакции',
        sequence_number: 15,
      },
      '07b41bb3-2aee-4d3e-b4c1-e145d48dd65c': {
        block_type: 'information_block',
        name: 'ИНН',
        sequence_number: 16,
      },
      '1abb2244-b4f3-48a6-8e3a-aa85da72d775': {
        block_type: 'information_block',
        name: 'отображение товаров',
        sequence_number: 17,
      },
      'a9944ae2-1893-45ef-ab0c-c1445b5db917': {
        block_type: 'information_block',
        name: 'включение / выключение скидок на товарах',
        sequence_number: 18,
      },
      '30e14632-dc10-40a1-b97a-1be73a53054a': {
        block_type: 'information_block',
        name: 'включение / выключение сумм на товарах',
        sequence_number: 19,
      },
      '8f610bdf-f875-4f14-aac7-2ffa0eb5f267': {
        block_type: 'information_block',
        name: 'включение / выключение скидок на чеках',
        sequence_number: 20,
      },
      'bf55661b-b18c-4c15-a806-3bffb50b9001': {
        block_type: 'information_block',
        name: 'включение / выключение сумм на чеках',
        sequence_number: 21,
      },
      'b3c8e708-abf7-4412-a00f-004f674a4f00': {
        block_type: 'information_block',
        name: 'Название юридического лица',
        sequence_number: 22,
      },
      'bae89b69-82d7-4b52-bfbf-b481ade8cf26': {
        block_type: 'information_block',
        name: 'Адрес',
        sequence_number: 23,
      },
      '8322a0d3-454d-44c3-9a4a-80f904d36300': {
        block_type: 'information_block',
        name: 'Номер телефона клиента',
        sequence_number: 24,
      },
      'b6c8827b-4fe8-498d-9a87-0f6972ba2fb6': {
        block_type: 'information_block',
        name: 'Количество продуктов в чеке',
        sequence_number: 25,
      },
      '0c3ac2d4-a71e-4757-9ae5-1e5155dbb1ec': {
        block_type: 'information_block',
        name: 'Заметка',
        sequence_number: 26,
      },
      '7036655a-edc7-48c6-94a8-73c1a57c4615': {
        block_type: 'customer_balance',
        name: 'Баланс перед покупкой',
        sequence_number: 27,
      },
      'e0f7e786-639d-4412-aaff-d41519973263': {
        block_type: 'customer_balance',
        name: 'Добавлено на баланс',
        sequence_number: 28,
      },
      '825988ca-5f9b-495a-b5fa-5d9da1d5efb6': {
        block_type: 'customer_balance',
        name: 'Списано с баланса',
        sequence_number: 29,
      },
      '835988ca-5f9b-495a-b5fa-5d9da1d5efb6': {
        block_type: 'customer_balance',
        name: 'Баланс после покупки',
        sequence_number: 30,
      },
      '845988ca-5f9b-495a-b5fa-5d9da1d5efb6': {
        block_type: 'customer_debt',
        name: 'Долг перед покупкой',
        sequence_number: 31,
      },
      '855988ca-5f9b-495a-b5fa-5d9da1d5efb6': {
        block_type: 'customer_debt',
        name: 'Добавлено к долгу',
        sequence_number: 32,
      },
      'b14fe890-7ce4-4cd9-a27f-2afb4ad9be86': {
        block_type: 'customer_debt',
        name: 'Списано с долга',
        sequence_number: 33,
      },
      '865988ca-5f9b-495a-b5fa-5d9da1d5efb6': {
        block_type: 'customer_debt',
        name: 'Долг после покупки',
        sequence_number: 34,
      },
    };
    const option = optionsById[chequeOptionId];

    return {
      id: chequeOptionId,
      block_type: option?.block_type ?? '',
      name: option?.name ?? '',
      sequence_number: option?.sequence_number ?? sequenceNumber,
    };
  }

  getCompanyPaymentTypes(limit?: number, companyId?: string) {
    const companyPaymentTypes = this.getStoredCompanyPaymentTypes();
    const targetCompanyId = companyId?.trim() || DEFAULT_COMPANY_ID;
    const filtered = companyPaymentTypes.filter(
      (item) => this.stringOrDefault(item.company_id, '') === targetCompanyId,
    );

    return {
      count: filtered.length,
      company_payment_types: filtered.slice(
        0,
        this.normalizeLimit(limit, 1000),
      ),
    };
  }

  createCompanyPaymentType(body: Record<string, unknown>) {
    const companyPaymentTypes = this.getStoredCompanyPaymentTypes();
    const companyId =
      this.optionalString(body.company_id) ?? DEFAULT_COMPANY_ID;
    const name = this.requireString(body.name, 'name');
    const paymentTypeId =
      this.optionalString(body.payment_type_id) ??
      this.optionalNestedString(body.payment_type, 'id') ??
      '00ed9cff-9576-432f-849b-7bbcc2fed640';
    const paymentTypeName =
      this.optionalString(body.payment_type_name) ??
      this.optionalNestedString(body.payment_type, 'name') ??
      'Кастомный';

    const created: CompanyPaymentType = {
      id: randomUUID(),
      company_id: companyId,
      name,
      token: this.optionalString(body.token) ?? '',
      is_editable: this.optionalBoolean(body.is_editable) ?? true,
      dont_show_in_make_payment:
        this.optionalBoolean(body.dont_show_in_make_payment) ?? false,
      dont_show_in_settings:
        this.optionalBoolean(body.dont_show_in_settings) ?? false,
      is_cash_payment_type:
        this.optionalBoolean(body.is_cash_payment_type) ?? false,
      payment_type: {
        id: paymentTypeId,
        name: paymentTypeName,
      },
    };

    companyPaymentTypes.unshift(created);
    return created;
  }

  updateCompanyPaymentType(id: string, body: Record<string, unknown>) {
    const companyPaymentTypes = this.getStoredCompanyPaymentTypes();
    const paymentType = companyPaymentTypes.find(
      (item) => this.stringOrDefault(item.id, '') === id,
    );

    if (!paymentType) {
      throw new NotFoundException('Company payment type not found');
    }

    if (body.name !== undefined) {
      paymentType.name = this.requireString(body.name, 'name');
    }

    if (body.company_id !== undefined) {
      paymentType.company_id = this.requireString(
        body.company_id,
        'company_id',
      );
    }

    if (body.token !== undefined) {
      paymentType.token = this.optionalString(body.token) ?? '';
    }

    if (body.is_editable !== undefined) {
      paymentType.is_editable = this.optionalBoolean(body.is_editable) ?? false;
    }

    if (body.dont_show_in_make_payment !== undefined) {
      paymentType.dont_show_in_make_payment =
        this.optionalBoolean(body.dont_show_in_make_payment) ?? false;
    }

    if (body.dont_show_in_settings !== undefined) {
      paymentType.dont_show_in_settings =
        this.optionalBoolean(body.dont_show_in_settings) ?? false;
    }

    if (body.is_cash_payment_type !== undefined) {
      paymentType.is_cash_payment_type =
        this.optionalBoolean(body.is_cash_payment_type) ?? false;
    }

    const paymentTypeMeta =
      paymentType.payment_type &&
      typeof paymentType.payment_type === 'object' &&
      !Array.isArray(paymentType.payment_type)
        ? (paymentType.payment_type as Record<string, unknown>)
        : {};

    if (body.payment_type_id !== undefined) {
      paymentTypeMeta.id = this.requireString(
        body.payment_type_id,
        'payment_type_id',
      );
    }

    if (body.payment_type_name !== undefined) {
      paymentTypeMeta.name = this.requireString(
        body.payment_type_name,
        'payment_type_name',
      );
    }

    if (body.payment_type !== undefined) {
      const nestedId = this.optionalNestedString(body.payment_type, 'id');
      const nestedName = this.optionalNestedString(body.payment_type, 'name');

      if (nestedId) {
        paymentTypeMeta.id = nestedId;
      }

      if (nestedName) {
        paymentTypeMeta.name = nestedName;
      }
    }

    paymentType.payment_type = paymentTypeMeta;

    return paymentType;
  }

  deleteCompanyPaymentType(id: string) {
    const companyPaymentTypes = this.getStoredCompanyPaymentTypes();
    const index = companyPaymentTypes.findIndex(
      (item) => this.stringOrDefault(item.id, '') === id,
    );

    if (index === -1) {
      throw new NotFoundException('Company payment type not found');
    }

    const [deleted] = companyPaymentTypes.splice(index, 1);
    return {
      success: true,
      company_payment_type: deleted,
    };
  }

  getCashBoxes(query: {
    page?: number;
    limit?: number;
    name?: string;
    companyId?: string;
  }) {
    const cashBoxes = this.parseJsonArray<CashBoxProfile>(
      process.env.CASH_BOXES_JSON,
      DEFAULT_CASH_BOXES,
    );
    const shops = this.parseJsonArray<ShopProfile>(
      process.env.SHOPS_JSON,
      DEFAULT_SHOPS,
    );
    const companyPaymentTypes = this.parseJsonArray<CompanyPaymentType>(
      process.env.COMPANY_PAYMENT_TYPES_JSON,
      DEFAULT_COMPANY_PAYMENT_TYPES,
    );

    const targetCompanyId = query.companyId?.trim() || DEFAULT_COMPANY_ID;
    const safeLimit = this.normalizeLimit(query.limit, 10);
    const safePage = Math.max(1, Number(query.page) || 1);
    const normalizedName = (query.name ?? '').trim().toLowerCase();

    const prepared = cashBoxes
      .filter(
        (item) => this.stringOrDefault(item.company_id, '') === targetCompanyId,
      )
      .filter(
        (item) =>
          !normalizedName ||
          this.stringOrDefault(item.name, '')
            .toLowerCase()
            .includes(normalizedName),
      )
      .map((cashBox) => {
        const shop = shops.find(
          (item) =>
            this.stringOrDefault(item.id, '') ===
            this.stringOrDefault(cashBox.shop_id, ''),
        );

        return {
          ...cashBox,
          shop: {
            id: this.stringOrDefault(shop?.id, ''),
            name: this.stringOrDefault(shop?.name, ''),
            phone_numbers: shop?.phone_numbers ?? null,
            facebook: '',
            instagram: '',
            telegram: '',
            website: '',
            working_hours: null,
          },
          payment_types: companyPaymentTypes.map((type) => ({
            id: randomUUID(),
            company_payment_type: {
              ...type,
              company_id: '',
            },
            is_active: !Boolean(type.dont_show_in_make_payment),
          })),
          tariff_limits: {
            company_tariff: '',
            cashbox_count: 0,
            products_count: 0,
            users_count: 0,
            customers_count: 0,
          },
        };
      });

    return {
      count: prepared.length,
      cash_boxes: prepared.slice(
        (safePage - 1) * safeLimit,
        safePage * safeLimit,
      ),
    };
  }

  private normalizeLimit(limit?: number, fallback = 1000) {
    const normalized = Number(limit);
    if (Number.isNaN(normalized) || normalized <= 0) {
      return fallback;
    }

    return Math.trunc(normalized);
  }

  private parseJsonMap<T>(raw?: string): Record<string, T> {
    const parsed = this.parseJsonValue(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }

    return parsed as Record<string, T>;
  }

  private parseJsonArray<T>(raw: string | undefined, fallback: T[]): T[] {
    const parsed = this.parseJsonValue(raw);
    if (!Array.isArray(parsed)) {
      return fallback;
    }

    return parsed as T[];
  }

  private getStoredCompanyPaymentTypes() {
    if (!this.companyPaymentTypesStore) {
      this.companyPaymentTypesStore = this.parseJsonArray<CompanyPaymentType>(
        process.env.COMPANY_PAYMENT_TYPES_JSON,
        DEFAULT_COMPANY_PAYMENT_TYPES,
      ).map((item) => ({ ...item }));
    }

    return this.companyPaymentTypesStore;
  }

  private getStoredPriceTags() {
    if (!this.priceTagsStore) {
      this.priceTagsStore = this.parseJsonArray<PriceTagProfile>(
        process.env.PRICE_TAGS_JSON,
        DEFAULT_PRICE_TAGS,
      ).map((item) => ({ ...item }));
    }

    return this.priceTagsStore;
  }

  private getStoredCheques() {
    if (!this.chequesStore) {
      this.chequesStore = this.parseJsonArray<ChequeProfile>(
        process.env.CHEQUES_JSON,
        DEFAULT_CHEQUES,
      ).map((item) => ({ ...item }));
    }

    return this.chequesStore;
  }

  private parseJsonObject(raw?: string): Record<string, unknown> {
    const parsed = this.parseJsonValue(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }

    return parsed as Record<string, unknown>;
  }

  private parseJsonValue(raw?: string): unknown {
    if (!raw) {
      return undefined;
    }

    try {
      return JSON.parse(raw);
    } catch {
      return undefined;
    }
  }

  private stringOrDefault(value: unknown, fallback: string): string {
    return typeof value === 'string' ? value : fallback;
  }

  private objectOrDefault(
    value: unknown,
    fallback: Record<string, unknown>,
  ): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return fallback;
    }

    return value as Record<string, unknown>;
  }

  private optionalString(value: unknown) {
    if (typeof value !== 'string') {
      return undefined;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  private requireString(value: unknown, fieldName: string) {
    const normalized = this.optionalString(value);
    if (!normalized) {
      throw new BadRequestException(`${fieldName} is required`);
    }

    return normalized;
  }

  private optionalBoolean(value: unknown) {
    if (typeof value === 'boolean') {
      return value;
    }

    if (typeof value === 'string') {
      if (value === 'true') {
        return true;
      }

      if (value === 'false') {
        return false;
      }
    }

    return undefined;
  }

  private toNumber(value: unknown) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    if (typeof value !== 'string') {
      return undefined;
    }

    const normalized = Number(value);
    return Number.isFinite(normalized) ? normalized : undefined;
  }

  private optionalNestedString(value: unknown, key: string) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return undefined;
    }

    return this.optionalString((value as Record<string, unknown>)[key]);
  }
}
