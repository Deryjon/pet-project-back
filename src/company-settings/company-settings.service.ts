import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
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
    id: '31f8fd23-2497-4769-9341-e8c4b97bdb11',
    company_id: DEFAULT_COMPANY_ID,
    name: 'Долг',
    token: '',
    is_editable: false,
    dont_show_in_make_payment: false,
    dont_show_in_settings: true,
    is_cash_payment_type: false,
    payment_type: {
      id: '00ed9cff-9576-432f-849b-7bbcc2fed640',
      name: 'Кастомный',
    },
  },
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

const DEFAULT_MEASUREMENT_UNIT: MeasurementUnitProfile = {
  id: '12a69bc0-c575-4586-9f0f-76e8295d4139',
  name: 'Штука',
  company_id: DEFAULT_COMPANY_ID,
  short_name: 'шт',
  precision: '1',
  is_editable: false,
  is_default: true,
};

const DEFAULT_MEASUREMENT_UNITS: MeasurementUnitProfile[] = [
  DEFAULT_MEASUREMENT_UNIT,
  {
    id: '6ef2d6c8-6b72-46c9-a633-8f43b2a1d5ef',
    name: 'Килограмм',
    company_id: DEFAULT_COMPANY_ID,
    short_name: 'кг',
    precision: '0.001',
    is_editable: true,
    is_default: false,
  },
  {
    id: '62033f40-46f0-4ef8-b99c-45df3919e7b7',
    name: 'Грамм',
    company_id: DEFAULT_COMPANY_ID,
    short_name: 'г',
    precision: '1',
    is_editable: true,
    is_default: false,
  },
];

const DEFAULT_MEASUREMENT_UNIT_OPTIONS = [
  { name: 'Ар (100 м2)', short_name: 'а' },
  { name: 'Гектар', short_name: 'га' },
  { name: 'Грамм', short_name: 'г' },
  { name: 'Дециметр', short_name: 'дм' },
  { name: 'Дюйм (25,4 мм)', short_name: 'дюйм' },
  { name: 'Квадратный дециметр', short_name: 'дм2' },
  { name: 'Квадратный дюйм (645,16 мм2)', short_name: 'дюйм2' },
  { name: 'Квадратный километр', short_name: 'км2' },
  { name: 'Квадратный метр', short_name: 'м2' },
  { name: 'Квадратный миллиметр', short_name: 'мм2' },
  { name: 'Квадратный сантиметр', short_name: 'см2' },
  { name: 'Квадратный фут (0,092903 м2)', short_name: 'фут2' },
  { name: 'Килограмм', short_name: 'кг' },
  { name: 'Километр', short_name: 'км' },
  { name: 'Кубический дюйм (16387,1 мм3)', short_name: 'дюйм3' },
  { name: 'Кубический метр', short_name: 'м3' },
  { name: 'Кубический миллиметр', short_name: 'мм3' },
  { name: 'Кубический сантиметр', short_name: 'см3' },
  { name: 'Кубический фут (0,02831685 м3)', short_name: 'фут3' },
  { name: 'Литр', short_name: 'л' },
  { name: 'Кубический дециметр', short_name: 'дм3' },
  { name: 'Месяц', short_name: 'мес' },
  { name: 'Метр', short_name: 'м' },
  { name: 'Метрический карат', short_name: 'кар' },
  { name: 'Миллиграмм', short_name: 'мг' },
  { name: 'Миллиметр', short_name: 'мм' },
  { name: 'Минута', short_name: 'мин' },
  { name: 'Рулон', short_name: 'рулон' },
  { name: 'Сантиметр', short_name: 'см' },
  { name: 'Секунда', short_name: 'с' },
  { name: 'Сутки', short_name: 'сут' },
  { name: 'Тонна', short_name: 'т' },
  { name: 'Фут (0,3048 м)', short_name: 'фут' },
  { name: 'Центнер', short_name: 'ц' },
  { name: 'Час', short_name: 'ч' },
  { name: 'Штука', short_name: 'шт' },
  { name: 'Мешок', short_name: 'мш' },
  { name: 'Пачка', short_name: 'пч' },
  { name: 'Пара', short_name: 'пара' },
  { name: 'Миллилитр', short_name: 'мл' },
] as const;

