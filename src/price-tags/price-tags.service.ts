import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PriceTagsService {
  constructor(private readonly prisma: PrismaService) {}

  private parseIds(productIds: string): number[] {
    return productIds
      .split(',')
      .map((id) => Number(id.trim()))
      .filter((id) => Number.isInteger(id) && id > 0);
  }

  private parseCopies(copies?: string): Map<number, number> {
    const map = new Map<number, number>();
    if (!copies) return map;
    for (const pair of copies.split(',')) {
      const [idPart, countPart] = pair.split(':');
      const id = Number(idPart?.trim());
      const count = Number(countPart?.trim());
      if (Number.isInteger(id) && id > 0 && Number.isFinite(count) && count > 0) {
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
    const ids = this.parseIds(productIds);
    const copiesMap = this.parseCopies(copies);

    const products = await this.prisma.product.findMany({
      where: { id: { in: ids }, companyId },
      include: { stocks: true },
    });

    const byId = new Map(products.map((p) => [p.id, p]));

    return {
      products: ids
        .map((id) => byId.get(id))
        .filter((p): p is NonNullable<typeof p> => Boolean(p))
        .map((p) => {
          const stock = branchId
            ? p.stocks.find((s) => s.branchCode === branchId)
            : p.stocks[0];
          const price = stock?.salePrice ?? p.discountPrice ?? p.salePrice ?? 0;

          return {
            id: p.id,
            name: p.name,
            sku: p.sku ?? '',
            barcode: p.barcode ?? '',
            price,
            unit: p.unit ?? '',
            copies: copiesMap.get(p.id) ?? 1,
          };
        }),
    };
  }
}
