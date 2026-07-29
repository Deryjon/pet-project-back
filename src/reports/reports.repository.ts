import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ReportFilterDto } from './dto/report-filter.dto';

@Injectable()
export class ReportsRepository {
  constructor(private readonly prisma: PrismaService) {}

  private get db(): PrismaService {
    return this.prisma;
  }

  async findSellerById(sellerId: number) {
    return this.db.user.findUnique({ where: { id: sellerId } });
  }

  async getSellerSalarySettings(sellerId: number) {
    return this.db.sellerSalarySettings.upsert({
      where: { userId: sellerId },
      update: {},
      create: { userId: sellerId },
    });
  }

  async updateSellerSalarySettings(
    sellerId: number,
    data: {
      fixedSalary?: number;
      salaryPercent?: number;
      calculationType?: string;
      bonusEnabled?: boolean;
      isActive?: boolean;
    },
  ) {
    return this.db.sellerSalarySettings.upsert({
      where: { userId: sellerId },
      update: data as any,
      create: {
        userId: sellerId,
        fixedSalary: data.fixedSalary ?? 0,
        salaryPercent: data.salaryPercent ?? 0,
        calculationType: (data.calculationType ?? 'FIXED_PLUS_PROFIT') as any,
        bonusEnabled: data.bonusEnabled ?? true,
        isActive: data.isActive ?? true,
      },
    });
  }

  async getSaleItemFacts(filter: ReportFilterDto, context: any): Promise<any[]> {
    const { clauses, params } = await this.buildSaleItemWhere(filter, context);
    const whereSql = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const sql = `
      SELECT
        s.id AS sale_id,
        s.number AS sale_number,
        s."saleType" AS sale_type,
        s."branchCode" AS branch_code,
        s."paidAt" AS paid_at,
        s."createdAt" AS created_at,
        s."userId" AS sale_user_id,
        COALESCE(si."sellerId", s."userId") AS seller_id,
        COALESCE(u."firstName", '') AS seller_first_name,
        COALESCE(u."lastName", '') AS seller_last_name,
        sh.name AS shop_name,
        si.id AS sale_item_id,
        si."productId" AS product_id,
        si.quantity::float8 AS quantity,
        COALESCE(si."retailPriceAtSale", si."lineTotal", (si."salePrice" * si.quantity))::float8 AS retail_price_at_sale,
        COALESCE(si."discountAmount", 0)::float8 AS discount_amount,
        COALESCE(si."finalPrice", si."lineTotal", (si."salePrice" * si.quantity))::float8 AS final_price,
        COALESCE(si."supplyPriceAtSale", (COALESCE(p."purchasePrice", 0) * si.quantity))::float8 AS supply_price_at_sale,
        COALESCE(
          si."profitAtSale",
          COALESCE(si."finalPrice", si."lineTotal", (si."salePrice" * si.quantity)) -
          COALESCE(si."supplyPriceAtSale", (COALESCE(p."purchasePrice", 0) * si.quantity))
        )::float8 AS profit_at_sale,
        COALESCE(si."sellerBonusAmount", 0)::float8 AS seller_bonus_amount
      FROM "SaleItem" si
      INNER JOIN "Sale" s ON s.id = si."saleId"
      LEFT JOIN "User" u ON u.id = COALESCE(si."sellerId", s."userId")
      LEFT JOIN "Product" p ON p.id = si."productId"
      LEFT JOIN "Shop" sh ON sh."branchCode" = s."branchCode"
      ${whereSql}
      ORDER BY COALESCE(s."paidAt", s."createdAt") DESC, s.id DESC, si.id DESC
    `;

    return this.db.$queryRawUnsafe(sql, ...params) as Promise<any[]>;
  }

