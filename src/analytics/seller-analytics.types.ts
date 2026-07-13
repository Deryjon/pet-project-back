export type AnalyticsPeriod = { start: Date; end: Date };

export type ProductStat = {
  name: string;
  qty: number;
  revenue: number;
};

export type UpsellGroupInsight = {
  productGroupId: string;
  groupLabel: string;
  budgetQty: number;
  totalQty: number;
  budgetShare: number; // 0..1
  premiumSoldInBranch: boolean;
  flagged: boolean;
  estimatedLostMargin: number; // "оценочно", см. ANALYTICS_CONFIG.UPSELL_CONVERSION_ESTIMATE
};

export type DiscountInsight = {
  receiptsWithDiscount: number;
  totalReceipts: number;
  discountFrequency: number; // 0..1
  avgDiscountPct: number; // 0..100
  branchDiscountFrequency: number;
  branchAvgDiscountPct: number;
  flaggedFrequency: boolean;
  avgCheckWithDiscount: number;
  avgCheckWithoutDiscount: number;
  flaggedNotPayingOff: boolean;
};

export type SellerAnalyticsReport = {
  sellerId: number;
  sellerName: string;
  branchCode: string | null;
  shopName: string;
  period: AnalyticsPeriod;
  receiptsCount: number;
  totalRevenue: number;
  avgCheck: number;
  discounts: DiscountInsight;
  upsell: UpsellGroupInsight[];
  topProducts: ProductStat[];
  antiTopProducts: ProductStat[];
};
