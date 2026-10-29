import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { catchAsync } from '../../utils/errorHandler';
import { FinancialService } from '../../services/FinancialService';
import { AppError } from '../../utils/errorHandler';

const router = Router();

router.use(authMiddleware);

router.get(
  '/pl',
  catchAsync(async (req: Request, res: Response) => {
    const { branchId, startDate, endDate } = req.query;

    if (!branchId || !startDate || !endDate) {
      throw new AppError(400, 'branchId, startDate, and endDate are required');
    }

    const plReport = await FinancialService.getProfitAndLoss({
      branchId: branchId as string,
      startDate: new Date(startDate as string),
      endDate: new Date(endDate as string),
    });

    res.json({ status: 'success', data: plReport });
  })
);

router.get(
  '/stats',
  catchAsync(async (req: Request, res: Response) => {
    const { branchId } = req.query;
    if (!branchId) throw new AppError(400, 'branchId is required');

    const stats = await FinancialService.getBranchFinancialStats(branchId as string);
    res.json({ status: 'success', data: stats });
  })
);

export default router;
