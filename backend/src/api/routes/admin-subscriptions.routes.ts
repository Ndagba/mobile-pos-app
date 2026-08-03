import { Router, Request, Response } from 'express';
import { subscriptionService } from '../../services/SubscriptionService';
import { authMiddleware } from '../middleware/auth.middleware';
import { prisma } from '../../lib/prisma';
import { addDays, addMonths } from 'date-fns';

const router = Router();

// All admin routes require authentication
router.use(authMiddleware);

/**
 * Admin-only middleware to check if user is super admin
 */
const requireSuperAdmin = (req: Request, res: Response, next: Function) => {
  const user = (req as any).user;
  if (!user.is_super_admin) {
    return res.status(403).json({
      error: 'Super admin access required',
      message: 'Only super admins can manage subscriptions',
    });
  }
  next();
};

// ─── GET /admin/subscriptions — List all subscriptions ──────────────────────
router.get(
  '/subscriptions',
  requireSuperAdmin,
  async (req: Request, res: Response) => {
    try {
      const { status, limit = '50', offset = '0' } = req.query;

      const where: any = {};
      if (status) {
        where.status = status;
      }

      const subscriptions = await prisma.subscription.findMany({
        where,
        include: {
          plan: true,
          store: true,
        },
        take: parseInt(limit as string),
        skip: parseInt(offset as string),
        orderBy: { created_at: 'desc' },
      });

      const total = await prisma.subscription.count({ where });

      res.json({
        success: true,
        data: subscriptions,
        pagination: {
          total,
          limit: parseInt(limit as string),
          offset: parseInt(offset as string),
        },
      });
    } catch (error) {
      console.error('Error fetching subscriptions:', error);
      res.status(500).json({ error: 'Failed to fetch subscriptions' });
    }
  }
);

// ─── GET /admin/subscriptions/:storeId — Get store subscription ────────────
router.get(
  '/subscriptions/:storeId',
  requireSuperAdmin,
  async (req: Request, res: Response) => {
    try {
      const { storeId } = req.params;

      const subscription = await prisma.subscription.findUnique({
        where: { store_id: storeId },
        include: {
          plan: true,
          store: true,
          invoices: {
            orderBy: { created_at: 'desc' },
            take: 10,
          },
        },
      });

      if (!subscription) {
        return res.status(404).json({ error: 'Subscription not found' });
      }

      res.json({
        success: true,
        data: subscription,
      });
    } catch (error) {
      console.error('Error fetching subscription:', error);
      res.status(500).json({ error: 'Failed to fetch subscription' });
    }
  }
);

// ─── POST /admin/subscriptions — Manually create subscription ──────────────
router.post(
  '/subscriptions',
  requireSuperAdmin,
  async (req: Request, res: Response) => {
    try {
      const { storeId, planSlug, durationMonths = 1, reason } = req.body;

      if (!storeId || !planSlug) {
        return res.status(400).json({
          error: 'Missing required fields: storeId, planSlug',
        });
      }

      // Check if store exists
      const store = await prisma.store.findUnique({
        where: { id: storeId },
      });

      if (!store) {
        return res.status(404).json({ error: 'Store not found' });
      }

      // Check if subscription already exists
      const existing = await prisma.subscription.findUnique({
        where: { store_id: storeId },
      });

      if (existing) {
        return res.status(400).json({
          error: 'Store already has a subscription. Use update endpoint instead.',
        });
      }

      // Get plan
      const plan = await prisma.subscriptionPlan.findUnique({
        where: { slug: planSlug },
      });

      if (!plan) {
        return res.status(404).json({ error: 'Plan not found' });
      }

      const now = new Date();
      const billingCycleEnd = addMonths(now, durationMonths);

      // Create subscription
      const subscription = await prisma.subscription.create({
        data: {
          store_id: storeId,
          plan_id: plan.id,
          status: 'active',
          billing_cycle_start: now,
          billing_cycle_end: billingCycleEnd,
          next_renewal_at: billingCycleEnd,
          auto_renew: true,
        },
        include: {
          plan: true,
          store: true,
        },
      });

      // Create invoice for admin entry. plan.monthly_price is a Prisma Decimal —
      // coerce to a number before multiplying so we don't end up with NaN/string.
      const adminUser = (req as any).user;
      const monthlyPriceNumber = Number(plan.monthly_price);
      await prisma.invoice.create({
        data: {
          subscription_id: subscription.id,
          amount: monthlyPriceNumber * durationMonths,
          currency: 'NGN',
          status: 'paid',
          invoice_number: `ADMIN-${Date.now()}`,
          billing_date: now,
          due_date: billingCycleEnd,
          paid_at: now,
        },
      });

      // Mark store as active
      await prisma.store.update({
        where: { id: storeId },
        data: { is_active: true },
      });

      // Log action
      await logAdminAction(
        adminUser.userId,
        'CREATE_SUBSCRIPTION',
        storeId,
        {
          planSlug,
          durationMonths,
          reason,
        }
      );

      res.status(201).json({
        success: true,
        message: 'Subscription created successfully',
        data: subscription,
      });
    } catch (error) {
      console.error('Error creating subscription:', error);
      res.status(500).json({ error: 'Failed to create subscription' });
    }
  }
);

