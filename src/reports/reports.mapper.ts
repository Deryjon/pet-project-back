import { Injectable } from '@nestjs/common';
import { ReportFilterDto } from './dto/report-filter.dto';

@Injectable()
export class ReportsMapper {
  toFilterDto(raw: Record<string, unknown>): ReportFilterDto {
    return {
      from: this.toOptionalString(
        raw.from ?? raw.date_from ?? raw.dateFrom ?? raw.start_date ?? raw.startDate,
      ),
      to: this.toOptionalString(
        raw.to ?? raw.date_to ?? raw.dateTo ?? raw.end_date ?? raw.endDate,
      ),
      shopIds: this.toStringArray(raw.shopIds ?? raw.shop_ids ?? raw.shopId ?? raw.shop_id),
      sellerIds: this.toIntArray(raw.sellerIds ?? raw.seller_ids ?? raw.sellerId ?? raw.seller_id),
      productIds: this.toIntArray(raw.productIds ?? raw.product_ids ?? raw.productId ?? raw.product_id),
      categoryIds: this.toIntArray(raw.categoryIds ?? raw.category_ids ?? raw.categoryId ?? raw.category_id),
      supplierIds: this.toIntArray(raw.supplierIds ?? raw.supplier_ids ?? raw.supplierId ?? raw.supplier_id),
      brandIds: this.toIntArray(raw.brandIds ?? raw.brand_ids ?? raw.brandId ?? raw.brand_id),
      page: this.toPositiveInt(raw.page),
      perPage: this.toPositiveInt(raw.perPage ?? raw.per_page ?? raw.limit ?? raw.page_size),
    };
  }

  paginate<T>(items: T[], filter: ReportFilterDto) {
    const page = Math.max(1, filter.page ?? 1);
    const perPage = Math.max(1, Math.min(200, filter.perPage ?? 50));
    const total = items.length;
    const start = (page - 1) * perPage;

    return {
      page,
      perPage,
      total,
      pages: Math.max(1, Math.ceil(total / perPage)),
      rows: items.slice(start, start + perPage),
    };
  }

  toDailySeries(
    rows: Array<{ paid_at?: Date | string | null; created_at?: Date | string | null; value: number }>,
  ) {
    const grouped = new Map<string, number>();

    for (const row of rows) {
      const source = row.paid_at ?? row.created_at;
      if (!source) {
        continue;
      }
      const date = new Date(source).toISOString().slice(0, 10);
      grouped.set(date, (grouped.get(date) ?? 0) + Number(row.value ?? 0));
    }

    return [...grouped.entries()]
      .map(([date, value]) => ({ date, value }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  private toOptionalString(value: unknown) {
    return typeof value === 'string' ? value.trim() || undefined : undefined;
  }

  private toStringArray(value: unknown) {
    if (Array.isArray(value)) {
      return value
        .map((item) => this.toOptionalString(item))
        .filter((item): item is string => Boolean(item));
    }
    if (typeof value === 'string') {
      return value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
    }
    return undefined;
  }

  private toIntArray(value: unknown) {
    const values = this.toStringArray(value);
    if (!values?.length) {
      return undefined;
    }

    const parsed = values
      .map((item) => Number(item))
      .filter((item) => Number.isInteger(item));

    return parsed.length ? parsed : undefined;
  }

  private toPositiveInt(value: unknown) {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
  }
}
