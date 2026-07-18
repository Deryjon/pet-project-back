import {
  BadRequestException,
  Injectable,
} from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { ReportFilterDto } from './dto/report-filter.dto';
import { ReportsMapper } from './reports.mapper';
import { ReportsRepository } from './reports.repository';
import { SalaryService } from './salary.service';

@Injectable()
export class SellerReportsService {
  constructor(
    private readonly usersService: UsersService,
    private readonly reportsRepository: ReportsRepository,
    private readonly reportsMapper: ReportsMapper,
    private readonly salaryService: SalaryService,
  ) {}

  async getSellers(filter: ReportFilterDto, authorization?: string) {
    const context = await this.getContext(authorization);
    const aggregateRows = await this.reportsRepository.getSellerAggregateRows(
      filter,
      context,
    );
    const sellerRows = await Promise.all(
      aggregateRows.map(async (row: any) => {
        const sellerId = Number(row.seller_id);
        const settings = await this.reportsRepository.getSellerSalarySettings(sellerId);
        const netSales = Number(row.net_gross_sales ?? 0);
        const grossProfit = Number(row.gross_profit ?? 0);
        const grossSales = Number(row.gross_sales ?? 0);
        const transactionsCount = Number(row.transactions_count ?? 0);
        const discountSum = Number(row.discount_sum ?? 0);
        const bonusAmount = Number(row.bonus_amount ?? 0);

        return {
          seller_id: sellerId,
          seller_name: `${row.seller_first_name ?? ''} ${row.seller_last_name ?? ''}`.trim(),
          shop_name: row.shop_name ?? '',
          gross_sales: grossSales,
          net_gross_sales: netSales,
          gross_profit: grossProfit,
          products_sold: Number(row.products_sold ?? 0),
          transactions_count: transactionsCount,
          average_cheque: transactionsCount > 0 ? netSales / transactionsCount : 0,
          discount_sum: discountSum,
          discount_percent: grossSales !== 0 ? (discountSum / grossSales) * 100 : 0,
          returns: Number(row.returns_count ?? 0),
          average_extra_charge:
            netSales !== 0 ? (grossProfit / netSales) * 100 : 0,
          kpi_score: this.salaryService.calculateKpiScore({ netSales }),
          fixed_salary: Number(settings.fixedSalary ?? 0),
          salary_percent: Number(settings.salaryPercent ?? 0),
          bonus: bonusAmount,
          salary_total: this.salaryService.calculateSellerSalary({
            fixedSalary: Number(settings.fixedSalary ?? 0),
            salaryPercent: Number(settings.salaryPercent ?? 0),
            calculationType: settings.calculationType,
            bonusEnabled: Boolean(settings.bonusEnabled),
            netSales,
            grossProfit,
            itemsBonusAmount: bonusAmount,
          }),
        };
      }),
    );

    const paginated = this.reportsMapper.paginate(sellerRows, filter);
    const chart = this.reportsMapper.toDailySeries(
      (
        await this.reportsRepository.getSaleItemFacts(filter, context)
      ).map((row: any) => ({
        paid_at: row.paid_at,
        created_at: row.created_at,
        value:
          row.sale_type === 'return'
            ? -Number(row.final_price ?? 0)
            : Number(row.final_price ?? 0),
      })),
    );

    return {
      summary: {
        sellers_count: sellerRows.length,
        gross_sales: sellerRows.reduce((sum, row) => sum + row.gross_sales, 0),
        net_gross_sales: sellerRows.reduce((sum, row) => sum + row.net_gross_sales, 0),
        gross_profit: sellerRows.reduce((sum, row) => sum + row.gross_profit, 0),
        salary_total: sellerRows.reduce((sum, row) => sum + row.salary_total, 0),
      },
      chart,
      rows: paginated.rows,
      totals: {
        count: sellerRows.length,
        pages: paginated.pages,
        page: paginated.page,
        perPage: paginated.perPage,
      },
    };
  }

