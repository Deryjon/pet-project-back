import { Injectable } from '@nestjs/common';

@Injectable()
export class SalaryService {
  calculateSaleItemProfit(finalPrice: number, supplyPriceAtSale: number) {
    return Number(finalPrice ?? 0) - Number(supplyPriceAtSale ?? 0);
  }

  calculateSellerSalary(input: {
    fixedSalary: number;
    salaryPercent: number;
    calculationType: string;
    bonusEnabled: boolean;
    netSales: number;
    grossProfit: number;
    itemsBonusAmount?: number;
  }) {
    const fixedSalary = Number(input.fixedSalary ?? 0);
    const salaryPercent = Number(input.salaryPercent ?? 0);
    const netSales = Number(input.netSales ?? 0);
    const grossProfit = Number(input.grossProfit ?? 0);
    const itemsBonusAmount = Number(input.itemsBonusAmount ?? 0);

    switch (input.calculationType) {
      case 'FIXED_ONLY':
        return fixedSalary;
      case 'PROFIT_PERCENT_ONLY':
        return input.bonusEnabled ? (grossProfit * salaryPercent) / 100 : 0;
      case 'REVENUE_PERCENT_ONLY':
        return input.bonusEnabled ? (netSales * salaryPercent) / 100 : 0;
      case 'FIXED_PLUS_REVENUE':
        return fixedSalary + (input.bonusEnabled ? (netSales * salaryPercent) / 100 : 0);
      case 'FIXED_PLUS_PROFIT':
      default:
        return fixedSalary + (input.bonusEnabled ? itemsBonusAmount : 0);
    }
  }

  calculateKpiScore(input: { netSales: number; target?: number }) {
    if (!input.netSales) {
      return 0;
    }
    if (!input.target || input.target <= 0) {
      return 100;
    }
    return Math.min(100, Math.round((input.netSales / input.target) * 100));
  }
}
