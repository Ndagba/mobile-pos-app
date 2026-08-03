import { Request } from 'express';
import { prisma } from '../lib/prisma';
import { AppError } from './errorHandler';

/**
 * Resolves and validates a single branch ID that the user is authorized to access.
 * Useful for creation and write operations where a specific single branch is required.
 */
export async function getAuthorizedBranchId(req: Request): Promise<string | null> {
  const user = (req as any).user;
  if (!user) {
    throw new AppError(401, 'Authentication required');
  }

  const role = user.role;
  const homeBranchId = user.branchId;
  const storeId = user.storeId;

  // Retrieve requested branch_id from query or body
  const reqBranchId = (req.query.branch_id as string) || (req.body.branch_id as string) || null;

  if (role === 'admin') {
    if (reqBranchId && reqBranchId !== 'null' && reqBranchId !== 'undefined' && reqBranchId !== 'all') {
      const branch = await prisma.branch.findUnique({
        where: { id: reqBranchId }
      });
      if (!branch || branch.store_id !== storeId) {
        throw new AppError(403, 'You do not have permission to manage this branch');
      }
      return reqBranchId;
    }
    return null;
  }

  if (role === 'manager') {
    if (reqBranchId && reqBranchId !== 'null' && reqBranchId !== 'undefined' && reqBranchId !== 'all') {
      const isHomeBranch = homeBranchId === reqBranchId;
      const isAssignedBranch = await prisma.managerBranch.findUnique({
        where: {
          user_id_branch_id: {
            user_id: user.userId,
            branch_id: reqBranchId
          }
        }
      });

      if (!isHomeBranch && !isAssignedBranch) {
        throw new AppError(403, 'You do not have permission to access this branch');
      }
      return reqBranchId;
    }
    return homeBranchId;
  }

  // Cashier role
  if (reqBranchId && reqBranchId !== 'null' && reqBranchId !== 'undefined' && reqBranchId !== homeBranchId) {
    throw new AppError(403, 'Cashiers are restricted to their assigned branch');
  }

  return homeBranchId;
}

/**
 * Resolves all branch IDs that the user is authorized to access for a query/operation.
 * Returns an array of branch IDs. Handles "All Branches" gracefully by returning all authorized branches.
 */
export async function getAuthorizedBranchIds(req: Request): Promise<string[]> {
  const user = (req as any).user;
  if (!user) {
    throw new AppError(401, 'Authentication required');
  }

  const role = user.role;
  const homeBranchId = user.branchId;
  const storeId = user.storeId;

  // Retrieve requested branch_id from query or body
  const reqBranchId = (req.query.branch_id as string) || (req.body.branch_id as string) || null;
  const isSpecificBranch = reqBranchId && reqBranchId !== 'null' && reqBranchId !== 'undefined' && reqBranchId !== 'all';

  if (role === 'admin') {
    if (isSpecificBranch) {
      const branch = await prisma.branch.findUnique({
        where: { id: reqBranchId }
      });
      if (!branch || branch.store_id !== storeId) {
        throw new AppError(403, 'You do not have permission to access this branch');
      }
      return [reqBranchId];
    }
    // Return all active branches in the store
    const storeBranches = await prisma.branch.findMany({
      where: { store_id: storeId, is_active: true },
      select: { id: true }
    });
    return storeBranches.map((b) => b.id);
  }

  if (role === 'manager') {
    if (isSpecificBranch) {
      const isHomeBranch = homeBranchId === reqBranchId;
      const isAssignedBranch = await prisma.managerBranch.findUnique({
        where: {
          user_id_branch_id: {
            user_id: user.userId,
            branch_id: reqBranchId
          }
        }
      });
      if (!isHomeBranch && !isAssignedBranch) {
        throw new AppError(403, 'You do not have permission to access this branch');
      }
      return [reqBranchId];
    }

    // Default/All: Return all manager's assigned branches + their home branch
    const managerAssignments = await prisma.managerBranch.findMany({
      where: { user_id: user.userId },
      select: { branch_id: true }
    });
    const branchIds = managerAssignments.map((ma) => ma.branch_id);
    if (homeBranchId) {
      branchIds.push(homeBranchId);
    }
    const uniqueIds = Array.from(new Set(branchIds)) as string[];
    return uniqueIds;
  }

  // Cashier role
  if (isSpecificBranch && reqBranchId !== homeBranchId) {
    throw new AppError(403, 'Cashiers are restricted to their assigned branch');
  }
  if (!homeBranchId) {
    throw new AppError(403, 'No branch assigned to this cashier');
  }
  return [homeBranchId];
}
