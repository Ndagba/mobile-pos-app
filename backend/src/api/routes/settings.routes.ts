import { Router, Request, Response } from 'express';
import { prisma } from '../../lib/prisma';
import { authMiddleware } from '../middleware/auth.middleware';
import { catchAsync, AppError } from '../../utils/errorHandler';
import { BusinessModeService } from '../../services/BusinessModeService';
import { invalidateBarDaySettings } from '../../services/BarLedgerService';

/** Settings row + the store's business mode and whether the mode is locked (Phase 1). */
async function withModeState(storeId: string, settings: any) {
  const mode = await BusinessModeService.getModeState(storeId);
  return { ...settings, ...mode };
}

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
      data: await withModeState(storeId, settings)
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
      'allow_cashier_discount',
      // Bar / Lounge (Phase 1)
      'bar_attendant_discount',
      'bar_allow_backdated_remittance',
      'bar_require_payment_declaration',
      'commission_enabled'
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

    // Bar / Lounge numeric + text settings
    if (b.bar_business_day_cutoff_hour !== undefined) {
      const n = Number(b.bar_business_day_cutoff_hour);
      if (!Number.isInteger(n) || n < 0 || n > 23) {
        throw new AppError(400, 'bar_business_day_cutoff_hour must be a whole hour 0–23');
      }
      data.bar_business_day_cutoff_hour = n;
    }
    if (b.bar_timezone !== undefined) {
      const tz = String(b.bar_timezone).trim();
      try {
        new Intl.DateTimeFormat('en-US', { timeZone: tz }).format(0);
      } catch {
        throw new AppError(400, 'bar_timezone must be a valid IANA timezone, e.g. Africa/Lagos');
      }
      data.bar_timezone = tz;
    }
    if (b.commission_rate === null) data.commission_rate = null;
    else if (b.commission_rate !== undefined) {
      const n = Number(b.commission_rate);
      if (!Number.isFinite(n) || n < 0 || n > 100) throw new AppError(400, 'commission_rate must be 0–100');
      data.commission_rate = Math.round(n * 100) / 100;
    }
    if (b.commission_basis !== undefined) {
      // D27: only the attendant's total sales for now.
      if (b.commission_basis !== 'total_sales') throw new AppError(400, "commission_basis must be 'total_sales'");
      data.commission_basis = b.commission_basis;
    }
    if (data.commission_enabled === true) {
      const current = await prisma.storeSetting.findUnique({ where: { store_id: storeId }, select: { commission_rate: true } });
      const rate = data.commission_rate !== undefined ? data.commission_rate : current?.commission_rate;
      if (rate === null || rate === undefined || Number(rate) <= 0) {
        throw new AppError(400, 'Set a commission rate above 0 before turning commission on');
      }
    }

    const settings = await prisma.storeSetting.upsert({
      where: { store_id: storeId },
      update: data,
      create: { store_id: storeId, ...data }
    });
    invalidateBarDaySettings(storeId);

    res.json({
      status: 'success',
      data: await withModeState(storeId, settings)
    });
  })
);

// Change the store's business mode (admin before the first sale; super-admin always — D3)
router.patch(
  '/business-mode',
  catchAsync(async (req: Request, res: Response) => {
    const user = (req as any).user;
    const result = await BusinessModeService.setStoreMode(user.storeId, req.body?.business_mode, user);
    res.json({ status: 'success', data: result });
  })
);

export default router;