const SUPPORTED_MEASUREMENT_PRECISIONS = new Set(['1', '.0', '.00', '.000']);

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
  private currencyIsoCache = new Map<string, string>();
  private companyTimeZoneCache = new Map<
    string,
    { id: string; name: string; gmtOffset: string }
  >();
  private readonly logger = new Logger(CompanySettingsService.name);

  constructor(private readonly prisma: PrismaService) {}

  private get db(): PrismaService {
    return this.prisma;
  }

  async getDefaultCurrency(companyId?: string): Promise<CompanyCurrencyConfig> {
    const targetCompanyId = await this.resolveCompanyId(companyId);
    if (!targetCompanyId) {
      return {
        id: DEFAULT_CURRENCY_CONFIG_ID,
        company_id: companyId?.trim() || DEFAULT_COMPANY_ID,
        currency: {
          id: DEFAULT_CURRENCY_ID,
          name: DEFAULT_CURRENCY_NAME,
          symbol: DEFAULT_CURRENCY_SYMBOL,
          iso_code: DEFAULT_CURRENCY_ISO_CODE,
          exchange_rate: DEFAULT_CURRENCY_EXCHANGE_RATE,
          precision: DEFAULT_CURRENCY_PRECISION,
        },
        is_editable: DEFAULT_CURRENCY_EDITABLE,
      };
    }

    await this.ensureCompanySettingsSeeded(targetCompanyId);
    const currency = await this.db.companyCurrencySetting.findUnique({
      where: { companyId: targetCompanyId },
    });

    const response = {
      id: currency?.id ?? DEFAULT_CURRENCY_CONFIG_ID,
      company_id: targetCompanyId,
      currency: {
        id: currency?.currencyId ?? DEFAULT_CURRENCY_ID,
        name: currency?.name ?? DEFAULT_CURRENCY_NAME,
        symbol: currency?.symbol ?? DEFAULT_CURRENCY_SYMBOL,
        iso_code: currency?.isoCode ?? DEFAULT_CURRENCY_ISO_CODE,
        exchange_rate: currency?.exchangeRate ?? DEFAULT_CURRENCY_EXCHANGE_RATE,
        precision: currency?.precision ?? DEFAULT_CURRENCY_PRECISION,
      },
      is_editable: currency?.isEditable ?? DEFAULT_CURRENCY_EDITABLE,
    };

    this.currencyIsoCache.set(targetCompanyId, response.currency.iso_code);
    return response;
  }

  getDefaultCurrencyIsoCode(companyId?: string): string {
    const key = companyId?.trim() || DEFAULT_COMPANY_ID;
    return this.currencyIsoCache.get(key) ?? DEFAULT_CURRENCY_ISO_CODE;
  }

  getDefaultTimeZone(companyId?: string) {
    const key = companyId?.trim() || DEFAULT_COMPANY_ID;
    return (
      this.companyTimeZoneCache.get(key) ?? {
        id: this.stringOrDefault(DEFAULT_COMPANY_PROFILE.time_zone_id, ''),
        name: this.stringOrDefault(
          DEFAULT_COMPANY_PROFILE.time_zone_name,
          'Asia/Tashkent',
        ),
        gmtOffset: this.stringOrDefault(
          DEFAULT_COMPANY_PROFILE.time_zone_gmt,
          '+05:00',
        ),
      }
    );
  }

  formatDateTimeForCompany(
    value: Date | string | null | undefined,
    companyId?: string,
  ) {
    const date = this.normalizeDate(value);
    if (!date) {
      return '';
    }

    const timeZone = this.getDefaultTimeZone(companyId).name;
    const parts = this.getDateParts(date, timeZone);
    return `${parts.year}-${parts.month}-${parts.day} ${parts.hours}:${parts.minutes}:${parts.seconds}`;
  }

  formatDateForCompany(
    value: Date | string | null | undefined,
    companyId?: string,
  ) {
    const date = this.normalizeDate(value);
    if (!date) {
      return '';
    }

    const timeZone = this.getDefaultTimeZone(companyId).name;
    const parts = this.getDateParts(date, timeZone);
    return `${parts.year}-${parts.month}-${parts.day}`;
  }

  toIsoForCompany(
    value: Date | string | null | undefined,
    companyId?: string,
  ) {
    const date = this.normalizeDate(value);
    if (!date) {
      return '';
    }

    const timeZone = this.getDefaultTimeZone(companyId).name;
    const parts = this.getDateParts(date, timeZone);
    return `${parts.year}-${parts.month}-${parts.day}T${parts.hours}:${parts.minutes}:${parts.seconds}`;
  }

  async getCountries(limit?: number) {
    await this.ensureReferenceDataSeeded();
    const countries = await this.db.countryReference.findMany({
      orderBy: { name: 'asc' },
    });

    return {
      count: countries.length,
      countries: countries.slice(0, this.normalizeLimit(limit, 1000)).map((country: any) => ({
        id: country.id,
        name: country.name,
        code: country.code,
      })),
    };
  }

  async getTimeZones(limit?: number, countryId?: string) {
    await this.ensureReferenceDataSeeded();
    const filtered = await this.db.timeZoneReference.findMany({
      where: countryId ? { countryId } : undefined,
      orderBy: { name: 'asc' },
    });

    return {
      count: filtered.length,
      time_zones: filtered.slice(0, this.normalizeLimit(limit, 1000)).map((item: any) => ({
        id: item.id,
        country_id: item.countryId ?? '',
        name: item.name,
        short_name: item.shortName,
        gmt_offset: item.gmtOffset,
      })),
    };
  }

  async getCompanyTariff() {
    const targetCompanyId = await this.resolveCompanyId();
    if (!targetCompanyId) {
      return DEFAULT_COMPANY_TARIFF;
    }

    await this.ensureCompanySettingsSeeded(targetCompanyId);
    const tariff = await this.db.companyTariffSetting.findUnique({
      where: { companyId: targetCompanyId },
    });

    return this.objectOrDefault(tariff?.data, {
      ...DEFAULT_COMPANY_TARIFF,
      billz_company_id: targetCompanyId,
    });
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

    if (companyFromDb) {
      await this.ensureCompanySettingsSeeded(companyFromDb.id);
    }
    const profile = companyFromDb
      ? await this.db.companyProfileSetting.findUnique({
          where: { companyId: companyFromDb.id },
        })
      : null;
    const merged: Record<string, unknown> = {
      ...DEFAULT_COMPANY_PROFILE,
      ...this.objectOrDefault(profile?.data, {}),
      ...(companyFromDb
        ? {
            id: companyFromDb.id,
            name: companyFromDb.name,
            subdomen: companyFromDb.subdomain,
            is_active: companyFromDb.isActive,
          }
        : {}),
    };

    await this.ensureReferenceDataSeeded();
    const zones = await this.db.timeZoneReference.findMany();
    const selectedZone = zones.find(
      (item: any) =>
        item.id === this.stringOrDefault(merged.time_zone_id, '') ||
        item.shortName === this.stringOrDefault(merged.time_zone_name, ''),
    );

    if (!selectedZone) {
      return merged;
    }

    this.companyTimeZoneCache.set(companyFromDb?.id ?? DEFAULT_COMPANY_ID, {
      id: selectedZone.id,
      name: selectedZone.shortName,
      gmtOffset: selectedZone.gmtOffset,
    });

    return {
      ...merged,
      time_zone_id: merged.time_zone_id || selectedZone.id,
      time_zone_name: selectedZone.shortName,
      time_zone_gmt: selectedZone.gmtOffset,
    };
  }

  async updateCompany(
    body: Record<string, unknown>,
    companyId?: string,
  ) {
    const targetCompanyId =
      (await this.resolveCompanyId(companyId ?? this.optionalString(body.company_id))) ??
      this.optionalString(body.company_id) ??
      DEFAULT_COMPANY_ID;

    await this.ensureCompanySettingsSeeded(targetCompanyId);

    const company = await this.db.company.findUnique({
      where: { id: targetCompanyId },
      select: { id: true, name: true, subdomain: true, isActive: true },
    });

    if (!company) {
      throw new NotFoundException('Company not found');
    }

    const existingProfile = await this.db.companyProfileSetting.findUnique({
      where: { companyId: targetCompanyId },
    });
    const nextProfile = {
      ...DEFAULT_COMPANY_PROFILE,
      ...this.objectOrDefault(existingProfile?.data, {}),
    } as Record<string, unknown>;

    const rawTimeZoneId = this.optionalString(body.time_zone_id);
    const rawTimeZoneName = this.optionalString(body.time_zone_name);

    if (rawTimeZoneId || rawTimeZoneName) {
      await this.ensureReferenceDataSeeded();

      const zone = await this.db.timeZoneReference.findFirst({
        where: rawTimeZoneId
          ? { id: rawTimeZoneId }
          : {
              shortName: rawTimeZoneName,
            },
      });

      if (!zone) {
        throw new BadRequestException('time_zone_id or time_zone_name is invalid');
      }

      nextProfile.time_zone_id = zone.id;
      nextProfile.time_zone_name = zone.shortName;
      nextProfile.time_zone_gmt = zone.gmtOffset;
      this.companyTimeZoneCache.set(targetCompanyId, {
        id: zone.id,
        name: zone.shortName,
        gmtOffset: zone.gmtOffset,
      });
    }

    const updatedProfile = await this.db.companyProfileSetting.upsert({
      where: { companyId: targetCompanyId },
      update: {
        data: nextProfile as any,
      },
      create: {
        companyId: targetCompanyId,
        data: nextProfile as any,
      },
    });

    const merged = {
      ...DEFAULT_COMPANY_PROFILE,
      ...this.objectOrDefault(updatedProfile.data, {}),
      id: company.id,
      name: company.name,
      subdomen: company.subdomain,
      is_active: company.isActive,
    };

    return merged;
  }

  async getCompanyTimeZone(companyId?: string) {
    const targetCompanyId =
      (await this.resolveCompanyId(companyId)) ?? companyId?.trim() ?? DEFAULT_COMPANY_ID;

    await this.ensureCompanySettingsSeeded(targetCompanyId);
    await this.ensureReferenceDataSeeded();

    const profile = await this.db.companyProfileSetting.findUnique({
      where: { companyId: targetCompanyId },
    });
    const merged = {
      ...DEFAULT_COMPANY_PROFILE,
      ...this.objectOrDefault(profile?.data, {}),
    } as Record<string, unknown>;

    const zone = await this.db.timeZoneReference.findFirst({
      where: {
        OR: [
          {
            id: this.stringOrDefault(merged.time_zone_id, ''),
          },
          {
            shortName: this.stringOrDefault(merged.time_zone_name, ''),
          },
        ],
      },
    });

    const response = {
      company_id: targetCompanyId,
      time_zone_id:
        zone?.id ?? this.stringOrDefault(merged.time_zone_id, ''),
      time_zone_name:
        zone?.shortName ??
        this.stringOrDefault(merged.time_zone_name, 'Asia/Tashkent'),
      time_zone_gmt:
        zone?.gmtOffset ??
        this.stringOrDefault(merged.time_zone_gmt, '+05:00'),
    };

    this.companyTimeZoneCache.set(targetCompanyId, {
      id: response.time_zone_id,
      name: response.time_zone_name,
      gmtOffset: response.time_zone_gmt,
    });

    return response;
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
    await this.ensureShopsSeeded(companyId);
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
            address: shop.address ?? '',
            phone_numbers: Array.isArray(shop.phoneNumbers)
              ? shop.phoneNumbers
              : [],
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

    await this.ensureShopsSeeded(targetCompanyId);
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
        address: dbShop.address ?? '',
        phone_numbers: Array.isArray(dbShop.phoneNumbers) ? dbShop.phoneNumbers : [],
        facebook: dbShop.facebook ?? '',
        instagram: dbShop.instagram ?? '',
        telegram: dbShop.telegram ?? '',
        website: dbShop.website ?? '',
        working_hours: dbShop.workingHours ?? null,
        cash_boxes_count: 0,
        cash_boxes: [],
        is_active: dbShop.isActive,
      };
    }

    throw new NotFoundException('Shop not found');
  }

  async getCompanyCurrencies(companyId?: string) {
    const defaultCurrency = await this.getDefaultCurrency(companyId);

    return {
      company_currencies: [defaultCurrency],
      count: 1,
    };
  }

  async getLoyaltyProgram(companyId?: string) {
    const targetCompanyId = await this.resolveCompanyId(companyId);
    if (!targetCompanyId) {
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

    await this.ensureCompanySettingsSeeded(targetCompanyId);
    const loyalty = await this.db.loyaltyProgramSetting.findUnique({
      where: { companyId: targetCompanyId },
    });

    return {
      id: loyalty?.id ?? '',
      company_id: targetCompanyId,
      is_active: loyalty?.isActive ?? false,
      name: loyalty?.name ?? '',
      type: loyalty?.type ?? '',
      cashback_percent: loyalty?.cashbackPercent ?? 0,
      bonus_percent: loyalty?.bonusPercent ?? 0,
      levels: Array.isArray(loyalty?.levels) ? loyalty.levels : [],
      has_customer_balance: loyalty?.hasCustomerBalance ?? false,
      has_customer_debt: loyalty?.hasCustomerDebt ?? false,
    };
  }

  async updateLoyaltyProgram(body: Record<string, unknown>, companyId?: string) {
    const targetCompanyId = await this.resolveCompanyId(companyId);
    if (!targetCompanyId) throw new BadRequestException('Company ID required');

    const data = {
      isActive: body.is_active === true || body.is_active === 'true',
      name: String(body.name ?? '').trim(),
      type: String(body.type ?? '').trim(),
      cashbackPercent: Number(body.cashback_percent) || 0,
      bonusPercent: Number(body.bonus_percent) || 0,
      levels: Array.isArray(body.levels) ? body.levels : [],
      hasCustomerBalance:
        body.has_customer_balance === true ||
        body.has_customer_balance === 'true',
      hasCustomerDebt:
        body.has_customer_debt === true || body.has_customer_debt === 'true',
    };

    await this.db.loyaltyProgramSetting.upsert({
      where: { companyId: targetCompanyId },
      update: data,
      create: { companyId: targetCompanyId, ...data },
    });

    return this.getLoyaltyProgram(companyId);
  }

  async getMeasurementUnitById(id: string, companyId?: string) {
    const measurementUnitId = this.requireString(id, 'id');
    const targetCompanyId =
      (await this.resolveCompanyId(companyId)) ||
      companyId?.trim() ||
      DEFAULT_COMPANY_ID;
    await this.ensureMeasurementUnitsSeeded(targetCompanyId);
    const matchedUnit = await this.db.measurementUnitSetting.findFirst({
      where: {
        id: measurementUnitId,
        companyId: targetCompanyId,
      },
    });

    if (matchedUnit) {
      return {
        id: matchedUnit.id,
        name: matchedUnit.name,
        company_id: matchedUnit.companyId,
        short_name: matchedUnit.shortName,
        precision: matchedUnit.precision,
        is_editable: matchedUnit.isEditable,
        is_default: matchedUnit.isDefault,
      };
    }

    return {
      ...DEFAULT_MEASUREMENT_UNIT,
      id: measurementUnitId,
      company_id: targetCompanyId,
      is_default: measurementUnitId === DEFAULT_MEASUREMENT_UNIT.id,
    };
  }

  async getMeasurementUnits(query?: {
    companyId?: string;
    limit?: number;
    page?: number;
    name?: string;
  }) {
    try {
      const targetCompanyId =
        (await this.resolveCompanyId(query?.companyId)) ||
        query?.companyId?.trim() ||
        DEFAULT_COMPANY_ID;
      const safeLimit = this.normalizeLimit(query?.limit, 1000);
      const safePage = Math.max(1, Number(query?.page) || 1);
      const normalizedName = this.optionalString(query?.name)?.toLowerCase();

      await this.ensureMeasurementUnitsSeeded(targetCompanyId);
      const measurementUnits = await this.db.measurementUnitSetting.findMany({
        where: {
          companyId: targetCompanyId,
          ...(normalizedName
            ? {
                name: {
                  contains: normalizedName,
                  mode: 'insensitive',
                },
              }
            : {}),
        },
        orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
      });

      return {
        count: measurementUnits.length,
        measurement_units: measurementUnits
          .slice((safePage - 1) * safeLimit, safePage * safeLimit)
          .map((unit: any) => this.toMeasurementUnitResponse(unit)),
      };
    } catch (error) {
      this.logger.error(
        `Failed to get measurement units. companyId=${query?.companyId ?? 'auto'} limit=${query?.limit ?? 'n/a'} page=${query?.page ?? 'n/a'} name=${query?.name ?? ''}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw error;
    }
  }

  getDefaultMeasurementUnits() {
    return {
      measurement_units: DEFAULT_MEASUREMENT_UNIT_OPTIONS.map((unit) => ({
        name: unit.name,
        short_name: unit.short_name,
      })),
    };
  }

  async createMeasurementUnit(body: Record<string, unknown>) {
    const companyId =
      (await this.resolveCompanyId(this.optionalString(body.company_id))) ||
      this.optionalString(body.company_id) ||
      DEFAULT_COMPANY_ID;
    const name = this.requireString(body.name, 'name');
    const shortName = this.requireString(body.short_name, 'short_name');
    const precision = this.normalizeMeasurementPrecision(body.precision);

    await this.ensureMeasurementUnitsSeeded(companyId);

    const duplicate = await this.db.measurementUnitSetting.findFirst({
      where: {
        companyId,
        OR: [{ name }, { shortName }],
      },
      select: { id: true },
    });

    if (duplicate) {
      throw new ConflictException(
        'Measurement unit with the same name or short_name already exists',
      );
    }

    const created = await this.db.measurementUnitSetting.create({
      data: {
        id: randomUUID(),
        companyId,
        name,
        shortName,
        precision,
        isEditable: true,
        isDefault: false,
      },
    });

    return {
      message: created.id,
    };
  }

  async getPriceTags(companyId?: string) {
    const targetCompanyId =
      (await this.resolveCompanyId(companyId)) ||
      companyId?.trim() ||
      DEFAULT_COMPANY_ID;
    await this.ensureCompanySettingsSeeded(targetCompanyId);
    const priceTags = await this.db.priceTagSetting.findMany({
      where: { companyId: targetCompanyId },
      orderBy: { createdAt: 'desc' },
    });

    return {
      price_tags: priceTags.map((priceTag: any) => ({
        id: priceTag.id,
        company_id: priceTag.companyId,
        name: priceTag.name,
        width: priceTag.width,
        length: priceTag.length,
        barcode_type: priceTag.barcodeType,
        barcode_type_id: priceTag.barcodeTypeId,
        properties: priceTag.properties,
      })),
    };
  }

  async createPriceTag(body: Record<string, unknown>, resolvedCompanyId?: string) {
    const companyId =
      resolvedCompanyId ?? this.optionalString(body.company_id) ?? DEFAULT_COMPANY_ID;
    await this.ensureCompanySettingsSeeded(companyId);
    const created = await this.db.priceTagSetting.create({
      data: {
        id: randomUUID(),
        companyId,
        name: this.requireString(body.name, 'name'),
        width: this.toNumber(body.width) ?? 40,
        length: this.toNumber(body.length) ?? 20,
        barcodeType: this.optionalString(body.barcode_type) ?? 'EAN13',
        barcodeTypeId:
          this.optionalString(body.barcode_type_id) ??
          '5517af95-ea38-444e-bf19-90fe4e9e4df7',
        properties: (body.properties ?? null) as any,
      },
    });

    return {
      id: created.id,
      company_id: created.companyId,
      name: created.name,
      width: created.width,
      length: created.length,
      barcode_type: created.barcodeType,
      barcode_type_id: created.barcodeTypeId,
      properties: created.properties,
    };
  }

  async updatePriceTag(id: string, body: Record<string, unknown>, resolvedCompanyId?: string) {
    const priceTag = await this.db.priceTagSetting.findUnique({ where: { id } });
    if (!priceTag || (resolvedCompanyId && priceTag.companyId !== resolvedCompanyId)) {
      throw new NotFoundException('Price tag not found');
    }
    const updated = await this.db.priceTagSetting.update({
      where: { id },
      data: {
        ...(body.company_id !== undefined
          ? { companyId: this.requireString(body.company_id, 'company_id') }
          : {}),
        ...(body.name !== undefined
          ? { name: this.requireString(body.name, 'name') }
          : {}),
        ...(body.width !== undefined
          ? { width: this.toRequiredNumber(body.width, 'width') }
          : {}),
        ...(body.length !== undefined
          ? { length: this.toRequiredNumber(body.length, 'length') }
          : {}),
        ...(body.barcode_type !== undefined
          ? {
              barcodeType: this.requireString(body.barcode_type, 'barcode_type'),
            }
          : {}),
        ...(body.barcode_type_id !== undefined
          ? {
              barcodeTypeId: this.requireString(
                body.barcode_type_id,
                'barcode_type_id',
              ),
            }
          : {}),
        ...(body.properties !== undefined ? { properties: body.properties as any } : {}),
      } as any,
    });

    return {
      id: updated.id,
      company_id: updated.companyId,
      name: updated.name,
      width: updated.width,
      length: updated.length,
      barcode_type: updated.barcodeType,
      barcode_type_id: updated.barcodeTypeId,
      properties: updated.properties,
    };
  }

  async deletePriceTag(id: string, companyId?: string) {
    const existing = await this.db.priceTagSetting.findUnique({ where: { id } });
    if (!existing || (companyId && existing.companyId !== companyId)) {
      throw new NotFoundException('Price tag not found');
    }
    const deleted = await this.db.priceTagSetting.delete({ where: { id } });

    return {
      success: true,
      price_tag: {
        id: deleted.id,
        company_id: deleted.companyId,
        name: deleted.name,
        width: deleted.width,
        length: deleted.length,
        barcode_type: deleted.barcodeType,
        barcode_type_id: deleted.barcodeTypeId,
        properties: deleted.properties,
      },
    };
  }

  async getCompanyPaymentTypes(limit?: number, companyId?: string) {
    const targetCompanyId = companyId?.trim() || DEFAULT_COMPANY_ID;
    const companyPaymentTypes =
      await this.getPersistedCompanyPaymentTypes(targetCompanyId);

    return {
      count: companyPaymentTypes.length,
      company_payment_types: companyPaymentTypes.slice(
        0,
        this.normalizeLimit(limit, 1000),
      ),
    };
  }

  async createCompanyPaymentType(body: Record<string, unknown>) {
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

    await this.ensureCompanyPaymentTypesSeeded(companyId);

    try {
      const created = await this.db.companyPaymentType.create({
        data: {
          companyId,
          name,
          token: this.optionalString(body.token) ?? '',
          isEditable: this.optionalBoolean(body.is_editable) ?? true,
          dontShowInMakePayment:
            this.optionalBoolean(body.dont_show_in_make_payment) ?? false,
          dontShowInSettings:
            this.optionalBoolean(body.dont_show_in_settings) ?? false,
          isCashPaymentType:
            this.optionalBoolean(body.is_cash_payment_type) ?? false,
          paymentTypeId,
          paymentTypeName,
        },
      });

      return this.toCompanyPaymentTypeResponse(created);
    } catch (error: any) {
      if (error?.code === 'P2002') {
        throw new ConflictException(
          'Company payment type with this name already exists',
        );
      }

      throw error;
    }
  }

  async updateCompanyPaymentType(id: string, body: Record<string, unknown>) {
    const paymentType = await this.db.companyPaymentType.findUnique({
      where: { id },
    });

    if (!paymentType) {
      throw new NotFoundException('Company payment type not found');
    }

    const updatedPaymentType = await this.db.companyPaymentType.update({
      where: { id },
      data: {
        ...(body.name !== undefined
          ? { name: this.requireString(body.name, 'name') }
          : {}),
        ...(body.company_id !== undefined
          ? {
              companyId: this.requireString(body.company_id, 'company_id'),
            }
          : {}),
        ...(body.token !== undefined
          ? {
              token: this.optionalString(body.token) ?? '',
            }
          : {}),
        ...(body.is_editable !== undefined
          ? {
              isEditable:
                this.optionalBoolean(body.is_editable) ?? false,
            }
          : {}),
        ...(body.dont_show_in_make_payment !== undefined
          ? {
              dontShowInMakePayment:
                this.optionalBoolean(body.dont_show_in_make_payment) ?? false,
            }
          : {}),
        ...(body.dont_show_in_settings !== undefined
          ? {
              dontShowInSettings:
                this.optionalBoolean(body.dont_show_in_settings) ?? false,
            }
          : {}),
        ...(body.is_cash_payment_type !== undefined
          ? {
              isCashPaymentType:
                this.optionalBoolean(body.is_cash_payment_type) ?? false,
            }
          : {}),
        ...(body.payment_type_id !== undefined
          ? {
              paymentTypeId: this.requireString(
                body.payment_type_id,
                'payment_type_id',
              ),
            }
          : {}),
        ...(body.payment_type_name !== undefined
          ? {
              paymentTypeName: this.requireString(
                body.payment_type_name,
                'payment_type_name',
              ),
            }
          : {}),
        ...(body.payment_type !== undefined
          ? {
              ...(this.optionalNestedString(body.payment_type, 'id')
                ? {
                    paymentTypeId: this.requireString(
                      this.optionalNestedString(body.payment_type, 'id'),
                      'payment_type.id',
                    ),
                  }
                : {}),
              ...(this.optionalNestedString(body.payment_type, 'name')
                ? {
                    paymentTypeName: this.requireString(
                      this.optionalNestedString(body.payment_type, 'name'),
                      'payment_type.name',
                    ),
                  }
                : {}),
            }
          : {}),
      },
    });

    return this.toCompanyPaymentTypeResponse(updatedPaymentType);
  }

  async deleteCompanyPaymentType(id: string) {
    const existing = await this.db.companyPaymentType.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException('Company payment type not found');
    }

    const deleted = await this.db.companyPaymentType.delete({
      where: { id },
    });

    return {
      success: true,
      company_payment_type: this.toCompanyPaymentTypeResponse(deleted),
    };
  }

  async getCashBoxes(query: {
    page?: number;
    limit?: number;
    name?: string;
    companyId?: string;
  }) {
    const targetCompanyId = query.companyId?.trim() || DEFAULT_COMPANY_ID;
    await this.ensureCompanySettingsSeeded(targetCompanyId);
    await this.ensureShopsSeeded(targetCompanyId);
    await this.ensureCashboxesSeeded(targetCompanyId);
    const companyPaymentTypes =
      await this.getPersistedCompanyPaymentTypes(targetCompanyId);
    const safeLimit = this.normalizeLimit(query.limit, 10);
    const safePage = Math.max(1, Number(query.page) || 1);
    const normalizedName = (query.name ?? '').trim().toLowerCase();
    const cashBoxes = await this.db.cashbox.findMany({
      where: {
        companyId: targetCompanyId,
        ...(normalizedName
          ? {
              name: {
                contains: normalizedName,
                mode: 'insensitive',
              },
            }
          : {}),
      },
      include: {
        shop: true,
      },
      orderBy: {
        name: 'asc',
      },
    });

    const prepared = cashBoxes.map((cashBox: any) => ({
      id: cashBox.id,
      company_id: cashBox.companyId,
      shop_id: cashBox.shopId,
      name: cashBox.name,
      cheque_id: cashBox.chequeId ?? '',
      e_pos: cashBox.ePos ?? 0,
      web_kassa: cashBox.webKassa ?? 0,
      shop: {
        id: this.stringOrDefault(cashBox.shop?.id, ''),
        name: this.stringOrDefault(cashBox.shop?.name, ''),
        phone_numbers: Array.isArray(cashBox.shop?.phoneNumbers)
          ? cashBox.shop.phoneNumbers
          : null,
        facebook: this.stringOrDefault(cashBox.shop?.facebook, ''),
        instagram: this.stringOrDefault(cashBox.shop?.instagram, ''),
        telegram: this.stringOrDefault(cashBox.shop?.telegram, ''),
        website: this.stringOrDefault(cashBox.shop?.website, ''),
        working_hours: cashBox.shop?.workingHours ?? null,
      },
      payment_types: companyPaymentTypes.map((type) => ({
        id: randomUUID(),
        company_payment_type: {
          ...type,
          company_id: '',
        },
        is_active: !type.dont_show_in_make_payment,
      })),
      tariff_limits: {
        company_tariff: '',
        cashbox_count: 0,
        products_count: 0,
        users_count: 0,
        customers_count: 0,
      },
    }));

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

  private async getPersistedCompanyPaymentTypes(companyId: string) {
    await this.ensureCompanyPaymentTypesSeeded(companyId);
    await this.ensureDebtCompanyPaymentType(companyId);
    const paymentTypes = await this.db.companyPaymentType.findMany({
      where: {
        companyId,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return paymentTypes.map((paymentType: any) =>
      this.toCompanyPaymentTypeResponse(paymentType),
    );
  }

  private async ensureCompanyPaymentTypesSeeded(companyId: string) {
    const existingCount = await this.db.companyPaymentType.count({
      where: {
        companyId,
      },
    });

    if (existingCount > 0) {
      return;
    }

    const defaults = this.parseJsonArray<CompanyPaymentType>(
      process.env.COMPANY_PAYMENT_TYPES_JSON,
      DEFAULT_COMPANY_PAYMENT_TYPES,
    ).filter((item) => this.stringOrDefault(item.company_id, '') === companyId);

    if (!defaults.length) {
      return;
    }

    await this.db.companyPaymentType.createMany({
      data: defaults.map((item) => {
        const paymentTypeMeta =
          item.payment_type &&
          typeof item.payment_type === 'object' &&
          !Array.isArray(item.payment_type)
            ? (item.payment_type as Record<string, unknown>)
            : {};

        return {
          id: this.stringOrDefault(item.id, randomUUID()),
          companyId,
          name: this.stringOrDefault(item.name, ''),
          token: this.stringOrDefault(item.token, ''),
          isEditable: Boolean(item.is_editable),
          dontShowInMakePayment: Boolean(item.dont_show_in_make_payment),
          dontShowInSettings: Boolean(item.dont_show_in_settings),
          isCashPaymentType: Boolean(item.is_cash_payment_type),
          paymentTypeId: this.stringOrDefault(
            paymentTypeMeta.id,
            '00ed9cff-9576-432f-849b-7bbcc2fed640',
          ),
          paymentTypeName: this.stringOrDefault(
            paymentTypeMeta.name,
            'РљР°СЃС‚РѕРјРЅС‹Р№',
          ),
        };
      }),
      skipDuplicates: true,
    });
  }

  private async ensureDebtCompanyPaymentType(companyId: string) {
    await this.db.companyPaymentType.upsert({
      where: {
        companyId_name: {
          companyId,
          name: 'Долг',
        },
      },
      update: {
        token: '',
        isEditable: false,
        dontShowInMakePayment: false,
        dontShowInSettings: true,
        isCashPaymentType: false,
        paymentTypeId: '00ed9cff-9576-432f-849b-7bbcc2fed640',
        paymentTypeName: 'Кастомный',
      },
      create: {
        companyId,
        name: 'Долг',
        token: '',
        isEditable: false,
        dontShowInMakePayment: false,
        dontShowInSettings: true,
        isCashPaymentType: false,
        paymentTypeId: '00ed9cff-9576-432f-849b-7bbcc2fed640',
        paymentTypeName: 'Кастомный',
      },
    });
  }

  private toCompanyPaymentTypeResponse(paymentType: {
    id: string;
    companyId: string;
    name: string;
    token: string;
    isEditable: boolean;
    dontShowInMakePayment: boolean;
    dontShowInSettings: boolean;
    isCashPaymentType: boolean;
    paymentTypeId: string;
    paymentTypeName: string;
  }) {
    return {
      id: paymentType.id,
      company_id: paymentType.companyId,
      name: paymentType.name,
      token: paymentType.token,
      is_editable: paymentType.isEditable,
      dont_show_in_make_payment: paymentType.dontShowInMakePayment,
      dont_show_in_settings: paymentType.dontShowInSettings,
      is_cash_payment_type: paymentType.isCashPaymentType,
      payment_type: {
        id: paymentType.paymentTypeId,
        name: paymentType.paymentTypeName,
      },
    };
  }

  private async resolveCompanyId(companyId?: string) {
    const normalized = companyId?.trim();
    if (normalized) {
      return normalized;
    }

    const company = await this.db.company.findFirst({
      where: { isActive: true },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });

    return company?.id ?? null;
  }

  private async ensureReferenceDataSeeded() {
    const countriesCount = await this.db.countryReference.count();
    if (countriesCount === 0) {
      await this.db.countryReference.createMany({
        data: DEFAULT_COUNTRIES.map((country) => ({
          id: country.id,
          name: country.name,
          code: country.code,
        })),
        skipDuplicates: true,
      });
    }

    const timeZonesCount = await this.db.timeZoneReference.count();
    if (timeZonesCount === 0) {
      await this.db.timeZoneReference.createMany({
        data: DEFAULT_TIME_ZONES.map((timeZone) => ({
          id: timeZone.id,
          countryId: timeZone.country_id || null,
          name: timeZone.name,
          shortName: timeZone.short_name,
          gmtOffset: timeZone.gmt_offset,
        })),
        skipDuplicates: true,
      });
    }
  }

  private async ensureCompanySettingsSeeded(companyId: string) {
    const companyExists = await this.db.company.findUnique({
      where: { id: companyId },
      select: { id: true },
    });
    if (!companyExists) {
      return;
    }

    await this.ensureReferenceDataSeeded();
    await this.ensureCompanyPaymentTypesSeeded(companyId);

    await this.db.companyProfileSetting.upsert({
      where: { companyId },
      update: {},
      create: {
        companyId,
        data: {
          ...DEFAULT_COMPANY_PROFILE,
          ...this.parseJsonObject(process.env.COMPANY_PROFILE_JSON),
          id: companyId,
        },
      },
    });

    await this.db.companyTariffSetting.upsert({
      where: { companyId },
      update: {},
      create: {
        companyId,
        data: {
          ...DEFAULT_COMPANY_TARIFF,
          ...this.parseJsonObject(process.env.COMPANY_TARIFF_JSON),
          billz_company_id: companyId,
        },
      },
    });

    const currencyMap = this.parseJsonMap<CompanyCurrencyConfig>(
      process.env.COMPANY_CURRENCY_MAP_JSON,
    );
    const currencyConfig = currencyMap[companyId];
    await this.db.companyCurrencySetting.upsert({
      where: { companyId },
      update: {},
      create: {
        id: this.resolveCompanyCurrencyConfigId(companyId, currencyConfig?.id),
        companyId,
        currencyId: currencyConfig?.currency?.id ?? DEFAULT_CURRENCY_ID,
        name: currencyConfig?.currency?.name ?? DEFAULT_CURRENCY_NAME,
        symbol: currencyConfig?.currency?.symbol ?? DEFAULT_CURRENCY_SYMBOL,
        isoCode: currencyConfig?.currency?.iso_code ?? DEFAULT_CURRENCY_ISO_CODE,
        exchangeRate:
          currencyConfig?.currency?.exchange_rate ??
          DEFAULT_CURRENCY_EXCHANGE_RATE,
        precision:
          currencyConfig?.currency?.precision ?? DEFAULT_CURRENCY_PRECISION,
        isEditable: currencyConfig?.is_editable ?? DEFAULT_CURRENCY_EDITABLE,
      },
    });
    this.currencyIsoCache.set(
      companyId,
      currencyConfig?.currency?.iso_code ?? DEFAULT_CURRENCY_ISO_CODE,
    );

    await this.db.loyaltyProgramSetting.upsert({
      where: { companyId },
      update: {},
      create: {
        companyId,
        isActive: false,
        name: '',
        type: '',
        cashbackPercent: 0,
        bonusPercent: 0,
        levels: [],
        hasCustomerBalance: false,
        hasCustomerDebt: false,
      },
    });

    await this.ensureMeasurementUnitsSeeded(companyId);

    const priceTagCount = await this.db.priceTagSetting.count({
      where: { companyId },
    });
    if (priceTagCount === 0) {
      const priceTags = this.parseJsonArray<PriceTagProfile>(
        process.env.PRICE_TAGS_JSON,
        DEFAULT_PRICE_TAGS,
      ).filter((item) => this.stringOrDefault(item.company_id, '') === companyId);
      await this.db.priceTagSetting.createMany({
        data: priceTags.map((item) => ({
          id: this.stringOrDefault(item.id, randomUUID()),
          companyId,
          name: this.stringOrDefault(item.name, ''),
          width: Number(item.width) || 40,
          length: Number(item.length) || 20,
          barcodeType: this.stringOrDefault(item.barcode_type, 'EAN13'),
          barcodeTypeId: this.stringOrDefault(
            item.barcode_type_id,
            '5517af95-ea38-444e-bf19-90fe4e9e4df7',
          ),
          properties: (item.properties ?? null) as any,
        })) as any,
        skipDuplicates: true,
      });
    }
  }

  private async ensureMeasurementUnitsSeeded(companyId: string) {
    try {
    const companyExists = await this.db.company.findUnique({
      where: { id: companyId },
      select: { id: true },
    });
    if (!companyExists) {
      this.logger.warn(
        `Skipping measurement unit seed because company was not found: ${companyId}`,
      );
      return;
    }

    const measurementUnitCount = await this.db.measurementUnitSetting.count({
      where: { companyId },
    });
    if (measurementUnitCount === 0) {
      const measurementUnits = this.parseJsonArray<MeasurementUnitProfile>(
        process.env.MEASUREMENT_UNITS_JSON,
        [DEFAULT_MEASUREMENT_UNIT],
      );
      await this.db.measurementUnitSetting.createMany({
        data: measurementUnits.map((unit) => ({
          id: this.resolveDefaultMeasurementUnitId(unit, companyId),
          companyId,
          name: this.stringOrDefault(
            unit.name,
            this.stringOrDefault(DEFAULT_MEASUREMENT_UNIT.name, 'Штука'),
          ),
          shortName: this.stringOrDefault(
            unit.short_name,
            this.stringOrDefault(DEFAULT_MEASUREMENT_UNIT.short_name, 'шт'),
          ),
          precision: this.stringOrDefault(
            unit.precision,
            this.stringOrDefault(DEFAULT_MEASUREMENT_UNIT.precision, '1'),
          ),
          isEditable: Boolean(unit.is_editable),
          isDefault: Boolean(unit.is_default),
        })),
        skipDuplicates: true,
      });
    }
    } catch (error) {
      this.logger.error(
        `Failed to seed measurement units for companyId=${companyId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw error;
    }
  }

  private async ensureShopsSeeded(companyId: string) {
    const companyExists = await this.db.company.findUnique({
      where: { id: companyId },
      select: { id: true },
    });
    if (!companyExists) {
      return;
    }
    const existingCount = await this.db.shop.count({
      where: { companyId },
    });
    if (existingCount > 0) {
      return;
    }

    const shops = this.parseJsonArray<ShopProfile>(
      process.env.SHOPS_JSON,
      DEFAULT_SHOPS,
    ).filter((item) => this.stringOrDefault(item.company_id, '') === companyId);

    for (const shop of shops) {
      await this.db.shop.create({
        data: {
          id: this.stringOrDefault(shop.id, randomUUID()),
          companyId,
          name: this.stringOrDefault(shop.name, ''),
          branchCode: this.stringOrDefault(shop.branch_code, ''),
          address: this.stringOrDefault(shop.address, ''),
          phoneNumbers: Array.isArray(shop.phone_numbers) ? shop.phone_numbers : [],
          facebook: this.stringOrDefault(shop.facebook, ''),
          instagram: this.stringOrDefault(shop.instagram, ''),
          telegram: this.stringOrDefault(shop.telegram, ''),
          website: this.stringOrDefault(shop.website, ''),
          workingHours: (shop.working_hours ?? null) as any,
          isActive: shop.is_active !== false,
        },
      });
    }
  }

  private async ensureCashboxesSeeded(companyId: string) {
    const companyExists = await this.db.company.findUnique({
      where: { id: companyId },
      select: { id: true },
    });
    if (!companyExists) {
      return;
    }
    const existingCount = await this.db.cashbox.count({
      where: { companyId },
    });
    if (existingCount > 0) {
      return;
    }

    const cashBoxes = this.parseJsonArray<CashBoxProfile>(
      process.env.CASH_BOXES_JSON,
      DEFAULT_CASH_BOXES,
    ).filter((item) => this.stringOrDefault(item.company_id, '') === companyId);

    for (const cashBox of cashBoxes) {
      await this.db.cashbox.create({
        data: {
          id: this.stringOrDefault(cashBox.id, randomUUID()),
          companyId,
          shopId: this.stringOrDefault(cashBox.shop_id, ''),
          name: this.stringOrDefault(cashBox.name, ''),
          chequeId: this.optionalString(cashBox.cheque_id) ?? '',
          ePos: Number(cashBox.e_pos) || 0,
          webKassa: Number(cashBox.web_kassa) || 0,
          isActive: cashBox.is_active !== false,
        },
      });
    }
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

  private resolveDefaultMeasurementUnitId(
    unit: MeasurementUnitProfile,
    companyId: string,
  ) {
    const unitId = this.stringOrDefault(unit.id, randomUUID());
    return companyId === DEFAULT_COMPANY_ID ? unitId : `${companyId}:${unitId}`;
  }

  private resolveCompanyCurrencyConfigId(
    companyId: string,
    configuredId?: string,
  ) {
    const explicitId = this.optionalString(configuredId);
    if (explicitId) {
      return companyId === DEFAULT_COMPANY_ID
        ? explicitId
        : `${companyId}:${explicitId}`;
    }

    return companyId === DEFAULT_COMPANY_ID
      ? DEFAULT_CURRENCY_CONFIG_ID
      : `${companyId}:${DEFAULT_CURRENCY_CONFIG_ID}`;
  }

  private toMeasurementUnitResponse(unit: {
    id: string;
    companyId: string;
    name: string;
    shortName: string;
    precision: string;
    isEditable: boolean;
    isDefault: boolean;
  }) {
    return {
      id: unit.id,
      name: unit.name,
      company_id: unit.companyId,
      short_name: unit.shortName,
      precision: unit.precision,
      is_editable: unit.isEditable,
      is_default: unit.isDefault,
    };
  }

  private normalizeMeasurementPrecision(value: unknown) {
    const precision = this.requireString(value, 'precision');
    if (!SUPPORTED_MEASUREMENT_PRECISIONS.has(precision)) {
      throw new BadRequestException(
        'precision must be one of: 1, .0, .00, .000',
      );
    }

    return precision;
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

  private normalizeDate(value: Date | string | null | undefined) {
    if (!value) {
      return null;
    }

    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  private getDateParts(value: Date, timeZone: string) {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });

    const parts = formatter.formatToParts(value);
    const map = new Map(parts.map((part) => [part.type, part.value]));

    return {
      year: map.get('year') ?? '0000',
      month: map.get('month') ?? '00',
      day: map.get('day') ?? '00',
      hours: map.get('hour') ?? '00',
      minutes: map.get('minute') ?? '00',
      seconds: map.get('second') ?? '00',
    };
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

  private toRequiredNumber(value: unknown, fieldName: string) {
    const parsed = this.toNumber(value);
    if (parsed === undefined) {
      throw new BadRequestException(`${fieldName} must be a number`);
    }

    return parsed;
  }

  private optionalNestedString(value: unknown, key: string) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return undefined;
    }

    return this.optionalString((value as Record<string, unknown>)[key]);
  }
}
