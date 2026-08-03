import { Router, Request, Response } from 'express';
import { prisma } from '../../lib/prisma';
import { authMiddleware } from '../middleware/auth.middleware';
import { catchAsync, AppError } from '../../utils/errorHandler';
import { AuditService } from '../../services/AuditService';
import { getAuthorizedBranchId, getAuthorizedBranchIds } from '../../utils/branchHelper';

const router = Router();
router.use(authMiddleware);

// Start a shift
router.post('/', catchAsync(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const { branch_id, opening_balance, notes } = req.body;
  if (!branch_id) throw new AppError(400, 'branch_id is required');
  if (opening_balance === undefined) throw new AppError(400, 'opening_balance is required');

  // Check if a shift is already open for this user
  const existingShift = await prisma.cashShift.findFirst({
    where: { user_id: user.id, status: 'open' }
  });
  if (existingShift) throw new AppError(400, 'You already have an open shift');

  const shift = await prisma.cashShift.create({
    data: {
      store_id: user.storeId,
      branch_id,
      user_id: user.id,
      opening_balance,
      notes
    }
  });

  await AuditService.log(user.id, 'START_SHIFT', 'CashShift', shift.id, { opening_balance }, req);

  res.status(201).json({ status: 'success', data: shift });
}));

// Get current open shift
router.get('/current', catchAsync(async (req: Request, res: Response) => {
  const user = (req as any).user;

  const shift = await prisma.cashShift.findFirst({
    where: { user_id: user.id, status: 'open' }
  });

  if (!shift) {
    return res.json({ status: 'success', data: null });
  }

  // Calculate expected closing balance
  const cashTransactions = await prisma.$queryRaw<any[]>`
    SELECT COALESCE(SUM(total_amount), 0) AS total_cash
    FROM "Transaction"
    WHERE user_id = ${user.id}
      AND branch_id = ${shift.branch_id}
      AND status = 'completed'
      AND payment_method = 'cash'
      AND created_at >= ${shift.opened_at}
  `;

  const cashSales = cashTransactions[0]?.total_cash ?? 0;
  const expectedClosing = Number(shift.opening_balance) + Number(cashSales);

  res.json({
    status: 'success',
    data: {
      ...shift,
      opening_balance: Number(shift.opening_balance),
      expected_closing: expectedClosing
    }
  });
}));

// Close a shift
router.post('/:id/close', catchAsync(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const { actual_closing, notes } = req.body;
  if (actual_closing === undefined) throw new AppError(400, 'actual_closing is required');

  const shift = await prisma.cashShift.findFirst({
    where: { id: req.params.id, user_id: user.id, status: 'open' }
  });

  if (!shift) throw new AppError(404, 'Open shift not found');

  const cashTransactions = await prisma.$queryRaw<any[]>`
    SELECT COALESCE(SUM(total_amount), 0) AS total_cash
    FROM "Transaction"
    WHERE user_id = ${user.id}
      AND branch_id = ${shift.branch_id}
      AND status = 'completed'
      AND payment_method = 'cash'
      AND created_at >= ${shift.opened_at}
  `;
  const cashSales = cashTransactions[0]?.total_cash ?? 0;
  const expectedClosing = Number(shift.opening_balance) + Number(cashSales);
  const overageShortage = Number(actual_closing) - expectedClosing;

  const updatedShift = await prisma.cashShift.update({
    where: { id: shift.id },
    data: {
      status: 'closed',
      closed_at: new Date(),
      expected_closing: expectedClosing,
      actual_closing,
      overage_shortage: overageShortage,
      notes: notes || shift.notes
    }
  });

  await AuditService.log(user.id, 'CLOSE_SHIFT', 'CashShift', shift.id, { expectedClosing, actual_closing, overageShortage }, req);

  res.json({
    status: 'success',
    data: {
      ...updatedShift,
      opening_balance: Number(updatedShift.opening_balance),
      expected_closing: Number(updatedShift.expected_closing),
      actual_closing: Number(updatedShift.actual_closing),
      overage_shortage: Number(updatedShift.overage_shortage)
    }
  });
}));

// List past shifts
router.get('/', catchAsync(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const storeId = user.storeId;
  const branchIds = await getAuthorizedBranchIds(req);

  const where: any = { store_id: storeId, branch_id: { in: branchIds } };

  const shifts = await prisma.cashShift.findMany({
    where,
    include: {
      user: { select: { first_name: true, last_name: true } }
    },
    orderBy: { opened_at: 'desc' }
  });

  res.json({
    status: 'success',
    data: shifts.map(s => ({
      ...s,
      opening_balance: Number(s.opening_balance),
      expected_closing: s.expected_closing ? Number(s.expected_closing) : null,
      actual_closing: s.actual_closing ? Number(s.actual_closing) : null,
      overage_shortage: s.overage_shortage ? Number(s.overage_shortage) : null
    }))
  });
}));

export default router;
