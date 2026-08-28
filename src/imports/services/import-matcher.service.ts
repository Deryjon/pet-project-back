import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ImportNormalizerService } from './import-normalizer.service';

@Injectable()
export class ImportMatcherService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly normalizer: ImportNormalizerService,
  ) {}

  async match(companyId: string, supplierId: number, item: any) {
    const name = item.correctedName || item.rawName;
    const sku = item.correctedSku || item.rawSku;
    const barcode = item.correctedBarcode || item.rawBarcode;
    const db = this.prisma as any;

    if (barcode) {
      const product = await db.product.findFirst({
        where: { companyId, barcode },
      });
      if (product)
        return { product, method: 'BARCODE', confidence: 100, conflict: false };
    }
    const aliases = await db.supplierProductAlias.findMany({
      where: {
        companyId,
        supplierId,
        OR: [
          ...(sku ? [{ supplierSku: sku }] : []),
          ...(barcode ? [{ supplierBarcode: barcode }] : []),
          { supplierName: { equals: name, mode: 'insensitive' } },
          { normalizedName: this.normalizer.normalize(name) },
        ],
      },
      include: { product: true },
      take: 5,
    });
    const alias = aliases[0];
    if (alias) {
      await db.supplierProductAlias.update({
        where: { id: alias.id },
        data: { usageCount: { increment: 1 }, lastSeenAt: new Date() },
      });
      const method =
        sku && alias.supplierSku === sku
          ? 'SUPPLIER_SKU'
          : barcode && alias.supplierBarcode === barcode
            ? 'SUPPLIER_BARCODE'
            : alias.supplierName.toLowerCase() === name.toLowerCase()
              ? 'SUPPLIER_NAME'
              : 'NORMALIZED_NAME';
      return {
        product: alias.product,
        method,
        confidence:
          method === 'SUPPLIER_NAME'
            ? 98
            : method === 'NORMALIZED_NAME'
              ? 94
              : 100,
        conflict: false,
      };
    }

    const normalized = this.normalizer.normalize(name);
    const products = await db.product.findMany({
      where: { companyId, archivedAt: null },
      take: 500,
    });
    const sourceFeatures = this.normalizer.importantFeatures(name);
    const scored = products
      .map((product: any) => {
        const target = this.normalizer.normalize(product.name);
        const a = new Set(normalized.split(' '));
        const b = new Set(target.split(' '));
        const common = [...a].filter((token) => b.has(token)).length;
        let confidence = Math.round(
          ((2 * common) / Math.max(1, a.size + b.size)) * 100,
        );
        const targetFeatures = this.normalizer.importantFeatures(product.name);
        const conflict = Object.keys(sourceFeatures).some(
          (key) =>
            sourceFeatures[key] &&
            targetFeatures[key] &&
            sourceFeatures[key] !== targetFeatures[key],
        );
        if (conflict) confidence = Math.min(confidence, 60);
        return { product, method: 'FUZZY_NAME', confidence, conflict };
      })
      .sort((a: any, b: any) => b.confidence - a.confidence);
    return scored[0] ?? null;
  }
}
