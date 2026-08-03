import { Router, Request, Response } from 'express';
import { prisma } from '../../lib/prisma';
import { authMiddleware } from '../middleware/auth.middleware';
import { catchAsync, AppError } from '../../utils/errorHandler';
import { getAuthorizedBranchId, getAuthorizedBranchIds } from '../../utils/branchHelper';
import { processAndSaveImage } from '../../utils/imageProcessor';

const router = Router();

// POST /v1/products/upload-image (authenticated admin/manager)
router.post(
  '/upload-image',
  authMiddleware,
  catchAsync(async (req: Request, res: Response) => {
    const user = (req as any).user;
    const requesterRole = user?.role;
    if (!['admin', 'manager'].includes(requesterRole ?? '')) {
      throw new AppError(403, 'Only admins or managers can upload product images');
    }

    const { image } = req.body;
    if (!image) {
      throw new AppError(400, 'Image data (base64 string) is required');
    }

    const storeId = user.storeId || 'default';
    const result = await processAndSaveImage(image, storeId);

    res.json({
      status: 'success',
      data: result
    });
  })
);

import { v4 as uuidv4 } from 'uuid';

// Get all products (authenticated — branch scoping requires knowing who's asking)
router.get(
  '/',
  authMiddleware,
  catchAsync(async (req: Request, res: Response) => {
    const { offset = '0', category_id, search } = req.query;
    const requestedLimit = parseInt((req.query.limit as string) ?? '30', 10);
    const MAX_LIMIT = 10000;
    const limit = String(
      isNaN(requestedLimit) || requestedLimit < 1
        ? 30
        : Math.min(requestedLimit, MAX_LIMIT)
    );

    const user = (req as any).user;
    const storeId: string | null = user?.storeId ?? null;

    const where: any = { is_active: true };

    // Branch filtering
    const branchIds = await getAuthorizedBranchIds(req);
    where.branch_id = { in: branchIds };

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
        include: { category: true, inventory: true },
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
      include: { category: true, inventory: true }
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

// Create product (admin or manager)
router.post(
  '/',
  authMiddleware,
  catchAsync(async (req: Request, res: Response) => {
    const user = (req as any).user;
    const requesterRole: string = user?.role;

    if (!['admin', 'manager'].includes(requesterRole)) {
      throw new AppError(403, 'Only admins or managers can create products');
    }

    const {
      category_id,
      sku,
      name,
      description,
      // Accept multiple price field aliases from mobile clients
      marked_price,
      effective_price,
      price,        // alias
      base_price,   // alias
      cost_price,
      tax_rate,
      barcode,
      image_url,
      unit,
      initial_quantity,
      low_stock_threshold,   // store-defined default; falls back to 10
    } = req.body;

    // Determine branchId. Admins explicitly choose the target branch in the UI,
    // so an admin's body.branch_id MUST win over their own JWT branch. Managers/
    // cashiers are pinned to their JWT branch.
    let branchId: string | null =
      requesterRole === 'admin'
        ? (req.body.branch_id ?? user?.branchId ?? null)
        : (user?.branchId ?? req.body.branch_id ?? null);

    if (!branchId && user?.storeId) {
      const activeBranches = await prisma.branch.findMany({
        where: { store_id: user.storeId, is_active: true }
      });
      if (activeBranches.length === 1) {
        branchId = activeBranches[0].id;
      }
    }

    if (!branchId) {
      throw new AppError(400, 'branch_id is required (assign the user to a branch or pass branch_id in request body)');
    }

    // Resolve price aliases
    const resolvedMarkedPrice = marked_price ?? price ?? base_price;
    const resolvedEffectivePrice = effective_price ?? marked_price ?? price ?? base_price;

    if (!category_id || !sku || !name || resolvedMarkedPrice == null) {
      throw new AppError(400, 'Required fields: category_id, sku, name, marked_price');
    }

    // Check for duplicate SKU within the same branch
    const existing = await prisma.product.findFirst({
      where: { sku, branch_id: branchId }
    });
    if (existing) {
      throw new AppError(409, `SKU "${sku}" already exists in this branch (product "${existing.name}")`);
    }

    // Check for duplicate barcode within the same branch (barcode is unique per
    // branch). Without this, a repeat barcode trips the DB unique constraint and
    // surfaces as a generic 500 instead of a clear message.
    if (barcode) {
      const dupBarcode = await prisma.product.findFirst({
        where: { barcode, branch_id: branchId }
      });
      if (dupBarcode) {
        throw new AppError(409, `Barcode "${barcode}" is already used by "${dupBarcode.name}" in this branch`);
      }
    }

    // Create product + inventory record in one transaction
    const productId = uuidv4();
    await prisma.$transaction(async (tx) => {
      await tx.product.create({
        data: {
          id: productId,
          category_id,
          sku,
          name,
          description: description || null,
          marked_price: resolvedMarkedPrice,
          effective_price: resolvedEffectivePrice,
          cost_price: cost_price || null,
          tax_rate: tax_rate || 0,
          barcode: barcode || null,
          image_url: image_url || null,
          unit: unit || 'piece',
          branch_id: branchId
        }
      });

      // Auto-create inventory record.
      // Use the store-supplied threshold (sent from Settings) or fall back to 10.
      const resolvedThreshold = Math.max(1, Math.round(Number(low_stock_threshold ?? 10)));
      await tx.inventory.create({
        data: {
          id: uuidv4(),
          product_id: productId,
          quantity_on_hand: BigInt(Math.max(0, Number(initial_quantity ?? 0))),
          low_stock_threshold: BigInt(resolvedThreshold),
          reorder_point: BigInt(Math.max(resolvedThreshold, 20))
        }
      });
    });

    // Re-fetch with category + inventory after transaction commits
    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: { category: true, inventory: true }
    });

    res.status(201).json({
      status: 'success',
      data: product
    });
  })
);

// Update product (admin or manager)
router.patch(
  '/:id',
  authMiddleware,
  catchAsync(async (req: Request, res: Response) => {
    const requesterRole = (req as any).user?.role;

    if (!['admin', 'manager'].includes(requesterRole)) {
      throw new AppError(403, 'Only admins or managers can update products');
    }

    const {
      name,
      description,
      category_id,
      sku,
      marked_price,
      effective_price,
      price,
      base_price,
      cost_price,
      tax_rate,
      barcode,
      image_url,
      unit,
      is_active
    } = req.body;

    // Load the product first so we can scope duplicate checks to its branch and
    // return a clear 404 if it doesn't exist.
    const current = await prisma.product.findUnique({ where: { id: req.params.id } });
    if (!current) {
      throw new AppError(404, 'Product not found');
    }

    // Reject duplicate barcode / SKU within the same branch with a clear message
    // (otherwise the DB unique constraint surfaces as a generic 500).
    if (barcode !== undefined && barcode) {
      const dupBarcode = await prisma.product.findFirst({
        where: { barcode, branch_id: current.branch_id, id: { not: current.id } }
      });
      if (dupBarcode) {
        throw new AppError(409, `Barcode "${barcode}" is already used by "${dupBarcode.name}" in this branch`);
      }
    }
    if (sku !== undefined && sku && sku !== current.sku) {
      const dupSku = await prisma.product.findFirst({
        where: { sku, branch_id: current.branch_id, id: { not: current.id } }
      });
      if (dupSku) {
        throw new AppError(409, `SKU "${sku}" is already used by "${dupSku.name}" in this branch`);
      }
    }

    // Build update payload — only include fields that were sent
    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (category_id !== undefined) updateData.category_id = category_id;
    if (sku !== undefined) updateData.sku = sku;
    if (cost_price !== undefined) updateData.cost_price = cost_price;
    if (tax_rate !== undefined) updateData.tax_rate = tax_rate;
    if (barcode !== undefined) updateData.barcode = barcode;
    if (image_url !== undefined) updateData.image_url = image_url;
    if (unit !== undefined) updateData.unit = unit;
    if (is_active !== undefined) updateData.is_active = is_active;

    // Resolve price aliases
    const resolvedMarked = marked_price ?? price ?? base_price;
    const resolvedEffective = effective_price ?? marked_price ?? price ?? base_price;
    if (resolvedMarked !== undefined) updateData.marked_price = resolvedMarked;
    if (resolvedEffective !== undefined) updateData.effective_price = resolvedEffective;

    const product = await prisma.product.update({
      where: { id: req.params.id },
      data: updateData,
      include: { category: true, inventory: true }
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

// Full-text search (authenticated — branch scoping requires knowing who's asking)
router.get(
  '/search',
  authMiddleware,
  catchAsync(async (req: Request, res: Response) => {
    const { q, category_id, min_price, max_price, limit = '50', offset = '0' } = req.query;

    if (!q) {
      throw new AppError(400, 'Search query required');
    }

    const user = (req as any).user;
    const storeId: string | null = user?.storeId ?? null;

    const where: any = {
      is_active: true,
      OR: [
        { name: { contains: q as string, mode: 'insensitive' } },
        { description: { contains: q as string, mode: 'insensitive' } },
        { sku: { contains: q as string, mode: 'insensitive' } },
        { barcode: { contains: q as string, mode: 'insensitive' } }
      ]
    };

    // Branch filtering
    const branchIds = await getAuthorizedBranchIds(req);
    where.branch_id = { in: branchIds };

    if (category_id) {
      where.category_id = category_id;
    }

    if (min_price || max_price) {
      where.effective_price = {};
      if (min_price) where.effective_price.gte = parseFloat(min_price as string);
      if (max_price) where.effective_price.lte = parseFloat(max_price as string);
    }

    const [results, total] = await Promise.all([
      prisma.product.findMany({
        where,
        include: { category: true, inventory: true },
        take: parseInt(limit as string),
        skip: parseInt(offset as string)
      }),
      prisma.product.count({ where })
    ]);

    res.json({
      status: 'success',
      data: results,
      count: results.length,
      pagination: {
        limit: parseInt(limit as string),
        offset: parseInt(offset as string),
        total
      }
    });
  })
);

// Bulk import products (admin only)
router.post(
  '/bulk',
  authMiddleware,
  catchAsync(async (req: Request, res: Response) => {
    const user = (req as any).user;
    const requesterRole: string = user?.role;

    if (requesterRole !== 'admin') {
      throw new AppError(403, 'Only admins can bulk import products');
    }

    const { products } = req.body;

    if (!Array.isArray(products) || products.length === 0) {
      throw new AppError(400, 'Products array required');
    }

    // Determine branchId for the bulk import: from JWT or from body-level branch_id
    const defaultBranchId: string | null = user?.branchId ?? req.body.branch_id ?? null;

    const created = await prisma.$transaction(
      products.map((p: any) => {
        const productBranchId = p.branch_id ?? defaultBranchId;
        if (!productBranchId) {
          throw new AppError(400, `Product "${p.sku}" is missing branch_id`);
        }
        return prisma.product.create({
          data: {
            id: uuidv4(),
            category_id: p.category_id,
            sku: p.sku,
            name: p.name,
            description: p.description,
            marked_price: p.marked_price,
            effective_price: p.effective_price,
            cost_price: p.cost_price,
            tax_rate: p.tax_rate || 0,
            barcode: p.barcode,
            image_url: p.image_url,
            unit: p.unit || 'piece',
            branch_id: productBranchId
          }
        });
      })
    );

    res.status(201).json({
      status: 'success',
      message: `${created.length} products imported`,
      data: created
    });
  })
);

// ─── CSV import (admin) ───────────────────────────────────────
// Accepts a single CSV string + branch_id. Auto-creates categories by name,
// upserts products by (sku, branch_id), and sets initial inventory.
// Header columns: category,name,sku,barcode,marked_price,effective_price,
//                 cost_price,tax_rate,unit,initial_stock,low_stock_threshold,description
function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

router.post(
  '/bulk-import',
  authMiddleware,
  catchAsync(async (req: Request, res: Response) => {
    const user = (req as any).user;
    if (user?.role !== 'admin') {
      throw new AppError(403, 'Only admins can bulk import products');
    }

    const { branch_id, csv } = req.body;
    const branchId: string | undefined = branch_id ?? user?.branchId;
    if (!branchId) throw new AppError(400, 'branch_id is required');
    if (typeof csv !== 'string' || !csv.trim()) {
      throw new AppError(400, 'csv text is required');
    }

    const lines = csv.split(/\r?\n/).filter(l => l.trim().length > 0);
    if (lines.length < 2) {
      throw new AppError(400, 'CSV must include a header row and at least one product row');
    }

    const header = parseCsvLine(lines[0]).map(h => h.trim().toLowerCase());
    // Accept either the simple `selling_price` (matches the in-app form) or the
    // power-user pair `marked_price` + `effective_price` for discounted items.
    const hasPrice =
      header.includes('selling_price') ||
      header.includes('price') ||
      header.includes('marked_price');
    if (!hasPrice) {
      throw new AppError(
        400,
        'Missing required column: selling_price (or marked_price)'
      );
    }
    for (const r of ['category', 'name', 'sku']) {
      if (!header.includes(r)) {
        throw new AppError(400, `Missing required column: ${r}`);
      }
    }

    const summary = {
      categories_created: 0,
      products_created: 0,
      products_updated: 0,
      errors: [] as { row: number; error: string }[],
    };
    const categoryCache = new Map<string, string>();

    for (let i = 1; i < lines.length; i++) {
      try {
        const fields = parseCsvLine(lines[i]);
        const row: Record<string, string> = {};
        header.forEach((col, idx) => {
          row[col] = (fields[idx] ?? '').trim();
        });

        if (!row.category || !row.name || !row.sku) {
          summary.errors.push({ row: i + 1, error: 'category, name, sku are required' });
          continue;
        }

        // Resolve / create category for this branch
        let categoryId = categoryCache.get(row.category);
        if (!categoryId) {
          const existing = await prisma.category.findFirst({
            where: { name: row.category, branch_id: branchId }
          });
          if (existing) {
            categoryId = existing.id;
          } else {
            const created = await prisma.category.create({
              data: { name: row.category, branch_id: branchId }
            });
            categoryId = created.id;
            summary.categories_created++;
          }
          categoryCache.set(row.category, categoryId);
        }

        // Resolve prices: prefer the simple `selling_price` (used in the
        // in-app form). If marked/effective are provided explicitly, honour
        // them so users can express tag price vs. discounted price.
        const sellingRaw = row.selling_price || row.price || row.marked_price || '';
        const selling = parseFloat(sellingRaw) || 0;
        const marked = parseFloat(row.marked_price || '') || selling;
        const effective = parseFloat(row.effective_price || '') || selling;
        const productData: any = {
          name: row.name,
          category_id: categoryId,
          branch_id: branchId,
          marked_price: marked,
          effective_price: effective,
          cost_price: row.cost_price ? parseFloat(row.cost_price) : null,
          tax_rate: row.tax_rate ? parseFloat(row.tax_rate) : 0,
          barcode: row.barcode || null,
          unit: row.unit || 'piece',
          description: row.description || null,
        };

        // Look up by SKU first; if not found and a barcode is provided, fall
        // back to barcode match. This makes the import idempotent — repeated
        // runs of the same CSV merge into existing rows instead of erroring on
        // the (barcode, branch_id) unique constraint.
        let existingProduct = await prisma.product.findFirst({
          where: { sku: row.sku, branch_id: branchId }
        });
        if (!existingProduct && productData.barcode) {
          existingProduct = await prisma.product.findFirst({
            where: { barcode: productData.barcode, branch_id: branchId }
          });
        }

        let product;
        if (existingProduct) {
          product = await prisma.product.update({
            where: { id: existingProduct.id },
            data: { ...productData, sku: row.sku },
          });
          summary.products_updated++;
        } else {
          product = await prisma.product.create({
            data: { ...productData, sku: row.sku },
          });
          summary.products_created++;
        }

        const stock = Math.max(0, parseInt(row.initial_stock || '0', 10) || 0);
        const lowThreshold = Math.max(0, parseInt(row.low_stock_threshold || '10', 10) || 10);
        await prisma.inventory.upsert({
          where: { product_id: product.id },
          update: { quantity_on_hand: stock, low_stock_threshold: lowThreshold },
          create: {
            product_id: product.id,
            quantity_on_hand: stock,
            low_stock_threshold: lowThreshold,
          }
        });
      } catch (e) {
        summary.errors.push({
          row: i + 1,
          error: e instanceof Error ? e.message : 'Unknown error',
        });
      }
    }

    res.json({ status: 'success', data: summary });
  })
);

export default router;