  async getSellerAggregateRows(filter: ReportFilterDto, context: any): Promise<any[]> {
    const { clauses, params } = await this.buildSaleItemWhere(filter, context);
    const whereSql = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const sql = `
      SELECT
        COALESCE(si."sellerId", s."userId") AS seller_id,
        COALESCE(u."firstName", '') AS seller_first_name,
        COALESCE(u."lastName", '') AS seller_last_name,
        COALESCE(sh.name, s."branchCode", '') AS shop_name,
        COUNT(DISTINCT s.id) AS transactions_count,
        SUM(CASE WHEN s."saleType" = 'return' THEN -si.quantity ELSE si.quantity END)::float8 AS products_sold,
        SUM(CASE WHEN s."saleType" = 'return' THEN -COALESCE(si."retailPriceAtSale", si."lineTotal", (si."salePrice" * si.quantity)) ELSE COALESCE(si."retailPriceAtSale", si."lineTotal", (si."salePrice" * si.quantity)) END)::float8 AS gross_sales,
        SUM(CASE WHEN s."saleType" = 'return' THEN -COALESCE(si."finalPrice", si."lineTotal", (si."salePrice" * si.quantity)) ELSE COALESCE(si."finalPrice", si."lineTotal", (si."salePrice" * si.quantity)) END)::float8 AS net_gross_sales,
        SUM(CASE WHEN s."saleType" = 'return' THEN -COALESCE(si."profitAtSale", COALESCE(si."finalPrice", si."lineTotal", (si."salePrice" * si.quantity)) - COALESCE(si."supplyPriceAtSale", 0)) ELSE COALESCE(si."profitAtSale", COALESCE(si."finalPrice", si."lineTotal", (si."salePrice" * si.quantity)) - COALESCE(si."supplyPriceAtSale", 0)) END)::float8 AS gross_profit,
        SUM(CASE WHEN s."saleType" = 'return' THEN -COALESCE(si."discountAmount", 0) ELSE COALESCE(si."discountAmount", 0) END)::float8 AS discount_sum,
        SUM(CASE WHEN s."saleType" = 'return' THEN 1 ELSE 0 END) AS returns_count,
        SUM(CASE WHEN s."saleType" = 'return' THEN -COALESCE(si."sellerBonusAmount", 0) ELSE COALESCE(si."sellerBonusAmount", 0) END)::float8 AS bonus_amount
      FROM "SaleItem" si
      INNER JOIN "Sale" s ON s.id = si."saleId"
      LEFT JOIN "User" u ON u.id = COALESCE(si."sellerId", s."userId")
      LEFT JOIN "Product" p ON p.id = si."productId"
      LEFT JOIN "Shop" sh ON sh."branchCode" = s."branchCode"
      ${whereSql}
      GROUP BY COALESCE(si."sellerId", s."userId"), u."firstName", u."lastName", COALESCE(sh.name, s."branchCode", '')
      ORDER BY net_gross_sales DESC NULLS LAST
    `;

    return this.db.$queryRawUnsafe(sql, ...params) as Promise<any[]>;
  }

  async resolveBranchCodes(filter: ReportFilterDto, context: any) {
    if (!filter.shopIds?.length) {
      return undefined;
    }

    const shops = await this.db.shop.findMany({
      where: {
        ...(context?.companyId ? { companyId: context.companyId } : {}),
        OR: [
          { id: { in: filter.shopIds } },
          { branchCode: { in: filter.shopIds } },
        ],
      },
      select: {
        branchCode: true,
      },
    });

    return shops.map((shop: any) => shop.branchCode).filter(Boolean);
  }

  async requireSeller(sellerId: number) {
    const seller = await this.findSellerById(sellerId);
    if (!seller) {
      throw new NotFoundException('Seller not found');
    }
    return seller;
  }

  private async buildSaleItemWhere(filter: ReportFilterDto, context: any) {
    const clauses: string[] = [`s.status = 'paid'`];
    const params: unknown[] = [];

    if (context?.companyId) {
      clauses.push(`s."companyId" = ${this.pushParam(params, context.companyId)}`);
    }

    if (context?.allowedBranchCodes?.length) {
      clauses.push(
        `s."branchCode" IN (${context.allowedBranchCodes
          .map((value: string) => this.pushParam(params, value))
          .join(', ')})`,
      );
    }

    if (filter.from) {
      clauses.push(`COALESCE(s."paidAt", s."createdAt") >= ${this.pushParam(params, new Date(filter.from))}`);
    }

    if (filter.to) {
      const to = new Date(filter.to);
      to.setHours(23, 59, 59, 999);
      clauses.push(`COALESCE(s."paidAt", s."createdAt") <= ${this.pushParam(params, to)}`);
    }

    const branchCodes = await this.resolveBranchCodes(filter, context);
    if (branchCodes?.length) {
      clauses.push(
        `s."branchCode" IN (${branchCodes
          .map((value) => this.pushParam(params, value))
          .join(', ')})`,
      );
    }

    if (filter.sellerIds?.length) {
      clauses.push(
        `COALESCE(si."sellerId", s."userId") IN (${filter.sellerIds
          .map((value) => this.pushParam(params, value))
          .join(', ')})`,
      );
    }

    if (filter.productIds?.length) {
      clauses.push(
        `si."productId" IN (${filter.productIds
          .map((value) => this.pushParam(params, value))
          .join(', ')})`,
      );
    }

    if (filter.categoryIds?.length) {
      clauses.push(
        `p."categoryId" IN (${filter.categoryIds
          .map((value) => this.pushParam(params, value))
          .join(', ')})`,
      );
    }

    if (filter.brandIds?.length) {
      clauses.push(
        `p."brandId" IN (${filter.brandIds
          .map((value) => this.pushParam(params, value))
          .join(', ')})`,
      );
    }

    if (filter.supplierIds?.length) {
      clauses.push(`
        EXISTS (
          SELECT 1
          FROM "ProductSupplier" ps
          WHERE ps."productId" = p.id
            AND ps."supplierId" IN (${filter.supplierIds
              .map((value) => this.pushParam(params, value))
              .join(', ')})
        )
      `);
    }

    return { clauses, params };
  }

  private pushParam(params: unknown[], value: unknown) {
    params.push(value);
    return `$${params.length}`;
  }
}
