import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
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

@Injectable()
export class CompanySettingsService {
  private companyPaymentTypesStore?: CompanyPaymentType[];

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
  }) {
    const safeLimit = this.normalizeLimit(query.limit, 10);
    const safePage = Math.max(1, Number(query.page) || 1);
    const normalizedName = (query.name ?? '').trim().toLowerCase();
    const companyId = query.companyId?.trim() || DEFAULT_COMPANY_ID;
    const dbShops = await this.db.shop.findMany({
      where: {
        companyId,
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

    const shops = this.parseJsonArray<ShopProfile>(
      process.env.SHOPS_JSON,
      DEFAULT_SHOPS,
    );

    const allForCompany = shops.filter(
      (shop) => this.stringOrDefault(shop.company_id, '') === companyId,
    );
    const filtered = allForCompany.filter(
      (shop) =>
        !normalizedName ||
        this.stringOrDefault(shop.name, '')
          .toLowerCase()
          .includes(normalizedName),
    );

    return {
      count: filtered.length,
      shops: filtered
        .slice((safePage - 1) * safeLimit, safePage * safeLimit)
        .map((shop) => {
          const branchCode = this.stringOrDefault(shop.branch_code, '')
            || this.stringOrDefault(shop.branchCode, '');

          return {
            ...shop,
            branch_code: branchCode,
          };
        }),
    };
  }

  getCheque(limit?: number) {
    const cheques = this.parseJsonArray<ChequeProfile>(
      process.env.CHEQUES_JSON,
      DEFAULT_CHEQUES,
    );

    return {
      count: cheques.length,
      cheques: cheques.slice(0, this.normalizeLimit(limit, 1000)),
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
      paymentType.company_id = this.requireString(body.company_id, 'company_id');
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
      paymentTypeMeta.id = this.requireString(body.payment_type_id, 'payment_type_id');
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

  private optionalNestedString(value: unknown, key: string) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return undefined;
    }

    return this.optionalString((value as Record<string, unknown>)[key]);
  }
}
