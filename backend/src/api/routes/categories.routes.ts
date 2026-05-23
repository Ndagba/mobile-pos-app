import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { authMiddleware } from '../middleware/auth.middleware';
import { catchAsync, AppError } from '../../utils/errorHandler';

const router = Router();
const prisma = new PrismaClient();

// GET /v1/categories — list active categories for the user's branch (authenticated)
router.get(
  '/',
  authMiddleware,
  catchAsync(async (req: Request, res: Response) => {
    const user = (req as any).user;
    const role: string | undefined = user?.role;
    const branchId: string | null = user?.branchId ?? null;
    const storeId: string | null = user?.storeId ?? null;

    const where: any = { is_active: true };

    // Branch filtering — same hierarchy as products:
    //   1. Admin passes explicit ?branch_id → use it
    //   2. JWT has a branchId (manager / cashier) → use it
    //   3. Admin with no branch → scope to whole store via branch relation
    if (role === 'admin' && req.query.branch_id) {
      where.branch_id = req.query.branch_id as string;
    } else if (branchId) {
      where.branch_id = branchId;
    } else if (storeId) {
      where.branch = { store_id: storeId };
    }

    const categories = await prisma.category.findMany({
      where,
      orderBy: [{ display_order: 'asc' }, { name: 'asc' }],
      include: {
        _count: { select: { products: { where: { is_active: true } } } }
      }
    });

    res.json({
      status: 'success',
      data: categories
    });
  })
);

// GET /v1/categories/:id
router.get(
  '/:id',
  authMiddleware,
  catchAsync(async (req: Request, res: Response) => {
    const category = await prisma.category.findUnique({
      where: { id: req.params.id },
      include: { products: { where: { is_active: true } } }
    });

    if (!category) throw new AppError(404, 'Category not found');

    res.json({ status: 'success', data: category });
  })
);

// POST /v1/categories — create (admin or manager)
router.post(
  '/',
  authMiddleware,
  catchAsync(async (req: Request, res: Response) => {
    const user = (req as any).user;
    const role: string = user?.role;

    if (!['admin', 'manager'].includes(role)) {
      throw new AppError(403, 'Only admins or managers can create categories');
    }

    // Determine branchId: from JWT first, then from body as fallback
    const branchId: string | null = user?.branchId ?? req.body.branch_id ?? null;

    if (!branchId) {
      throw new AppError(400, 'branch_id is required (assign the user to a branch or pass branch_id in request body)');
    }

    const { name, description, display_order } = req.body;

    if (!name?.trim()) {
      throw new AppError(400, 'Category name is required');
    }

    // Check for duplicate name within the same branch
    const existing = await prisma.category.findFirst({
      where: { name: name.trim(), branch_id: branchId }
    });
    if (existing) {
      throw new AppError(409, `Category "${name.trim()}" already exists in this branch`);
    }

    const category = await prisma.category.create({
      data: {
        id: uuidv4(),
        name: name.trim(),
        description: description?.trim() || null,
        display_order: display_order ?? null,
        branch_id: branchId
      }
    });

    res.status(201).json({ status: 'success', data: category });
  })
);

// PATCH /v1/categories/:id — update (admin or manager)
router.patch(
  '/:id',
  authMiddleware,
  catchAsync(async (req: Request, res: Response) => {
    const role = (req as any).user?.role;
    if (!['admin', 'manager'].includes(role)) {
      throw new AppError(403, 'Only admins or managers can update categories');
    }

    const { name, description, display_order, is_active } = req.body;

    const category = await prisma.category.update({
      where: { id: req.params.id },
      data: {
        ...(name && { name: name.trim() }),
        ...(description !== undefined && { description: description?.trim() || null }),
        ...(display_order !== undefined && { display_order }),
        ...(is_active !== undefined && { is_active })
      }
    });

    res.json({ status: 'success', data: category });
  })
);

// DELETE /v1/categories/:id — soft delete (admin only)
router.delete(
  '/:id',
  authMiddleware,
  catchAsync(async (req: Request, res: Response) => {
    const role = (req as any).user?.role;
    if (role !== 'admin') {
      throw new AppError(403, 'Only admins can delete categories');
    }

    await prisma.category.update({
      where: { id: req.params.id },
      data: { is_active: false }
    });

    res.json({ status: 'success', message: 'Category deactivated' });
  })
);

export default router;
