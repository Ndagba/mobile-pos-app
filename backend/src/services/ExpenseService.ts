import { prisma } from '../lib/prisma';
import { AppError } from '../utils/errorHandler';

export interface ExpenseCategoryInput {
  name: string;
  description?: string;
  branch_id: string;
}

export interface ExpenseInput {
  category_id: string;
  branch_id: string;
  amount: number;
  description?: string;
  expenseDate: Date;
  paymentMethod: string;
  referenceNumber?: string;
  createdBy: string;
}

export class ExpenseService {
  static async createCategory(data: ExpenseCategoryInput) {
    // Ensure branch exists
    const branch = await prisma.branch.findUnique({
      where: { id: data.branch_id },
    });

    if (!branch) {
      throw new AppError(400, `The specified branch (ID: ${data.branch_id}) does not exist`);
    }

    // Ensure name is unique within the branch
    const existing = await prisma.expenseCategory.findFirst({
      where: {
        name: { equals: data.name, mode: 'insensitive' },
        branch_id: data.branch_id,
      },
    });

    if (existing) {
      throw new AppError(400, 'Expense category name must be unique within the branch');
    }

    return await prisma.expenseCategory.create({
      data: {
        name: data.name,
        description: data.description,
        branch_id: data.branch_id,
      },
    });
  }

  static async updateCategory(id: string, data: Partial<ExpenseCategoryInput>) {
    return await prisma.expenseCategory.update({
      where: { id },
      data,
    });
  }

  static async deleteCategory(id: string) {
    // Check if expenses exist for this category
    const count = await prisma.expense.count({
      where: { category_id: id },
    });

    if (count > 0) {
      throw new AppError(400, 'Cannot delete category with existing expense records. Please deactivate it instead.');
    }

    return await prisma.expenseCategory.delete({
      where: { id },
    });
  }

  static async getCategories(branchId: string) {
    const where: any = {};
    if (branchId) {
      where.branch_id = branchId;
    }

    return await prisma.expenseCategory.findMany({
      where,
      include: { branch: true },
      orderBy: { name: 'asc' },
    });
  }

  static async recordExpense(data: ExpenseInput) {
    return await prisma.expense.create({
      data: {
        ...data,
        amount: data.amount,
        expenseDate: new Date(data.expenseDate),
      },
    });
  }

  static async updateExpense(id: string, data: Partial<ExpenseInput>) {
    return await prisma.expense.update({
      where: { id },
      data: {
        ...data,
        expenseDate: data.expenseDate ? new Date(data.expenseDate) : undefined,
      },
    });
  }

  static async voidExpense(id: string) {
    return await prisma.expense.update({
      where: { id },
      data: { status: 'voided' },
    });
  }

  static async getExpenses(filters: {
    branchId: string;
    startDate?: Date;
    endDate?: Date;
    categoryId?: string;
    paymentMethod?: string;
    search?: string;
  }) {
    const where: any = {
      branch_id: filters.branchId,
      status: { not: 'voided' },
    };

    if (filters.startDate || filters.endDate) {
      where.expenseDate = {};
      if (filters.startDate) where.expenseDate.gte = filters.startDate;
      if (filters.endDate) where.expenseDate.lte = filters.endDate;
    }

    if (filters.categoryId) where.category_id = filters.categoryId;
    if (filters.paymentMethod) where.paymentMethod = filters.paymentMethod;
    if (filters.search) {
      where.OR = [
        { description: { contains: filters.search, mode: 'insensitive' } },
        { referenceNumber: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    return await prisma.expense.findMany({
      where,
      include: { category: true },
      orderBy: { expenseDate: 'desc' },
    });
  }

  static async getExpenseSummary(branchId: string, startDate: Date, endDate: Date) {
    const expenses = await prisma.expense.findMany({
      where: {
        branch_id: branchId,
        status: { not: 'voided' },
        expenseDate: { gte: startDate, lte: endDate },
      },
      include: { category: true },
    });

    const summary = expenses.reduce(
      (acc, exp) => {
        const catName = exp.category.name;
        acc[catName] = (acc[catName] || 0) + Number(exp.amount);
        return acc;
      },
      {} as Record<string, number>
    );

    const total = Object.values(summary).reduce((sum, val) => sum + val, 0);

    return {
      byCategory: summary,
      total,
    };
  }
}