// ─── PATCH /admin/subscriptions/:storeId — Update subscription ────────────
router.patch(
  '/subscriptions/:storeId',
  requireSuperAdmin,
  async (req: Request, res: Response) => {
    try {
      const { storeId } = req.params;
      const { planSlug, extendMonths, newStatus, reason } = req.body;

      const subscription = await prisma.subscription.findUnique({
        where: { store_id: storeId },
        include: { plan: true },
      });

      if (!subscription) {
        return res.status(404).json({ error: 'Subscription not found' });
      }

      const updateData: any = {};

      // Change plan
      if (planSlug) {
        const plan = await prisma.subscriptionPlan.findUnique({
          where: { slug: planSlug },
        });

        if (!plan) {
          return res.status(404).json({ error: 'Plan not found' });
        }

        updateData.plan_id = plan.id;
      }

      // Extend subscription
      if (extendMonths && extendMonths > 0) {
        const newBillingEnd = addMonths(
          new Date(subscription.billing_cycle_end),
          extendMonths
        );
        updateData.billing_cycle_end = newBillingEnd;
        updateData.next_renewal_at = newBillingEnd;
        updateData.status = 'active';
      }

      // Change status
      if (newStatus) {
        updateData.status = newStatus;
      }

      const updated = await prisma.subscription.update({
        where: { id: subscription.id },
        data: updateData,
        include: {
          plan: true,
          store: true,
        },
      });

      // Log action
      const adminUser = (req as any).user;
      await logAdminAction(
        adminUser.userId,
        'UPDATE_SUBSCRIPTION',
        storeId,
        {
          planSlug,
          extendMonths,
          newStatus,
          reason,
        }
      );

      res.json({
        success: true,
        message: 'Subscription updated successfully',
        data: updated,
      });
    } catch (error) {
      console.error('Error updating subscription:', error);
      res.status(500).json({ error: 'Failed to update subscription' });
    }
  }
);

// ─── POST /admin/subscriptions/:storeId/extend — Extend trial ──────────────
router.post(
  '/subscriptions/:storeId/extend-trial',
  requireSuperAdmin,
  async (req: Request, res: Response) => {
    try {
      const { storeId } = req.params;
      const { days = 7, reason } = req.body;

      const subscription = await prisma.subscription.findUnique({
        where: { store_id: storeId },
      });

      if (!subscription) {
        return res.status(404).json({ error: 'Subscription not found' });
      }

      if (!subscription.trial_ends_at) {
        return res.status(400).json({
          error: 'Subscription is not a trial. Use extend endpoint instead.',
        });
      }

      const newTrialEnd = addDays(new Date(subscription.trial_ends_at), days);

      const updated = await prisma.subscription.update({
        where: { id: subscription.id },
        data: {
          trial_ends_at: newTrialEnd,
          next_renewal_at: newTrialEnd,
        },
        include: {
          plan: true,
          store: true,
        },
      });

      // Log action
      const adminUser = (req as any).user;
      await logAdminAction(
        adminUser.userId,
        'EXTEND_TRIAL',
        storeId,
        { days, reason }
      );

      res.json({
        success: true,
        message: `Trial extended by ${days} days`,
        data: updated,
      });
    } catch (error) {
      console.error('Error extending trial:', error);
      res.status(500).json({ error: 'Failed to extend trial' });
    }
  }
);

