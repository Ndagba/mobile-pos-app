import { prisma } from '../lib/prisma';
import { Request } from 'express';

export class AuditService {
  static async log(
    userId: string,
    action: string,
    entityType: string,
    entityId: string,
    changes: any = null,
    req?: Request
  ) {
    try {
      let storeId = null;
      let branchId = null;

      if (req) {
        storeId = (req as any).user?.storeId || null;
        branchId = (req as any).user?.branchId || null;
      }

      if (!storeId) {
        const user = await prisma.user.findUnique({ where: { id: userId } });
        storeId = user?.store_id;
        branchId = user?.branch_id;
      }

      await prisma.auditLog.create({
        data: {
          store_id: storeId,
          branch_id: branchId,
          user_id: userId,
          action,
          resource_type: entityType,
          resource_id: entityId,
          changes: changes ? (changes as any) : undefined,
          ip_address: req ? req.ip : undefined,
          device_id: req ? (req.headers['user-agent'] as string) : undefined,
        }
      });
    } catch (error) {
      console.error('Audit logging failed:', error);
    }
  }

  static async getLogs(storeId: string, branchIds?: string[], limit: number = 50, cursor?: string) {
    const where: any = { store_id: storeId };
    if (branchIds && branchIds.length > 0) {
      where.branch_id = { in: branchIds };
    }

    const items = await prisma.auditLog.findMany({
      where,
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { created_at: 'desc' },
      include: {
        user: { select: { first_name: true, last_name: true, email: true } }
      }
    });

    let nextCursor = null;
    if (items.length > limit) {
      const nextItem = items.pop();
      nextCursor = nextItem?.id;
    }

    return { items, nextCursor };
  }
}
