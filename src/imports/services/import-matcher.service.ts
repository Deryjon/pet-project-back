import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ImportNormalizerService } from './import-normalizer.service';

// Minimum name similarity required to suggest an existing product.
const MIN_FUZZY_CONFIDENCE = 50;
const PRODUCT_BATCH_SIZE = 500;

type MatchCatalogProduct = {
  product: any;
  normalizedName: string;
  tokens: Set<string>;
  features: Record<string, string>;
};

type MatchContext = {
  products: MatchCatalogProduct[];
  aliases: any[];
};

type MatchResult = {
  product: any;
  method: string;
  confidence: number;
  conflict: boolean;
} | null;

@Injectable()
export class ImportMatcherService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly normalizer: ImportNormalizerService,
  ) {}

  async matchMany(
    companyId: string,
    supplierId: number,
    items: any[],
  ): Promise<MatchResult[]> {
    const context = await this.loadContext(companyId, supplierId);
    const results: MatchResult[] = [];
    for (const item of items) {
      results.push(await this.match(companyId, supplierId, item, context));
    }
    return results;
  }

  async match(
    companyId: string,
    supplierId: number,
    item: any,
    context?: MatchContext,
  ): Promise<MatchResult> {
    const name = item.correctedName || item.rawName;
    const sku = item.correctedSku || item.rawSku;
    const barcode = item.correctedBarcode || item.rawBarcode;
    const db = this.prisma as any;

    if (barcode) {
      const product = context
        ? context.products.find(
            (candidate) => candidate.product.barcode === barcode,
          )?.product
        : await db.product.findFirst({ where: { companyId, barcode } });
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
      const aliases = context
        ? context.aliases.filter((alias) =>
            this.aliasMatches(alias, candidate.method, sku, barcode, name),
          )
        : await db.supplierProductAlias.findMany({
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
    let bestMatch: {
      product: any;
      method: string;
      confidence: number;
      conflict: boolean;
    } | null = null;

    const catalog = context?.products ?? (await this.loadProducts(companyId));
    for (const candidate of catalog) {
      const product = candidate.product;
      const b = candidate.tokens;
      const common = [...a].filter((token) => b.has(token)).length;
      let confidence = Math.round(
        ((2 * common) / Math.max(1, a.size + b.size)) * 100,
      );
      const targetFeatures = candidate.features;
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
    return bestMatch && bestMatch.confidence >= MIN_FUZZY_CONFIDENCE
      ? bestMatch
      : null;
  }

  private aliasMatches(
    alias: any,
    method: string,
    sku: string | null | undefined,
    barcode: string | null | undefined,
    name: string,
  ) {
    if (method === 'SUPPLIER_SKU') return alias.supplierSku === sku;
    if (method === 'SUPPLIER_BARCODE') return alias.supplierBarcode === barcode;
    if (method === 'SUPPLIER_NAME')
      return alias.supplierName?.toLowerCase() === name.toLowerCase();
    return alias.normalizedName === this.normalizer.normalize(name);
  }

  private async loadContext(
    companyId: string,
    supplierId: number,
  ): Promise<MatchContext> {
    const [products, aliases] = await Promise.all([
      this.loadProducts(companyId),
      (this.prisma as any).supplierProductAlias.findMany({
        where: { companyId, supplierId, product: { companyId } },
        include: { product: true },
        orderBy: { id: 'asc' },
      }),
    ]);
    return { products, aliases };
  }

  private async loadProducts(companyId: string) {
    const db = this.prisma as any;
    const catalog: MatchCatalogProduct[] = [];
    let lastProductId: number | undefined;
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
      catalog.push(
        ...products.map((product: any) => {
          const normalizedName = this.normalizer.normalize(product.name);
          return {
            product,
            normalizedName,
            tokens: new Set(normalizedName.split(' ').filter(Boolean)),
            features: this.normalizer.importantFeatures(product.name),
          };
        }),
      );
      if (products.length < PRODUCT_BATCH_SIZE) break;
      lastProductId = products[products.length - 1].id;
    }
    return catalog;
  }
}