  async getSellerSales(
    sellerId: string,
    filter: ReportFilterDto,
    authorization?: string,
  ) {
    const parsedSellerId = this.parseSellerId(sellerId);
    const context = await this.getContext(authorization);
    await this.assertSellerVisibility(parsedSellerId, context, authorization);
    await this.reportsRepository.requireSeller(parsedSellerId);

    const rows = await this.reportsRepository.getSaleItemFacts(
      {
        ...filter,
        sellerIds: [parsedSellerId],
      },
      context,
    );
    const mappedRows = rows.map((row: any) => {
      const sign = row.sale_type === 'return' ? -1 : 1;
      return {
        sale_id: Number(row.sale_id),
        sale_number: row.sale_number,
        date: row.paid_at ?? row.created_at,
        shop_name: row.shop_name ?? row.branch_code ?? '',
        seller_id: parsedSellerId,
        seller_name: `${row.seller_first_name ?? ''} ${row.seller_last_name ?? ''}`.trim(),
        product_id: row.product_id ? Number(row.product_id) : null,
        quantity: Number(row.quantity ?? 0) * sign,
        gross_sales: Number(row.retail_price_at_sale ?? 0) * sign,
        net_gross_sales: Number(row.final_price ?? 0) * sign,
        gross_profit: Number(row.profit_at_sale ?? 0) * sign,
        discount_sum: Number(row.discount_amount ?? 0) * sign,
        seller_bonus_amount: Number(row.seller_bonus_amount ?? 0),
        sale_type: row.sale_type,
      };
    });
    const paginated = this.reportsMapper.paginate(mappedRows, filter);
    const netSales = mappedRows.reduce((sum, row) => sum + row.net_gross_sales, 0);
    const grossProfit = mappedRows.reduce((sum, row) => sum + row.gross_profit, 0);
    const discountSum = mappedRows.reduce((sum, row) => sum + row.discount_sum, 0);

    return {
      summary: {
        transactions_count: new Set(mappedRows.map((row) => row.sale_id)).size,
        gross_sales: mappedRows.reduce((sum, row) => sum + row.gross_sales, 0),
        net_gross_sales: netSales,
        gross_profit: grossProfit,
        discount_sum: discountSum,
        returns_count: mappedRows.filter((row) => row.sale_type === 'return').length,
      },
      chart: this.reportsMapper.toDailySeries(
        mappedRows.map((row) => ({
          paid_at: row.date,
          value: row.net_gross_sales,
        })),
      ),
      rows: paginated.rows,
      totals: {
        count: mappedRows.length,
        pages: paginated.pages,
        page: paginated.page,
        perPage: paginated.perPage,
      },
    };
  }

  async getSellerSalarySettings(sellerId: string, authorization?: string) {
    const parsedSellerId = this.parseSellerId(sellerId);
    const context = await this.getContext(authorization);
    await this.assertSellerVisibility(parsedSellerId, context, authorization);
    const seller = await this.reportsRepository.requireSeller(parsedSellerId);
    const settings = await this.reportsRepository.getSellerSalarySettings(parsedSellerId);

    return {
      seller_id: String(seller.id),
      seller_name: `${seller.firstName ?? ''} ${seller.lastName ?? ''}`.trim(),
      fixedSalary: Number(settings.fixedSalary ?? 0),
      salaryPercent: Number(settings.salaryPercent ?? 0),
      calculationType: settings.calculationType,
      bonusEnabled: Boolean(settings.bonusEnabled),
      isActive: Boolean(settings.isActive),
    };
  }

  async updateSellerSalarySettings(
    sellerId: string,
    body: Record<string, unknown>,
    authorization?: string,
  ) {
    const parsedSellerId = this.parseSellerId(sellerId);
    await this.usersService.assertAdminAccess(authorization);
    await this.reportsRepository.requireSeller(parsedSellerId);

    const settings = await this.reportsRepository.updateSellerSalarySettings(
      parsedSellerId,
      {
        fixedSalary: this.toNumber(body.fixedSalary),
        salaryPercent: this.toNumber(body.salaryPercent),
        calculationType:
          typeof body.calculationType === 'string'
            ? body.calculationType
            : undefined,
        bonusEnabled: this.toBoolean(body.bonusEnabled),
        isActive: this.toBoolean(body.isActive),
      },
    );

    return {
      seller_id: parsedSellerId,
      fixedSalary: Number(settings.fixedSalary ?? 0),
      salaryPercent: Number(settings.salaryPercent ?? 0),
      calculationType: settings.calculationType,
      bonusEnabled: Boolean(settings.bonusEnabled),
      isActive: Boolean(settings.isActive),
    };
  }