// ─── POST /admin/subscriptions/:storeId/activate — Activate subscription ────
router.post(
  '/subscriptions/:storeId/activate',
  requireSuperAdmin,
  async (req: Request, res: Response) => {
    try {
      const { storeId } = req.params;
      const { reason } = req.body;

      const subscription = await prisma.subscription.findUnique({
        where: { store_id: storeId },
      });

      if (!subscription) {
        return res.status(404).json({ error: 'Subscription not found' });
      }

      const now = new Date();
      const nextRenewal = addMonths(now, 1);

      const updated = await prisma.subscription.update({
        where: { id: subscription.id },
        data: {
          status: 'active',
          billing_cycle_start: now,
          billing_cycle_end: nextRenewal,
          next_renewal_at: nextRenewal,
        },
        include: {
          plan: true,
          store: true,
        },
      });

      // Mark store as active
      await prisma.store.update({
        where: { id: storeId },
        data: { is_active: true },
      });

      // Log action
      const adminUser = (req as any).user;
      await logAdminAction(
        adminUser.userId,
        'ACTIVATE_SUBSCRIPTION',
        storeId,
        { reason }
      );

      res.json({
        success: true,
        message: 'Subscription activated',
        data: updated,
      });
    } catch (error) {
      console.error('Error activating subscription:', error);
      res.status(500).json({ error: 'Failed to activate subscription' });
    }
  }
);

// ─── POST /admin/subscriptions/:storeId/deactivate — Deactivate subscription ─
router.post(
  '/subscriptions/:storeId/deactivate',
  requireSuperAdmin,
  async (req: Request, res: Response) => {
    try {
      const { storeId } = req.params;
      const { reason } = req.body;

      const subscription = await prisma.subscription.findUnique({
        where: { store_id: storeId },
      });

      if (!subscription) {
        return res.status(404).json({ error: 'Subscription not found' });
      }

      const updated = await prisma.subscription.update({
        where: { id: subscription.id },
        data: {
          status: 'expired',
        },
        include: {
          plan: true,
          store: true,
        },
      });

      // Mark store as inactive
      await prisma.store.update({
        where: { id: storeId },
        data: { is_active: false },
      });

      // Log action
      const adminUser = (req as any).user;
      await logAdminAction(
        adminUser.userId,
        'DEACTIVATE_SUBSCRIPTION',
        storeId,
        { reason }
      );

      res.json({
        success: true,
        message: 'Subscription deactivated',
        data: updated,
      });
    } catch (error) {
      console.error('Error deactivating subscription:', error);
      res.status(500).json({ error: 'Failed to deactivate subscription' });
    }
  }
);

// ─── DELETE /admin/subscriptions/:storeId — Delete subscription ────────────
router.delete(
  '/subscriptions/:storeId',
  requireSuperAdmin,
  async (req: Request, res: Response) => {
    try {
      const { storeId } = req.params;
      const { reason } = req.body;

      const subscription = await prisma.subscription.findUnique({
        where: { store_id: storeId },
      });

      if (!subscription) {
        return res.status(404).json({ error: 'Subscription not found' });
      }

      await prisma.subscription.delete({
        where: { id: subscription.id },
      });

      // Log action
      const adminUser = (req as any).user;
      await logAdminAction(
        adminUser.userId,
        'DELETE_SUBSCRIPTION',
        storeId,
        { reason }
      );

      res.json({
        success: true,
        message: 'Subscription deleted',
      });
    } catch (error) {
      console.error('Error deleting subscription:', error);
      res.status(500).json({ error: 'Failed to delete subscription' });
    }
  }
);

// ─── GET /admin/subscriptions-audit-log — View admin actions ───────────────
router.get(
  '/subscriptions-audit-log',
  requireSuperAdmin,
  async (req: Request, res: Response) => {
    try {
      const { storeId, action, limit = '100', offset = '0' } = req.query;

      const where: any = { resource_type: 'subscription' };
      // resource_id stores the storeId for subscription audit logs
      if (storeId) where.resource_id = storeId;
      if (action) where.action = action;

      const logs = await prisma.auditLog.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              first_name: true,
              last_name: true,
            },
          },
        },
        orderBy: { created_at: 'desc' },
        take: parseInt(limit as string),
        skip: parseInt(offset as string),
      });

      res.json({
        success: true,
        data: logs,
      });
    } catch (error) {
      console.error('Error fetching audit log:', error);
      res.status(500).json({ error: 'Failed to fetch audit log' });
    }
  }
);

/**
 * Helper function to log admin actions
 */
async function logAdminAction(
  userId: string,
  action: string,
  storeId: string,
  changes: any
) {
  try {
    await prisma.auditLog.create({
      data: {
        user_id: userId,
        action: `ADMIN_${action}`,
        resource_type: 'subscription',
        resource_id: storeId,
        changes,
      },
    });
  } catch (error) {
    console.error('Error logging admin action:', error);
  }
}

export default router;
