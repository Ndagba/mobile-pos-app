import { Router, Request, Response } from 'express';
import { prisma } from '../../lib/prisma';
import { v4 as uuidv4 } from 'uuid';
import { authMiddleware } from '../middleware/auth.middleware';
import { catchAsync, AppError } from '../../utils/errorHandler';

const router = Router();

router.use(authMiddleware);

// ─── Store-isolation helpers ─────────────────────────────────
function supplierStoreWhere(user: any): Record<string, any> {
  if (user?.is_super_admin && !user?.storeId) return {}; // platform-level super admin
  if (!user?.storeId) return {};
  return { store_id: user.storeId };
}

async function assertSupplierAccess(supplierId: string, user: any): Promise<void> {
  if (user?.is_super_admin && !user?.storeId) return;
  if (!user?.storeId) return;

  const s = await prisma.supplier.findUnique({
    where: { id: supplierId },
    select: { store_id: true },
  });
  if (!s) throw new AppError(404, 'Supplier not found');
  if (s.store_id && s.store_id !== user.storeId) {
    throw new AppError(403, 'Access denied');
  }
}

// ─── Create supplier ──────────────────────────────────────────
router.post(
  '/',
  catchAsync(async (req: Request, res: Response) => {
    const user = (req as any).user;
    if (!['admin', 'manager'].includes(user?.role)) {
      throw new AppError(403, 'Only admins or managers can create suppliers');
    }

    const { name, phone, email, address, category, notes, tag } = req.body;
    if (!name?.trim()) throw new AppError(400, 'Supplier name is required');

    const supplier = await prisma.supplier.create({
      data: {
        id: uuidv4(),
        store_id: user?.storeId ?? '',
        name: name.trim(),
        phone: phone?.trim() || null,
        email: email?.trim() || null,
        address: address?.trim() || null,
        category: category?.trim() || null,
        notes: notes?.trim() || null,
        tag: tag || null,
      },
    });

    res.status(201).json({ status: 'success', data: supplier });
  })
);

// ─── Supplier financial summary (for hero stats) ──────────────────────
router.get(
  '/summary',
  catchAsync(async (req: Request, res: Response) => {
    const user = (req as any).user;
    const storeWhere = supplierStoreWhere(user);

    // Fetch all supplier IDs for this store
    const suppliers = await prisma.supplier.findMany({
      where: { ...storeWhere, is_active: true },
      select: { id: true },
    });
    const ids = suppliers.map(s => s.id);

    if (ids.length === 0) return res.json({ status: 'success', data: [] });

    // Aggregate invoices and payments per supplier
    const [invAgg, payAgg] = await Promise.all([
      prisma.purchaseInvoice.groupBy({
        by: ['supplier_id'],
        where: { supplier_id: { in: ids } },
        _sum: { amount: true },
      }),
      prisma.supplierPayment.groupBy({
        by: ['supplier_id'],
        where: { supplier_id: { in: ids } },
        _sum: { amount: true },
      }),
    ]);

    const invMap: Record<string, number> = {};
    const payMap: Record<string, number> = {};
    invAgg.forEach(r => { invMap[r.supplier_id] = Number(r._sum.amount ?? 0); });
    payAgg.forEach(r => { payMap[r.supplier_id] = Number(r._sum.amount ?? 0); });

    const data = ids.map(id => ({
      supplier_id:    id,
      total_invoiced: invMap[id] ?? 0,
      total_paid:     payMap[id] ?? 0,
    }));

    res.json({ status: 'success', data });
  })
);

// ─── Get suppliers ────────────────────────────────────────────
router.get(
  '/',
  catchAsync(async (req: Request, res: Response) => {
    const user = (req as any).user;
    const { limit = '100', offset = '0', search } = req.query;

    const where: any = { ...supplierStoreWhere(user), is_active: true };

    if (search) {
      where.AND = [
        {
          OR: [
            { name: { contains: search as string, mode: 'insensitive' } },
            { phone: { contains: search as string, mode: 'insensitive' } },
            { email: { contains: search as string, mode: 'insensitive' } },
            { category: { contains: search as string, mode: 'insensitive' } },
          ],
        },
      ];
    }

    const [suppliers, total] = await Promise.all([
      prisma.supplier.findMany({
        where,
        take: parseInt(limit as string),
        skip: parseInt(offset as string),
        orderBy: { name: 'asc' },
      }),
      prisma.supplier.count({ where }),
    ]);

    res.json({
      status: 'success',
      data: suppliers,
      pagination: { limit: parseInt(limit as string), offset: parseInt(offset as string), total },
    });
  })
);

// ─── Get supplier by ID ───────────────────────────────────────
router.get(
  '/:id',
  catchAsync(async (req: Request, res: Response) => {
    await assertSupplierAccess(req.params.id, (req as any).user);

    const supplier = await prisma.supplier.findUnique({ where: { id: req.params.id } });
    if (!supplier) throw new AppError(404, 'Supplier not found');

    res.json({ status: 'success', data: supplier });
  })
);

