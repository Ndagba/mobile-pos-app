import { Request, Response, NextFunction } from 'express';
import { subscriptionService } from '../../services/SubscriptionService';

interface FeatureGateOptions {
  minPlan?: 'business' | 'pro'; // Minimum plan required
  requireActive?: boolean; // Must have active subscription
  limitCheck?: 'branch_creation' | 'user_creation' | 'transaction_creation'; // Feature to check limits for
}

/**
 * Feature gate middleware
 * Blocks operations when subscription is inactive or doesn't allow the feature
 *
 * Usage:
 * router.post('/', authMiddleware, featureGate({requireActive: true}), controller)
 */
export const featureGate = (options: FeatureGateOptions = {}) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = (req as any).user;
      if (!user || !user.storeId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const storeId = user.storeId;

      // Check if subscription is active (if required)
      if (options.requireActive) {
        const isActive = await subscriptionService.isStoreActive(storeId);
        if (!isActive) {
          return res.status(403).json({
            error: 'Subscription inactive or expired',
            message: 'Your subscription has expired. Please renew to continue using this feature.',
            feature: 'transaction_creation',
          });
        }
      }

      // Check specific plan limits
      if (options.limitCheck === 'branch_creation') {
        const validation = await subscriptionService.validateBranchLimit(storeId);
        if (!validation.allowed) {
          return res.status(403).json({
            error: 'Plan limit exceeded',
            message: validation.reason,
            feature: 'branch_creation',
          });
        }
      }

      if (options.limitCheck === 'user_creation') {
        const validation = await subscriptionService.validateUserLimit(storeId);
        if (!validation.allowed) {
          return res.status(403).json({
            error: 'Plan limit exceeded',
            message: validation.reason,
            feature: 'user_creation',
          });
        }
      }

      if (options.limitCheck === 'transaction_creation') {
        const validation = await subscriptionService.validateTransactionCreation(storeId);
        if (!validation.allowed) {
          return res.status(403).json({
            error: 'Subscription required',
            message: validation.reason,
            feature: 'transaction_creation',
          });
        }
      }

      // Check minimum plan requirement
      if (options.minPlan) {
        const subscription = await subscriptionService.getStoreSubscription(storeId);

        if (!subscription) {
          return res.status(403).json({
            error: 'No active subscription',
            message: 'This feature requires an active subscription.',
          });
        }

        // Pro-only features
        if (options.minPlan === 'pro' && subscription.plan.slug !== 'pro') {
          return res.status(403).json({
            error: 'Premium feature',
            message: 'This feature is only available in the Pro plan. Please upgrade.',
          });
        }
      }

      // All checks passed
      next();
    } catch (error) {
      console.error('Error in featureGate middleware:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  };
};

/**
 * Middleware to require active subscription for write operations
 */
export const requireActiveSubscription = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const user = (req as any).user;
    if (!user || !user.storeId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const isActive = await subscriptionService.isStoreActive(user.storeId);

    if (!isActive) {
      return res.status(403).json({
        error: 'Subscription inactive or expired',
        message: 'Your subscription has expired. Please renew to continue using this feature.',
      });
    }

    next();
  } catch (error) {
    console.error('Error in requireActiveSubscription middleware:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Middleware to check branch creation limits
 */
export const checkBranchLimit = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = (req as any).user;
    if (!user || !user.storeId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const validation = await subscriptionService.validateBranchLimit(user.storeId);

    if (!validation.allowed) {
      return res.status(403).json({
        error: 'Branch limit exceeded',
        message: validation.reason,
      });
    }

    next();
  } catch (error) {
    console.error('Error in checkBranchLimit middleware:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
