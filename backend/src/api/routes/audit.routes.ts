import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { catchAsync } from '../../utils/errorHandler';
import { AuditService } from '../../services/AuditService';
import { getAuthorizedBranchId, getAuthorizedBranchIds } from '../../utils/branchHelper';

const router = Router();
router.use(authMiddleware);

router.get('/', catchAsync(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const storeId = user.storeId;
  const branchIds = await getAuthorizedBranchIds(req);
  const limit = parseInt((req.query.limit as string) || '50', 10);
  const cursor = req.query.cursor as string | undefined;

  const logs = await AuditService.getLogs(storeId, branchIds, limit, cursor);
  res.json({ status: 'success', data: { items: logs.items, nextCursor: logs.nextCursor } });
}));

export default router;