// ─── Update supplier ──────────────────────────────────────────
router.patch(
  '/:id',
  catchAsync(async (req: Request, res: Response) => {
    const user = (req as any).user;
    if (!['admin', 'manager'].includes(user?.role)) {
      throw new AppError(403, 'Only admins or managers can edit suppliers');
    }
    await assertSupplierAccess(req.params.id, user);

    const { name, phone, email, address, category, notes, tag, is_active } = req.body;
    const supplier = await prisma.supplier.update({
      where: { id: req.params.id },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(phone !== undefined && { phone: phone?.trim() || null }),
        ...(email !== undefined && { email: email?.trim() || null }),
        ...(address !== undefined && { address: address?.trim() || null }),
        ...(category !== undefined && { category: category?.trim() || null }),
        ...(notes !== undefined && { notes: notes?.trim() || null }),
        ...(tag !== undefined && { tag: tag || null }),
        ...(is_active !== undefined && { is_active }),
      },
    });

    res.json({ status: 'success', data: supplier });
  })
);


// ─── Delete supplier ──────────────────────────────────────────
router.delete(
  '/:id',
  catchAsync(async (req: Request, res: Response) => {
    const user = (req as any).user;
    if (!['admin', 'manager'].includes(user?.role)) {
      throw new AppError(403, 'Only admins or managers can delete suppliers');
    }
    await assertSupplierAccess(req.params.id, user);

    await prisma.supplier.delete({ where: { id: req.params.id } });
    res.json({ status: 'success', message: 'Supplier deleted successfully' });
  })
);

// ─── Get purchase invoices ────────────────────────────────────

router.get(
  '/:id/invoices',
  catchAsync(async (req: Request, res: Response) => {
    const user = (req as any).user;
    await assertSupplierAccess(req.params.id, user);

    const { limit = '50', offset = '0' } = req.query;

    const [invoices, total] = await Promise.all([
      prisma.purchaseInvoice.findMany({
        where: { supplier_id: req.params.id },
        orderBy: { invoice_date: 'desc' },
        take: parseInt(limit as string),
        skip: parseInt(offset as string),
      }),
      prisma.purchaseInvoice.count({ where: { supplier_id: req.params.id } }),
    ]);

    res.json({
      status: 'success',
      data: invoices,
      pagination: { limit: parseInt(limit as string), offset: parseInt(offset as string), total },
    });
  })
);

// ─── Create purchase invoice ──────────────────────────────────
router.post(
  '/:id/invoices',
  catchAsync(async (req: Request, res: Response) => {
    const user = (req as any).user;
    if (!['admin', 'manager'].includes(user?.role)) {
      throw new AppError(403, 'Only admins or managers can record invoices');
    }
    await assertSupplierAccess(req.params.id, user);

    const { invoice_number, invoice_date, due_date, amount, notes, quantity, unit_price } = req.body;
    if (!invoice_date) throw new AppError(400, 'invoice_date is required');
    if (!amount || parseFloat(amount) <= 0) throw new AppError(400, 'Valid amount is required');

    const invoice = await prisma.purchaseInvoice.create({
      data: {
        id: uuidv4(),
        supplier_id: req.params.id,
        store_id: user?.storeId ?? '',
        invoice_number: invoice_number?.trim() || null,
        invoice_date: new Date(invoice_date),
        due_date: due_date ? new Date(due_date) : null,
        quantity: quantity ? parseFloat(quantity) : null,
        unit_price: unit_price ? parseFloat(unit_price) : null,
        amount: parseFloat(amount),
        status: 'unpaid',
        notes: notes?.trim() || null,
        recorded_by_user_id: user?.id || null,
      },
    });

    res.status(201).json({ status: 'success', data: invoice });
  })
);

// ─── Update purchase invoice (e.g. mark paid/partial) ────────
router.patch(
  '/:id/invoices/:invoiceId',
  catchAsync(async (req: Request, res: Response) => {
    const user = (req as any).user;
    if (!['admin', 'manager'].includes(user?.role)) {
      throw new AppError(403, 'Only admins or managers can update invoices');
    }
    await assertSupplierAccess(req.params.id, user);

    const inv = await prisma.purchaseInvoice.findUnique({ where: { id: req.params.invoiceId } });
    if (!inv) throw new AppError(404, 'Invoice not found');
    if (inv.supplier_id !== req.params.id) throw new AppError(400, 'Invoice does not belong to this supplier');

    const { invoice_number, invoice_date, due_date, amount, status, notes } = req.body;
    const updated = await prisma.purchaseInvoice.update({
      where: { id: req.params.invoiceId },
      data: {
        ...(invoice_number !== undefined && { invoice_number: invoice_number?.trim() || null }),
        ...(invoice_date && { invoice_date: new Date(invoice_date) }),
        ...(due_date !== undefined && { due_date: due_date ? new Date(due_date) : null }),
        ...(amount !== undefined && { amount: parseFloat(amount) }),
        ...(status !== undefined && { status }),
        ...(notes !== undefined && { notes: notes?.trim() || null }),
      },
    });

    res.json({ status: 'success', data: updated });
  })
);

