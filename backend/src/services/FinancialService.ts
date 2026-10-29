import { prisma } from '../lib/prisma';
import { AppError } from '../utils/errorHandler';

export interface FinancialFilters {
  branchId: string;
  startDate: Date;
  endDate: Date;
}

export interface FinancialSummary {
  grossIncome: number;
  productRevenue: number;
  serviceRevenue: number;
  productCogs: number;
  serviceDirectCosts: number;
  grossProfit: number;
  operatingExpenses: number;
  netProfit: number;
}

export class FinancialService {
  static async getProfitAndLoss(filters: FinancialFilters) {
    const { branchId, startDate, endDate } = filters;

    // 1. Revenue and COGS from Transactions
    const transactionItems = await prisma.transactionItem.findMany({
      where: {
        transaction: {
          branch_id: branchId,
          status: { not: 'voided' },
          created_at: { gte: startDate, lte: endDate },
        },
      },
      include: {
        product: true,
      },
    });

    let productRevenue = 0;
    let serviceRevenue = 0;
    let productCogs = 0;
    let serviceDirectCosts = 0;

    for (const item of transactionItems) {
      const qty = Number(item.quantity);
      const lineTotal = Number(item.line_total);
      const costPrice = Number(item.cost_price || 0);

      if (item.product.item_type === 'PRODUCT') {
        productRevenue += lineTotal;
        productCogs += costPrice * qty;
      } else if (item.product.item_type === 'SERVICE') {
        serviceRevenue += lineTotal;
        serviceDirectCosts += costPrice * qty;
      }
    }

    const grossIncome = productRevenue + serviceRevenue;
    const grossProfit = grossIncome - (productCogs + serviceDirectCosts);

    // 2. Operating Expenses
    const expensesResult = await prisma.expense.aggregate({
      where: {
        branch_id: branchId,
        status: { not: 'voided' },
        expenseDate: { gte: startDate, lte: endDate },
      },
      _sum: { amount: true },
    });

    const operatingExpenses = Number(expensesResult._sum?.amount || 0);
    const netProfit = grossProfit - operatingExpenses;

    return {
      grossIncome,
      productRevenue,
      serviceRevenue,
      productCogs,
      serviceDirectCosts,
      grossProfit,
      operatingExpenses,
      netProfit,
    };
  }

  static async getBranchFinancialStats(branchId: string) {
    // Example: Current month totals
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    return this.getProfitAndLoss({
      branchId,
      startDate: startOfMonth,
      endDate: now,
    });
  }
}
