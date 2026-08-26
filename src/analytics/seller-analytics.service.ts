import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ANALYTICS_CONFIG } from './analytics.config';
import {
  AnalyticsPeriod,
  DiscountInsight,
  ProductStat,
  SellerAnalyticsReport,
  UpsellGroupInsight,
} from './seller-analytics.types';

type SaleWithItems = {
  saleType: string;
  userId: number | null;
  branchCode: string | null;
  total: number;
  payableTotal: number;
  discountAmount: number;
  discountPercent: number;
  items: Array<{
    name: string;
    quantity: number;
    lineTotal: number;
    profitAtSale: number;
    product: { productGroupId: string | null; tier: string | null } | null;
  }>;
};

function revenueOf(sale: SaleWithItems) {
  const amount = sale.payableTotal !== 0 || sale.total === 0 || sale.discountAmount > 0 || sale.discountPercent > 0
    ? sale.payableTotal
    : sale.total;
  return sale.saleType === 'return' ? -amount : amount;
}

function average(values: number[]) {
  return values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

@Injectable()
export class SellerAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Builds a report per (seller, branch) pair that had at least one paid sale
   * in the period, for every seller active in the given company.
   */
  async buildCompanyReports(
    companyId: string,
    period: AnalyticsPeriod,
  ): Promise<SellerAnalyticsReport[]> {
    const rawSales = await this.prisma.sale.findMany({
      where: {
        companyId,
        status: {
          in: [
            'paid',
            'returned',
            'partially_returned',
            'exchanged',
            'partially_exchanged',
          ],
        },
        paidAt: { gte: period.start, lt: period.end },
        userId: { not: null },
      },
      select: {
        userId: true,
        saleType: true,
        branchCode: true,
        total: true,
        payableTotal: true,
        discountAmount: true,
        discountPercent: true,
        items: {
          select: {
            name: true,
            quantity: true,
            lineTotal: true,
            profitAtSale: true,
            product: { select: { productGroupId: true, tier: true } },
          },
        },
      },
    });

    const sales: SaleWithItems[] = rawSales.map((sale) => ({
      saleType: sale.saleType,
      userId: sale.userId,
      branchCode: sale.branchCode,
      total: Number(sale.total),
      payableTotal: Number(sale.payableTotal),
      discountAmount: Number(sale.discountAmount),
      discountPercent: Number(sale.discountPercent),
      items: sale.items.map((item) => ({
        name: item.name,
        quantity: Number(item.quantity),
        lineTotal: Number(item.lineTotal),
        profitAtSale: Number(item.profitAtSale),
        product: item.product,
      })),
    }));

    if (!sales.length) return [];

    const branchCodes = [
      ...new Set(sales.map((s) => s.branchCode).filter((v): v is string => !!v)),
    ];
    const sellerIds = [
      ...new Set(sales.map((s) => s.userId).filter((v): v is number => v !== null)),
    ];

    const [users, shops] = await Promise.all([
      this.prisma.user.findMany({
        where: { id: { in: sellerIds } },
        select: { id: true, firstName: true, lastName: true },
      }),
      this.prisma.shop.findMany({
        where: { companyId, branchCode: { in: branchCodes } },
        select: { name: true, branchCode: true },
      }),
    ]);
    const userNames = new Map(users.map((u) => [u.id, `${u.firstName} ${u.lastName}`.trim()]));
    const shopNames = new Map(shops.map((s) => [s.branchCode, s.name]));

    const reports: SellerAnalyticsReport[] = [];
    const branchGroups = branchCodes.length ? branchCodes : [null];

    for (const branch of branchGroups) {
      const branchSales = branch ? sales.filter((s) => s.branchCode === branch) : sales;
      const sellersInBranch = [
        ...new Set(branchSales.map((s) => s.userId).filter((v): v is number => v !== null)),
      ];

      for (const sellerId of sellersInBranch) {
        const sellerSales = branchSales.filter((s) => s.userId === sellerId);
        reports.push(
          this.buildSellerReport(
            sellerId,
            userNames.get(sellerId) ?? `User ${sellerId}`,
            branch,
            branch ? shopNames.get(branch) ?? branch : 'Все филиалы',
            period,
            sellerSales,
            branchSales,
          ),
        );
      }
    }

    return reports;
  }

  private buildSellerReport(
    sellerId: number,
    sellerName: string,
    branchCode: string | null,
    shopName: string,
    period: AnalyticsPeriod,
    sellerSales: SaleWithItems[],
    branchSales: SaleWithItems[],
  ): SellerAnalyticsReport {
    const regularSellerSales = sellerSales.filter((sale) => sale.saleType !== 'return');
    const receiptsCount = regularSellerSales.length;
    const totalRevenue = sellerSales.reduce((sum, s) => sum + revenueOf(s), 0);
    const avgCheck = receiptsCount > 0 ? totalRevenue / receiptsCount : 0;

    return {
      sellerId,
      sellerName,
      branchCode,
      shopName,
      period,
      receiptsCount,
      totalRevenue,
      avgCheck,
      discounts: this.buildDiscountInsight(
        regularSellerSales,
        branchSales.filter((sale) => sale.saleType !== 'return'),
      ),
      upsell: this.buildUpsellInsights(sellerSales, branchSales),
      ...this.buildProductStats(sellerSales, branchSales),
    };
  }

  private discountStats(sales: SaleWithItems[]) {
    const total = sales.length;
    const withDiscount = sales.filter((s) => s.total > s.payableTotal).length;
    const discountFrequency = total > 0 ? withDiscount / total : 0;
    const avgDiscountPct =
      total > 0
        ? average(
            sales.map((s) => (s.total > 0 ? ((s.total - s.payableTotal) / s.total) * 100 : 0)),
          )
        : 0;
    return { total, withDiscount, discountFrequency, avgDiscountPct };
  }

  private buildDiscountInsight(
    sellerSales: SaleWithItems[],
    branchSales: SaleWithItems[],
  ): DiscountInsight {
    const seller = this.discountStats(sellerSales);
    const branch = this.discountStats(branchSales);

    const withDiscount = sellerSales.filter((s) => s.total > s.payableTotal);
    const withoutDiscount = sellerSales.filter((s) => s.total <= s.payableTotal);
    const avgCheckWithDiscount = average(withDiscount.map(revenueOf));
    const avgCheckWithoutDiscount = average(withoutDiscount.map(revenueOf));

    const flaggedFrequency =
      branch.discountFrequency > 0
        ? seller.discountFrequency >= branch.discountFrequency * ANALYTICS_CONFIG.DISCOUNT_FREQ_MULTIPLIER
        : seller.discountFrequency > 0;

    const flaggedNotPayingOff =
      withDiscount.length > 0 &&
      withoutDiscount.length > 0 &&
      avgCheckWithDiscount <= avgCheckWithoutDiscount;

    return {
      receiptsWithDiscount: seller.withDiscount,
      totalReceipts: seller.total,
      discountFrequency: seller.discountFrequency,
      avgDiscountPct: seller.avgDiscountPct,
      branchDiscountFrequency: branch.discountFrequency,
      branchAvgDiscountPct: branch.avgDiscountPct,
      flaggedFrequency,
      avgCheckWithDiscount,
      avgCheckWithoutDiscount,
      flaggedNotPayingOff,
    };
  }

  private buildUpsellInsights(
    sellerSales: SaleWithItems[],
    branchSales: SaleWithItems[],
  ): UpsellGroupInsight[] {
    const sellerGroups = new Map<
      string,
      { budgetQty: number; totalQty: number; label: string }
    >();

    for (const sale of sellerSales) {
      const sign = sale.saleType === 'return' ? -1 : 1;
      for (const item of sale.items) {
        const groupId = item.product?.productGroupId;
        if (!groupId) continue;
        const group = sellerGroups.get(groupId) ?? { budgetQty: 0, totalQty: 0, label: item.name };
        group.totalQty += item.quantity * sign;
        if (item.product?.tier === 'BUDGET') group.budgetQty += item.quantity * sign;
        sellerGroups.set(groupId, group);
      }
    }

    const branchPremiumByGroup = new Set<string>();
    const marginByGroupTier = new Map<string, Map<string, { profit: number; qty: number }>>();

    for (const sale of branchSales) {
      const sign = sale.saleType === 'return' ? -1 : 1;
      for (const item of sale.items) {
        const groupId = item.product?.productGroupId;
        const tier = item.product?.tier;
        if (!groupId || !tier) continue;
        if (tier === 'PREMIUM' && sign > 0) branchPremiumByGroup.add(groupId);

        const tierMap = marginByGroupTier.get(groupId) ?? new Map();
        const entry = tierMap.get(tier) ?? { profit: 0, qty: 0 };
        entry.profit += item.profitAtSale * sign;
        entry.qty += item.quantity * sign;
        tierMap.set(tier, entry);
        marginByGroupTier.set(groupId, tierMap);
      }
    }

    const insights: UpsellGroupInsight[] = [];

    for (const [groupId, group] of sellerGroups) {
      const budgetShare = group.totalQty > 0 ? group.budgetQty / group.totalQty : 0;
      const premiumSoldInBranch = branchPremiumByGroup.has(groupId);
      const flagged =
        budgetShare > ANALYTICS_CONFIG.BUDGET_SHARE_THRESHOLD && premiumSoldInBranch;

      let estimatedLostMargin = 0;
      if (flagged) {
        const tierMap = marginByGroupTier.get(groupId);
        const budget = tierMap?.get('BUDGET');
        const premium = tierMap?.get('PREMIUM');
        const avgBudgetMargin = budget && budget.qty > 0 ? budget.profit / budget.qty : 0;
        const avgPremiumMargin = premium && premium.qty > 0 ? premium.profit / premium.qty : 0;
        const marginDelta = Math.max(0, avgPremiumMargin - avgBudgetMargin);
        estimatedLostMargin = group.budgetQty * marginDelta * ANALYTICS_CONFIG.UPSELL_CONVERSION_ESTIMATE;
      }

      insights.push({
        productGroupId: groupId,
        groupLabel: group.label,
        budgetQty: group.budgetQty,
        totalQty: group.totalQty,
        budgetShare,
        premiumSoldInBranch,
        flagged,
        estimatedLostMargin,
      });
    }

    return insights.filter((insight) => insight.flagged);
  }

  private buildProductStats(sellerSales: SaleWithItems[], branchSales: SaleWithItems[]) {
    const sellerQty = this.productQtyMap(sellerSales);
    const branchQty = this.productQtyMap(branchSales);

    const topProducts: ProductStat[] = [...sellerQty.values()]
      .sort((a, b) => b.qty - a.qty)
      .slice(0, ANALYTICS_CONFIG.TOP_PRODUCTS_LIMIT);

    const antiTopProducts: ProductStat[] = [...branchQty.values()]
      .filter((stat) => !sellerQty.has(stat.name))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, ANALYTICS_CONFIG.TOP_PRODUCTS_LIMIT);

    return { topProducts, antiTopProducts };
  }

  private productQtyMap(sales: SaleWithItems[]) {
    const map = new Map<string, ProductStat>();
    for (const sale of sales) {
      const sign = sale.saleType === 'return' ? -1 : 1;
      for (const item of sale.items) {
        const existing = map.get(item.name) ?? { name: item.name, qty: 0, revenue: 0 };
        existing.qty += item.quantity * sign;
        existing.revenue += item.lineTotal * sign;
        map.set(item.name, existing);
      }
    }
    return map;
  }
}
