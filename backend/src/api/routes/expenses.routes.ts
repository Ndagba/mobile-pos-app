import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { catchAsync } from '../../utils/errorHandler';
import { ExpenseService } from '../../services/ExpenseService';
import { AppError } from '../../utils/errorHandler';
import { prisma } from '../../lib/prisma';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

router.use(authMiddleware);

// ─── Categories ──────────────────────────────────────────────────
router.get(
  '/categories',
  catchAsync(async (req: Request, res: Response) => {
    const { branchId } = req.query;
    if (!branchId) throw new AppError(400, 'branchId is required');

    const categories = await ExpenseService.getCategories(branchId as string);
    res.json({ status: 'success', data: categories });
  })
);

router.post(
  '/categories',
  catchAsync(async (req: Request, res: Response) => {
    const category = await ExpenseService.createCategory(req.body);
    res.status(201).json({ status: 'success', data: category });
  })
);

router.patch(
  '/categories/:id',
  catchAsync(async (req: Request, res: Response) => {
    const category = await ExpenseService.updateCategory(req.params.id, req.body);
    res.json({ status: 'success', data: category });
  })
);

router.delete(
  '/categories/:id',
  catchAsync(async (req: Request, res: Response) => {
    await ExpenseService.deleteCategory(req.params.id);
    res.json({ status: 'success', message: 'Category deleted successfully' });
  })
);

// ─── Expenses ─────────────────────────────────────────────────────
router.get(
  '/',
  catchAsync(async (req: Request, res: Response) => {
    const { branchId, startDate, endDate, categoryId, paymentMethod, search } = req.query;
    if (!branchId) throw new AppError(400, 'branchId is required');

    const expenses = await ExpenseService.getExpenses({
      branchId: branchId as string,
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
      categoryId: categoryId as string,
      paymentMethod: paymentMethod as string,
      search: search as string,
    });

    res.json({ status: 'success', data: expenses });
  })
);

router.post(
  '/',
  catchAsync(async (req: Request, res: Response) => {
    const user = (req as any).user;
    const expense = await ExpenseService.recordExpense({
      ...req.body,
      createdBy: user.id,
      expenseDate: new Date(req.body.expenseDate),
    });
    res.status(201).json({ status: 'success', data: expense });
  })
);

router.patch(
  '/:id',
  catchAsync(async (req: Request, res: Response) => {
    const expense = await ExpenseService.updateExpense(req.params.id, req.body);
    res.json({ status: 'success', data: expense });
  })
);

router.delete(
  '/:id',
  catchAsync(async (req: Request, res: Response) => {
    await ExpenseService.voidExpense(req.params.id);
    res.json({ status: 'success', message: 'Expense voided successfully' });
  })
);

router.get(
  '/summary',
  catchAsync(async (req: Request, res: Response) => {
    const { branchId, startDate, endDate } = req.query;
    if (!branchId || !startDate || !endDate) {
      throw new AppError(400, 'branchId, startDate, and endDate are required');
    }

    const summary = await ExpenseService.getExpenseSummary(
      branchId as string,
      new Date(startDate as string),
      new Date(endDate as string)
    );

    res.json({ status: 'success', data: summary });
  })
);

export default router;
