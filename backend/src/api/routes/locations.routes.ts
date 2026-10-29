import { Router, Request, Response } from 'express';
import { prisma } from '../../lib/prisma';
import { v4 as uuidv4 } from 'uuid';
import { authMiddleware } from '../middleware/auth.middleware';
import { catchAsync, AppError } from '../../utils/errorHandler';
import { getAuthorizedBranchIds } from '../../utils/branchHelper';

const router = Router();

// GET /v1/locations — list active locations for the user's branch (authenticated)
router.get(
  '/',
  authMiddleware,
  catchAsync(async (req: Request, res: Response) => {
    const user = (req as any).user;
    const where: any = { is_active: true };

    // Branch filtering
    const branchIds = await getAuthorizedBranchIds(req);
    where.branch_id = { in: branchIds };

    const locations = await (prisma as any).location.findMany({
      where,
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { products: { where: { is_active: true } } } }
      }
    });

    res.json({
      status: 'success',
      data: locations
    });
  })
);

// GET /v1/locations/:id
router.get(
  '/:id',
  authMiddleware,
  catchAsync(async (req: Request, res: Response) => {
    const location = await (prisma as any).location.findUnique({
      where: { id: req.params.id },
      include: {
        products: { where: { is_active: true } },
        _count: { select: { products: { where: { is_active: true } } } }
      }
    });

    if (!location) throw new AppError(404, 'Location not found');

    res.json({ status: 'success', data: location });
  })
);

// POST /v1/locations — create (admin or manager)
router.post(
  '/',
  authMiddleware,
  catchAsync(async (req: Request, res: Response) => {
    const user = (req as any).user;
    const role: string = user?.role;

    if (!['admin', 'manager'].includes(role)) {
      throw new AppError(403, 'Only admins or managers can create locations');
    }

    let branchId: string | null =
      role === 'admin'
        ? (req.body.branch_id ?? user?.branchId ?? null)
        : (user?.branchId ?? req.body.branch_id ?? null);

    if (!branchId && user?.storeId) {
      const activeBranches = await prisma.branch.findMany({
        where: { store_id: user.storeId, is_active: true }
      });
      if (activeBranches.length === 1) {
        branchId = activeBranches[0].id;
      }
    }

    if (!branchId) {
      throw new AppError(400, 'branch_id is required');
    }

    const { name, description } = req.body;

    if (!name?.trim()) {
      throw new AppError(400, 'Location name is required');
    }

    // Check for duplicate name within the same branch
    const existing = await (prisma as any).location.findFirst({
      where: { name: name.trim(), branch_id: branchId }
    });
    if (existing) {
      throw new AppError(409, `Location "${name.trim()}" already exists in this branch`);
    }

    const location = await (prisma as any).location.create({
      data: {
        id: uuidv4(),
        name: name.trim(),
        description: description?.trim() || null,
        branch_id: branchId
      }
    });

    res.status(201).json({ status: 'success', data: location });
  })
);

// PATCH /v1/locations/:id — update (admin or manager)
router.patch(
  '/:id',
  authMiddleware,
  catchAsync(async (req: Request, res: Response) => {
    const role = (req as any).user?.role;
    if (!['admin', 'manager'].includes(role)) {
      throw new AppError(403, 'Only admins or managers can update locations');
    }

    const { name, description, is_active } = req.body;

    const location = await (prisma as any).location.update({
      where: { id: req.params.id },
      data: {
        ...(name && { name: name.trim() }),
        ...(description !== undefined && { description: description?.trim() || null }),
        ...(is_active !== undefined && { is_active })
      }
    });

    res.json({ status: 'success', data: location });
  })
);

// DELETE /v1/locations/:id — delete location (admin or manager, safe deletion)
router.delete(
  '/:id',
  authMiddleware,
  catchAsync(async (req: Request, res: Response) => {
    const role = (req as any).user?.role;
    if (!['admin', 'manager'].includes(role)) {
      throw new AppError(403, 'Only admins or managers can delete locations');
    }

    // Check if products are currently assigned to this location
    const productCount = await prisma.product.count({
      where: { location_id: req.params.id, is_active: true } as any
    });

    if (productCount > 0) {
      throw new AppError(
        400,
        `This location is currently assigned to ${productCount} product(s). Please reassign these products before deleting the location.`
      );
    }

    await (prisma as any).location.update({
      where: { id: req.params.id },
      data: { is_active: false }
    });

    res.json({ status: 'success', message: 'Location deleted successfully' });
  })
);

export default router;
