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

    const b = req.body ?? {};
    const data: any = {};

    // Booleans
    const boolFields = [
      'allow_cashier_add_customers',
      'allow_cashier_edit_customers',
      'customer_menu_enabled',
      'supplier_menu_enabled',
      'receipt_show_logo',
      'allow_cashier_refund',
      'allow_cashier_discount'
    ];
    for (const f of boolFields) {
      if (typeof b[f] === 'boolean') data[f] = b[f];
    }

    // Free-text (nullable) store profile + receipt
    const textFields = ['business_name', 'rc_number', 'store_address', 'receipt_footer'];
    for (const f of textFields) {
      if (typeof b[f] === 'string') data[f] = b[f].trim() || null;
      else if (b[f] === null) data[f] = null;
    }

    // Numeric
    if (b.tax_rate === null) data.tax_rate = null;
    else if (b.tax_rate !== undefined) {
      const n = Number(b.tax_rate);
      if (!Number.isFinite(n) || n < 0 || n > 100) throw new AppError(400, 'tax_rate must be 0–100');
      data.tax_rate = n;
    }
    if (b.max_discount_percent === null) data.max_discount_percent = null;
    else if (b.max_discount_percent !== undefined) {
      const n = Math.round(Number(b.max_discount_percent));
      if (!Number.isFinite(n) || n < 0 || n > 100) throw new AppError(400, 'max_discount_percent must be 0–100');
      data.max_discount_percent = n;
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
