import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { authMiddleware } from '../middleware/auth.middleware';
import { catchAsync, AppError } from '../../utils/errorHandler';

const router = Router();
const prisma = new PrismaClient();

router.use(authMiddleware);

// Create customer
router.post(
  '/',
  catchAsync(async (req: Request, res: Response) => {
    const { phone, email, first_name, last_name, date_of_birth } = req.body;

    if (!phone && !email) {
      throw new AppError(400, 'Phone or email is required');
    }

    const customer = await prisma.customer.create({
      data: {
        id: uuidv4(),
        phone,
        email,
        first_name,
        last_name,
        date_of_birth: date_of_birth ? new Date(date_of_birth) : null
      }
    });

    res.status(201).json({
      status: 'success',
      data: customer
    });
  })
);

// Get customers
router.get(
  '/',
  catchAsync(async (req: Request, res: Response) => {
    const { limit = '50', offset = '0', search } = req.query;

    const where: any = {};

    if (search) {
      where.OR = [
        { first_name: { contains: search as string, mode: 'insensitive' } },
        { phone: { contains: search as string, mode: 'insensitive' } },
        { email: { contains: search as string, mode: 'insensitive' } }
      ];
    }

    const [customers, total] = await Promise.all([
      prisma.customer.findMany({
        where,
        take: parseInt(limit as string),
        skip: parseInt(offset as string),
        orderBy: { created_at: 'desc' }
      }),
      prisma.customer.count({ where })
    ]);

    res.json({
      status: 'success',
      data: customers,
      pagination: {
        limit: parseInt(limit as string),
        offset: parseInt(offset as string),
        total
      }
    });
  })
);

// Get customer by ID
router.get(
  '/:id',
  catchAsync(async (req: Request, res: Response) => {
    const customer = await prisma.customer.findUnique({
      where: { id: req.params.id }
    });

    if (!customer) {
      throw new AppError(404, 'Customer not found');
    }

    res.json({
      status: 'success',
      data: customer
    });
  })
);

// Update customer
router.patch(
  '/:id',
  catchAsync(async (req: Request, res: Response) => {
    const customer = await prisma.customer.update({
      where: { id: req.params.id },
      data: req.body
    });

    res.json({
      status: 'success',
      data: customer
    });
  })
);

// Get customer transaction history
router.get(
  '/:id/history',
  catchAsync(async (req: Request, res: Response) => {
    const { limit = '20', offset = '0' } = req.query;

    const [transactions, total] = await Promise.all([
      prisma.transaction.findMany({
        where: { customer_id: req.params.id },
        include: { transaction_items: true },
        orderBy: { created_at: 'desc' },
        take: parseInt(limit as string),
        skip: parseInt(offset as string)
      }),
      prisma.transaction.count({ where: { customer_id: req.params.id } })
    ]);

    res.json({
      status: 'success',
      data: transactions,
      pagination: {
        limit: parseInt(limit as string),
        offset: parseInt(offset as string),
        total
      }
    });
  })
);

// Add loyalty points
router.post(
  '/:id/loyalty',
  catchAsync(async (req: Request, res: Response) => {
    const { points, reason } = req.body;

    if (!points) {
      throw new AppError(400, 'points is required');
    }

    const customer = await prisma.customer.update({
      where: { id: req.params.id },
      data: {
        loyalty_points: {
          increment: points
        }
      }
    });

    res.json({
      status: 'success',
      data: customer
    });
  })
);

export default router;
