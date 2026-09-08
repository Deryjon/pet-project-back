import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ImportNormalizerService } from './import-normalizer.service';

// Minimum name similarity required to suggest an existing product.
const MIN_FUZZY_CONFIDENCE = 50;
const PRODUCT_BATCH_SIZE = 500;

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
    const aliasMatchers = [
      ...(sku
        ? [
            {
              where: { supplierSku: sku },
              method: 'SUPPLIER_SKU',
              confidence: 100,
            },
          ]
        : []),
      ...(barcode
        ? [
            {
              where: { supplierBarcode: barcode },
              method: 'SUPPLIER_BARCODE',
              confidence: 100,
            },
          ]
        : []),
      {
        where: { supplierName: { equals: name, mode: 'insensitive' } },
        method: 'SUPPLIER_NAME',
        confidence: 98,
      },
      {
        where: { normalizedName: this.normalizer.normalize(name) },
        method: 'NORMALIZED_NAME',
        confidence: 94,
      },
    ];
    for (const candidate of aliasMatchers) {
      const aliases = await db.supplierProductAlias.findMany({
        where: {
          companyId,
          supplierId,
          product: { companyId },
          ...candidate.where,
        },
        include: { product: true },
        orderBy: { id: 'asc' },
      });
      if (!aliases.length) continue;

      const productIds = new Set(
        aliases.map((alias: any) => alias.productId ?? alias.product?.id),
      );
      if (productIds.size > 1) {
        return {
          product: null,
          method: 'ALIAS_CONFLICT',
          confidence: candidate.confidence,
          conflict: true,
        };
      }

      const alias = aliases[0];
      await db.supplierProductAlias.update({
        where: { id: alias.id },
        data: { usageCount: { increment: 1 }, lastSeenAt: new Date() },
      });
      return {
        product: alias.product,
        method: candidate.method,
        confidence: candidate.confidence,
        conflict: false,
      };
    }

    const normalized = this.normalizer.normalize(name);
    const sourceFeatures = this.normalizer.importantFeatures(name);
    const a = new Set(normalized.split(' ').filter(Boolean));
    let lastProductId: number | undefined;
    let bestMatch: {
      product: any;
      method: string;
      confidence: number;
      conflict: boolean;
    } | null = null;

    while (true) {
      const products = await db.product.findMany({
        where: {
          companyId,
          archivedAt: null,
          ...(lastProductId === undefined ? {} : { id: { gt: lastProductId } }),
        },
        orderBy: { id: 'asc' },
        take: PRODUCT_BATCH_SIZE,
      });
      for (const product of products) {
        const target = this.normalizer.normalize(product.name);
        const b = new Set(target.split(' ').filter(Boolean));
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
        if (!bestMatch || confidence > bestMatch.confidence) {
          bestMatch = { product, method: 'FUZZY_NAME', confidence, conflict };
        }
      }
      if (products.length < PRODUCT_BATCH_SIZE) break;
      lastProductId = products[products.length - 1].id;
    }
    return bestMatch && bestMatch.confidence >= MIN_FUZZY_CONFIDENCE
      ? bestMatch
      : null;
  }
}