  async getSellerSalaryReport(
    sellerId: string,
    filter: ReportFilterDto,
    authorization?: string,
  ) {
    const parsedSellerId = this.parseSellerId(sellerId);
    const context = await this.getContext(authorization);
    await this.assertSellerVisibility(parsedSellerId, context, authorization);
    const seller = await this.reportsRepository.requireSeller(parsedSellerId);
    const settings = await this.reportsRepository.getSellerSalarySettings(parsedSellerId);
    const facts = await this.reportsRepository.getSaleItemFacts(
      { ...filter, sellerIds: [parsedSellerId] },
      context,
    );

    const items = facts.map((row: any) => {
      const finalPrice = Number(row.final_price ?? 0);
      const supplyPriceAtSale = Number(row.supply_price_at_sale ?? 0);
      const profitAtSale = this.salaryService.calculateSaleItemProfit(
        finalPrice,
        supplyPriceAtSale,
      );
      const sellerBonusAmount = Number(row.seller_bonus_amount ?? 0);

      return {
        sale_id: Number(row.sale_id),
        sale_number: row.sale_number,
        final_price: finalPrice,
        supply_price_at_sale: supplyPriceAtSale,
        profit_at_sale: profitAtSale,
        seller_bonus_amount: sellerBonusAmount,
        sale_type: row.sale_type,
        date: row.paid_at ?? row.created_at,
      };
    });

    const grossSales = facts.reduce(
      (sum: number, row: any) =>
        sum +
        (row.sale_type === 'return' ? -1 : 1) *
          Number(row.retail_price_at_sale ?? 0),
      0,
    );
    const netSales = facts.reduce(
      (sum: number, row: any) =>
        sum + (row.sale_type === 'return' ? -1 : 1) * Number(row.final_price ?? 0),
      0,
    );
    const grossProfit = items.reduce(
      (sum, item) => sum + (item.sale_type === 'return' ? -1 : 1) * item.profit_at_sale,
      0,
    );
    const bonusAmount = items.reduce(
      (sum, item) => sum + (item.sale_type === 'return' ? -1 : 1) * item.seller_bonus_amount,
      0,
    );
    const salaryTotal = this.salaryService.calculateSellerSalary({
      fixedSalary: Number(settings.fixedSalary ?? 0),
      salaryPercent: Number(settings.salaryPercent ?? 0),
      calculationType: settings.calculationType,
      bonusEnabled: Boolean(settings.bonusEnabled),
      netSales,
      grossProfit,
      itemsBonusAmount: bonusAmount,
    });

    return {
      seller_id: String(parsedSellerId),
      seller_name: `${seller.firstName ?? ''} ${seller.lastName ?? ''}`.trim(),
      fixed_salary: Number(settings.fixedSalary ?? 0),
      salary_percent: Number(settings.salaryPercent ?? 0),
      calculation_type: settings.calculationType,
      gross_sales: grossSales,
      net_gross_sales: netSales,
      gross_profit: grossProfit,
      bonus_amount: bonusAmount,
      salary_total: salaryTotal,
      items,
    };
  }

  private async getContext(authorization?: string) {
    return authorization
      ? this.usersService.getRequestContext(authorization)
      : null;
  }

  private async assertSellerVisibility(
    sellerId: number,
    context: any,
    authorization?: string,
  ) {
    if (context?.userId === sellerId) {
      return;
    }
    await this.usersService.assertAdminAccess(authorization);
  }

  private parseSellerId(value: string) {
    const parsed = Number(value);
    if (!Number.isInteger(parsed)) {
      throw new BadRequestException('sellerId must be an integer');
    }
    return parsed;
  }

  private toNumber(value: unknown) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  private toBoolean(value: unknown) {
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'string') {
      return value.toLowerCase() === 'true';
    }
    return undefined;
  }
}
