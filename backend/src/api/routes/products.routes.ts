import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authMiddleware } from '../middleware/auth.middleware';
import { catchAsync, AppError } from '../../utils/errorHandler';

const router = Router();
const prisma = new PrismaClient();

// Get all products (public)
router.get(
  '/',
  catchAsync(async (req: Request, res: Response) => {
    const { limit = '100', offset = '0', category_id, search } = req.query;

    const where: any = { is_active: true };

    if (category_id) {
      where.category_id = category_id;
    }

    if (search) {
      where.OR = [
        { name: { contains: search as string, mode: 'insensitive' } },
        { sku: { contains: search as string, mode: 'insensitive' } },
        { barcode: { contains: search as string, mode: 'insensitive' } }
      ];
    }

    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where,
        include: { category: true },
        take: parseInt(limit as string),
        skip: parseInt(offset as string)
      }),
      prisma.product.count({ where })
    ]);

    res.json({
      status: 'success',
      data: products,
      pagination: {
        limit: parseInt(limit as string),
        offset: parseInt(offset as string),
        total
      }
    });
  })
);

// Get single product
router.get(
  '/:id',
  catchAsync(async (req: Request, res: Response) => {
    const product = await prisma.product.findUnique({
      where: { id: req.params.id },
      include: { category: true }
    });

    if (!product) {
      throw new AppError(404, 'Product not found');
    }

    res.json({
      status: 'success',
      data: product
    });
  })
);

// Create product (admin only)
router.post(
  '/',
  authMiddleware,
  catchAsync(async (req: Request, res: Response) => {
    const requesterRole = (req as any).user?.role;

    if (requesterRole !== 'admin') {
      throw new AppError(403, 'Only admins can create products');
    }

    const {
      category_id,
      sku,
      name,
      description,
      marked_price,
      effective_price,
      cost_price,
      tax_rate,
      barcode,
      image_url,
      unit
    } = req.body;

    if (!category_id || !sku || !name || !marked_price || !effective_price) {
      throw new AppError(400, 'Missing required product fields');
    }

    const product = await prisma.product.create({
      data: {
        id: require('uuid').v4(),
        category_id,
        sku,
        name,
        description,
        marked_price,
        effective_price,
        cost_price,
        tax_rate: tax_rate || 0,
        barcode,
        image_url,
        unit: unit || 'piece'
      },
      include: { category: true }
    });

    res.status(201).json({
      status: 'success',
      data: product
    });
  })
);

// Update product
router.patch(
  '/:id',
  authMiddleware,
  catchAsync(async (req: Request, res: Response) => {
    const requesterRole = (req as any).user?.role;

    if (requesterRole !== 'admin') {
      throw new AppError(403, 'Only admins can update products');
    }

    const product = await prisma.product.update({
      where: { id: req.params.id },
      data: req.body,
      include: { category: true }
    });

    res.json({
      status: 'success',
      data: product
    });
  })
);

// Delete product (soft delete)
router.delete(
  '/:id',
  authMiddleware,
  catchAsync(async (req: Request, res: Response) => {
    const requesterRole = (req as any).user?.role;

    if (requesterRole !== 'admin') {
      throw new AppError(403, 'Only admins can delete products');
    }

    await prisma.product.update({
      where: { id: req.params.id },
      data: { is_active: false }
    });

    res.json({
      status: 'success',
      message: 'Product deleted'
    });
  })
);

export default router;
