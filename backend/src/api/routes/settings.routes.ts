import { Router, Request, Response } from 'express';
import { prisma } from '../../lib/prisma';
import { authMiddleware } from '../middleware/auth.middleware';
import { catchAsync, AppError } from '../../utils/errorHandler';

const router = Router();

router.use(authMiddleware);

// Get store settings (any authenticated user)
router.get(
  '/',
  catchAsync(async (req: Request, res: Response) => {
    const storeId = (req as any).user.storeId;

    let settings = await prisma.storeSetting.findUnique({
      where: { store_id: storeId }
    });

    if (!settings) {
      settings = await prisma.storeSetting.create({
        data: { store_id: storeId }
      });
    }

    res.json({
      status: 'success',
      data: settings
    });
  })
);

// Update store settings (manager/admin only)
router.patch(
  '/',
  catchAsync(async (req: Request, res: Response) => {
    const storeId = (req as any).user.storeId;
    const role = (req as any).user.role;

    if (role !== 'admin' && role !== 'manager') {
      throw new AppError(403, 'Only managers and admins can change store settings');
    }

    const {
      allow_cashier_add_customers,
      allow_cashier_edit_customers,
      customer_menu_enabled,
      supplier_menu_enabled
    } = req.body;

    const data: any = {};
    if (typeof allow_cashier_add_customers === 'boolean') {
      data.allow_cashier_add_customers = allow_cashier_add_customers;
    }
    if (typeof allow_cashier_edit_customers === 'boolean') {
      data.allow_cashier_edit_customers = allow_cashier_edit_customers;
    }
    if (typeof customer_menu_enabled === 'boolean') {
      data.customer_menu_enabled = customer_menu_enabled;
    }
    if (typeof supplier_menu_enabled === 'boolean') {
      data.supplier_menu_enabled = supplier_menu_enabled;
    }

    const settings = await prisma.storeSetting.upsert({
      where: { store_id: storeId },
      update: data,
      create: { store_id: storeId, ...data }
    });

    res.json({
      status: 'success',
      data: settings
    });
  })
);

export default router;
