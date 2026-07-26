import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PriceTagsService {
  constructor(private readonly prisma: PrismaService) {}

  private parseRequestedIds(productIds: string): string[] {
    return productIds
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);
  }

  // Keyed by the raw id string as sent by the client (same id space as
  // productIds — see below), not a normalized numeric id.
  private parseCopies(copies?: string): Map<string, number> {
    const map = new Map<string, number>();
    if (!copies) return map;
    for (const pair of copies.split(',')) {
      const [idPart, countPart] = pair.split(':');
      const id = idPart?.trim();
      const count = Number(countPart?.trim());
      if (id && Number.isFinite(count) && count > 0) {
        map.set(id, Math.floor(count));
      }
    }
    return map;
  }

  async getPriceTagsData(
    productIds: string,
    copies: string | undefined,
    companyId: string,
    branchId?: string,
  ) {
    // Callers may pass either the internal numeric id or the product's
    // public_id (UUID) — e.g. the catalog's product-detail card only exposes
    // public_id as `id`. Resolve both so a UUID here doesn't silently return
    // zero products.
    const requestedIds = this.parseRequestedIds(productIds);
    const copiesMap = this.parseCopies(copies);

    const numericIds = requestedIds
      .map((id) => Number(id))
      .filter((id) => Number.isInteger(id) && id > 0);
    const publicIds = requestedIds.filter((id) => !/^\d+$/.test(id));

    const [products, shop] = await Promise.all([
      this.prisma.product.findMany({
        where: {
          companyId,
          OR: [
            ...(numericIds.length ? [{ id: { in: numericIds } }] : []),
            ...(publicIds.length ? [{ publicId: { in: publicIds } }] : []),
          ],
        },
        include: { stocks: true },
      }),
      branchId
        ? this.prisma.shop.findFirst({ where: { companyId, branchCode: branchId } })
        : null,
    ]);

    const byNumericId = new Map(products.map((p) => [String(p.id), p]));
    const byPublicId = new Map(products.map((p) => [p.publicId, p]));
    const shopName = shop?.name ?? '';

    return {
      products: requestedIds
        .map((rawId) => ({ rawId, product: byNumericId.get(rawId) ?? byPublicId.get(rawId) }))
        .filter(
          (entry): entry is { rawId: string; product: NonNullable<typeof entry.product> } =>
            Boolean(entry.product),
        )
        .map(({ rawId, product: p }) => {
          const stock = branchId
            ? p.stocks.find((s) => s.branchCode === branchId)
            : p.stocks[0];
          const price = stock?.salePrice ?? p.discountPrice ?? p.salePrice ?? 0;

          const oldPrice = p.salePrice ?? 0;
          const hasDiscount =
            p.discountPrice != null && oldPrice > 0 && p.discountPrice < oldPrice;
          const discountPercent = hasDiscount
            ? Math.round((1 - p.discountPrice! / oldPrice) * 100)
            : 0;

          return {
            id: p.id,
            name: p.name,
            sku: p.sku ?? '',
            barcode: p.barcode ?? '',
            price,
            old_price: hasDiscount ? oldPrice : 0,
            discount_percent: discountPercent,
            unit: p.unit ?? '',
            shop_name: shopName,
            quantity: stock?.quantity ?? p.quantity ?? 0,
            copies: copiesMap.get(rawId) ?? 1,
          };
        }),
    };
  }
}