// ─── Delete purchase invoice ──────────────────────────────────
router.delete(
  '/:id/invoices/:invoiceId',
  catchAsync(async (req: Request, res: Response) => {
    const user = (req as any).user;
    if (!['admin', 'manager'].includes(user?.role)) {
      throw new AppError(403, 'Only admins or managers can delete invoices');
    }
    await assertSupplierAccess(req.params.id, user);

    const inv = await prisma.purchaseInvoice.findUnique({ where: { id: req.params.invoiceId } });
    if (!inv) throw new AppError(404, 'Invoice not found');
    if (inv.supplier_id !== req.params.id) throw new AppError(400, 'Invoice does not belong to this supplier');

    await prisma.purchaseInvoice.delete({ where: { id: req.params.invoiceId } });
    res.json({ status: 'success', message: 'Invoice deleted' });
  })
);

// ─── Get supplier payments ────────────────────────────────────
router.get(
  '/:id/payments',
  catchAsync(async (req: Request, res: Response) => {
    await assertSupplierAccess(req.params.id, (req as any).user);

    const { limit = '50', offset = '0' } = req.query;

    const [payments, total] = await Promise.all([
      prisma.supplierPayment.findMany({
        where: { supplier_id: req.params.id },
        orderBy: { date: 'desc' },
        take: parseInt(limit as string),
        skip: parseInt(offset as string),
      }),
      prisma.supplierPayment.count({ where: { supplier_id: req.params.id } }),
    ]);

    res.json({
      status: 'success',
      data: payments,
      pagination: { limit: parseInt(limit as string), offset: parseInt(offset as string), total },
    });
  })
);

// ─── Record supplier payment ──────────────────────────────────
router.post(
  '/:id/payments',
  catchAsync(async (req: Request, res: Response) => {
    const user = (req as any).user;
    if (!['admin', 'manager'].includes(user?.role)) {
      throw new AppError(403, 'Only admins or managers can record payments');
    }
    await assertSupplierAccess(req.params.id, user);

    const { amount, date, notes, invoice_id } = req.body;
    if (!amount || parseFloat(amount) <= 0) throw new AppError(400, 'Valid amount is required');
    if (!date) throw new AppError(400, 'Payment date is required');

    // Compute outstanding balance
    const [invoiceSum, paymentSum] = await Promise.all([
      prisma.purchaseInvoice.aggregate({ where: { supplier_id: req.params.id }, _sum: { amount: true } }),
      prisma.supplierPayment.aggregate({ where: { supplier_id: req.params.id }, _sum: { amount: true } }),
    ]);

    const totalInvoiced = Number(invoiceSum._sum.amount ?? 0);
    const totalPaid = Number(paymentSum._sum.amount ?? 0);
    const outstanding = totalInvoiced - totalPaid;

    if (parseFloat(amount) > outstanding + 0.001) {
      throw new AppError(
        400,
        `Payment amount (₦${parseFloat(amount).toLocaleString()}) exceeds outstanding balance (₦${Math.max(0, outstanding).toLocaleString()})`
      );
    }

    const payment = await prisma.supplierPayment.create({
      data: {
        id: uuidv4(),
        supplier_id: req.params.id,
        invoice_id: invoice_id || null,
        amount: parseFloat(amount),
        date: new Date(date),
        notes: notes?.trim() || null,
        recorded_by_user_id: user?.id || null,
      },
    });

    // Auto-update linked invoice status based on per-invoice payments
    if (invoice_id) {
      const inv = await prisma.purchaseInvoice.findUnique({ where: { id: invoice_id } });
      if (inv && inv.supplier_id === req.params.id) {
        const invAmount = Number(inv.amount);
        // Sum all payments recorded specifically for this invoice
        const invPaymentsAgg = await prisma.supplierPayment.aggregate({
          where: { invoice_id },
          _sum: { amount: true },
        });
        const totalPaidForInv = Number(invPaymentsAgg._sum?.amount ?? 0);
        let newStatus: string;
        if (totalPaidForInv >= invAmount - 0.001) newStatus = 'paid';
        else if (totalPaidForInv > 0)             newStatus = 'partial';
        else                                        newStatus = 'unpaid';
        await prisma.purchaseInvoice.update({ where: { id: invoice_id }, data: { status: newStatus } });
      }
    }

    res.status(201).json({ status: 'success', data: payment });
  })
);

// ─── Delete supplier payment ──────────────────────────────────
router.delete(
  '/:id/payments/:paymentId',
  catchAsync(async (req: Request, res: Response) => {
    const user = (req as any).user;
    if (!['admin', 'manager'].includes(user?.role)) {
      throw new AppError(403, 'Only admins or managers can delete payments');
    }
    await assertSupplierAccess(req.params.id, user);

    const pay = await prisma.supplierPayment.findUnique({ where: { id: req.params.paymentId } });
    if (!pay) throw new AppError(404, 'Payment not found');
    if (pay.supplier_id !== req.params.id) throw new AppError(400, 'Payment does not belong to this supplier');

    await prisma.supplierPayment.delete({ where: { id: req.params.paymentId } });
    res.json({ status: 'success', message: 'Payment deleted' });
  })
);

export default router;
