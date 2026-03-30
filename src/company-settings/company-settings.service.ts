import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';

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

const DEFAULT_COUNTRIES: CountryItem[] = [
  {
    id: 'ce6a779e-edd4-47c2-92de-751f0b0c2c7a',
    name: 'Казахстан',
    code: 'KZ',
  },
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
  {
    id: '584cd348-1a56-41e6-b519-5d50f01bc3c4',
    country_id: 'ce6a779e-edd4-47c2-92de-751f0b0c2c7a',
    name: 'Алматы',
    short_name: 'Asia/Almaty',
    gmt_offset: '+05:00',
  },
  {
    id: 'b1cf77c6-2fe1-4e59-b029-4adaeaf5406b',
    country_id: '',
    name: 'Бишкек',
    short_name: 'Asia/Bishkek',
    gmt_offset: '+06:00',
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
  shops_count: 0,
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

const DEFAULT_SHOPS: ShopProfile[] = [
  {
    id: 'be25385b-8db2-4d96-8240-f1bb6bb3420c',
    company_id: DEFAULT_COMPANY_ID,
    name: 'Globus Mall',
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

@Injectable()
export class CompanySettingsService {
  getDefaultCurrency(companyId?: string): CompanyCurrencyConfig {
    const targetCompanyId = companyId?.trim() || DEFAULT_COMPANY_ID;
    const map = this.parseJsonMap<CompanyCurrencyConfig>(
      process.env.COMPANY_CURRENCY_MAP_JSON,
    );
    const fromMap = targetCompanyId ? map[targetCompanyId] : undefined;

    const currencyId = fromMap?.currency?.id ?? randomUUID();

    return {
      id: fromMap?.id ?? randomUUID(),
      company_id: targetCompanyId,
      currency: {
        id: currencyId,
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
    const safeLimit = this.normalizeLimit(limit, 1000);

    return {
      count: countries.length,
      countries: countries.slice(0, safeLimit),
    };
  }

  getTimeZones(limit?: number, countryId?: string) {
    const timeZones = this.parseJsonArray<TimeZoneItem>(
      process.env.TIME_ZONES_JSON,
      DEFAULT_TIME_ZONES,
    );
    const safeLimit = this.normalizeLimit(limit, 1000);
    const filtered = countryId
      ? timeZones.filter((item) => item.country_id === countryId)
      : timeZones;

    return {
      count: filtered.length,
      time_zones: filtered.slice(0, safeLimit),
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

  getCompany() {
    const custom = this.parseJsonObject(process.env.COMPANY_PROFILE_JSON);
    const merged = {
      ...DEFAULT_COMPANY_PROFILE,
      ...custom,
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

  getShops(query: {
    page?: number;
    limit?: number;
    name?: string;
    companyId?: string;
  }) {
    const shops = this.parseJsonArray<ShopProfile>(
      process.env.SHOPS_JSON,
      DEFAULT_SHOPS,
    );

    const safeLimit = this.normalizeLimit(query.limit, 10);
    const safePage = Math.max(1, Number(query.page) || 1);
    const normalizedName = (query.name ?? '').trim().toLowerCase();
    const companyId = query.companyId?.trim() || DEFAULT_COMPANY_ID;

    const filtered = shops
      .filter(
        (shop) =>
          this.stringOrDefault(shop.company_id, '') === companyId &&
          (!normalizedName ||
            this.stringOrDefault(shop.name, '')
              .toLowerCase()
              .includes(normalizedName)),
      )
      .slice((safePage - 1) * safeLimit, safePage * safeLimit);

    const allForCompany = shops.filter(
      (shop) => this.stringOrDefault(shop.company_id, '') === companyId,
    );

    return {
      count: allForCompany.length,
      shops: filtered,
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
}
