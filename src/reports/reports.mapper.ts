import { Injectable } from '@nestjs/common';
import { ReportFilterDto } from './dto/report-filter.dto';

@Injectable()
export class ReportsMapper {
  toFilterDto(raw: Record<string, unknown>): ReportFilterDto {
    return {
      from: this.toOptionalString(raw.from),
      to: this.toOptionalString(raw.to),
      shopIds: this.toStringArray(raw.shopIds ?? raw.shopId),
      sellerIds: this.toIntArray(raw.sellerIds ?? raw.sellerId),
      productIds: this.toIntArray(raw.productIds ?? raw.productId),
      categoryIds: this.toIntArray(raw.categoryIds ?? raw.categoryId),
      supplierIds: this.toIntArray(raw.supplierIds ?? raw.supplierId),
      brandIds: this.toIntArray(raw.brandIds ?? raw.brandId),
      page: this.toPositiveInt(raw.page),
      perPage: this.toPositiveInt(raw.perPage),
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
