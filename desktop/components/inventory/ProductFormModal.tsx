'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Product, Category, Location } from '@jaypos/shared';
import type { Branch } from '@/hooks/useBranches';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';
import { numify } from '@/lib/normalize';
import { lowStockThreshold } from '@/lib/inventory';
import { apiErrorMessage } from '@/lib/errors';
import {
  useProductMutations,
  type ProductCreateInput,
  type ProductUpdateInput,
  type ProductWriteFields,
} from '@/hooks/useProductMutations';
import { useUploadProductImage } from '@/hooks/useUploadProductImage';
import { useCategoryMutations } from '@/hooks/useCategoryMutations';

const DEFAULT_TAX_RATE = '7.5';

/**
 * Create / edit a product or service. Mirrors the mobile catalog form: the
 * item-type toggle hides stock fields (unit / initial quantity / threshold) for
 * SERVICE items, which the backend also skips. On create the client sends
 * `marked_price` (Selling Price) plus `effective_price` (Discounted Price, equal
 * to marked when there's no discount); the threshold and initial quantity seed
 * the auto-created inventory row. On edit the threshold is written separately via
 * `PATCH /inventory/:id` (the product PATCH doesn't accept it) and stock quantity
 * is never touched here (that's the adjust modal).
 */
export function ProductFormModal({
  open,
  onClose,
  product,
  categories,
  locations = [],
  canChooseBranch,
  branches = [],
  defaultBranchId,
}: {
  open: boolean;
  onClose: () => void;
  /** null / undefined → create mode. */
  product?: Product | null;
  categories: Category[];
  locations?: Location[];
  /** Admin + multi-branch: show a target-branch selector on create. */
  canChooseBranch?: boolean;
  branches?: Branch[];
  defaultBranchId?: string;
}) {
  const isEdit = !!product;
  const { create, update } = useProductMutations();
  const uploadImage = useUploadProductImage();
  const categoryMutations = useCategoryMutations();

  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [barcode, setBarcode] = useState('');
  const [description, setDescription] = useState('');
  const [itemType, setItemType] = useState<'PRODUCT' | 'SERVICE'>('PRODUCT');
  const [markedPrice, setMarkedPrice] = useState('');
  const [discountedPrice, setDiscountedPrice] = useState('');
  const [costPrice, setCostPrice] = useState('');
  const [taxRate, setTaxRate] = useState(DEFAULT_TAX_RATE);
  const [unit, setUnit] = useState('piece');
  const [initialQty, setInitialQty] = useState('0');
  const [threshold, setThreshold] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [locationId, setLocationId] = useState('');
  const [branchId, setBranchId] = useState<string | undefined>(undefined);
  const [imageUrl, setImageUrl] = useState('');
  const [localCategories, setLocalCategories] = useState<Category[]>([]);
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setLocalCategories([]);
    setShowNewCategory(false);
    setNewCategoryName('');
    if (product) {
      const marked = numify(product.marked_price);
      const effective = numify(product.effective_price);
      setName(product.name ?? '');
      setSku(product.sku ?? '');
      setBarcode(product.barcode ?? '');
      setDescription(product.description ?? '');
      setItemType(product.item_type === 'SERVICE' ? 'SERVICE' : 'PRODUCT');
      setMarkedPrice(marked !== undefined ? String(marked) : '');
      // Only prefill the discount when it's actually below the tag price.
      setDiscountedPrice(
        effective !== undefined && marked !== undefined && effective < marked ? String(effective) : ''
      );
      setCostPrice(product.cost_price !== undefined ? String(product.cost_price) : '');
      setTaxRate(product.tax_rate !== undefined ? String(product.tax_rate) : DEFAULT_TAX_RATE);
      setUnit(product.unit ?? 'piece');
      setThreshold(String(lowStockThreshold(product)));
      setInitialQty('0');
      setCategoryId(product.category_id ?? '');
      setLocationId(product.location_id ?? '');
      setImageUrl(product.image_url ?? '');
      setBranchId(product.branch_id ?? undefined);
    } else {
      setName('');
      setSku('');
      setBarcode('');
      setDescription('');
      setItemType('PRODUCT');
      setMarkedPrice('');
      setDiscountedPrice('');
      setCostPrice('');
      setTaxRate(DEFAULT_TAX_RATE);
      setUnit('piece');
      setThreshold('');
      setInitialQty('0');
      setCategoryId('');
      setLocationId('');
      setImageUrl('');
      setBranchId(defaultBranchId ?? branches[0]?.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, product?.id]);

  const allCategories = useMemo(() => {
    const byId = new Map<string, Category>();
    [...categories, ...localCategories].forEach((c) => byId.set(c.id, c));
    return Array.from(byId.values());
  }, [categories, localCategories]);

  const isProduct = itemType === 'PRODUCT';
  const marked = Number(markedPrice);
  const cost = Number(costPrice);
  const margin =
    markedPrice.trim() && costPrice.trim() && marked > 0 && Number.isFinite(cost)
      ? ((marked - cost) / marked) * 100
      : null;

  const discountAboveTag =
    discountedPrice.trim() !== '' && Number(discountedPrice) > marked && marked > 0;

  const pending = create.isPending || update.isPending;
  const canSubmit =
    name.trim() !== '' &&
    sku.trim() !== '' &&
    categoryId !== '' &&
    markedPrice.trim() !== '' &&
    Number.isFinite(marked) &&
    marked > 0 &&
    !discountAboveTag &&
    !pending;

  const handleCreateCategory = () => {
    const nm = newCategoryName.trim();
    if (!nm) return;
    categoryMutations.create.mutate(
      { name: nm, branch_id: canChooseBranch ? branchId : undefined },
      {
        onSuccess: (cat) => {
          setLocalCategories((prev) => [...prev, cat]);
          setCategoryId(cat.id);
          setShowNewCategory(false);
          setNewCategoryName('');
        },
        onError: (e) => setError(apiErrorMessage(e, 'Could not create category.')),
      }
    );
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      uploadImage.mutate(reader.result as string, {
        onSuccess: (res) => setImageUrl(res.imageUrl),
        onError: (err) => setError(apiErrorMessage(err, 'Image upload failed.')),
      });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const buildFields = (): ProductWriteFields => {
    const effective = discountedPrice.trim() ? Number(discountedPrice) : marked;
    const fields: ProductWriteFields = {
      name: name.trim(),
      sku: sku.trim().toUpperCase(),
      category_id: categoryId,
      item_type: itemType,
      marked_price: marked,
      effective_price: effective,
      tax_rate: Number(taxRate) || 0,
    };
    if (costPrice.trim() && Number.isFinite(cost)) fields.cost_price = cost;
    if (barcode.trim()) fields.barcode = barcode.trim();
    if (description.trim()) fields.description = description.trim();
    if (imageUrl) fields.image_url = imageUrl;
    if (isProduct) fields.unit = unit.trim() || 'piece';
    if (locationId) fields.location_id = locationId;
    else if (isEdit) fields.location_id = null;
    return fields;
  };

  const handleSubmit = () => {
    setError(null);
    if (!canSubmit) return;
    const fields = buildFields();

    if (isEdit && product) {
      const upd: ProductUpdateInput = { id: product.id, data: fields };
      if (isProduct && threshold.trim()) {
        const t = Number(threshold);
        if (Number.isFinite(t) && t !== lowStockThreshold(product)) upd.low_stock_threshold = t;
      }
      update.mutate(upd, {
        onSuccess: () => onClose(),
        onError: (e) => setError(apiErrorMessage(e, 'Could not save the product.')),
      });
    } else {
      const input: ProductCreateInput = { ...fields };
      if (isProduct) {
        input.initial_quantity = initialQty.trim() ? Math.max(0, Number(initialQty) || 0) : 0;
        if (threshold.trim()) input.low_stock_threshold = Number(threshold);
      }
      if (canChooseBranch && branchId) input.branch_id = branchId;
      create.mutate(input, {
        onSuccess: () => onClose(),
        onError: (e) => setError(apiErrorMessage(e, 'Could not create the product.')),
      });
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Edit product' : 'New product'}
      className="max-w-2xl"
    >
      <div className="max-h-[75vh] space-y-4 overflow-y-auto px-4 py-4">
        {/* Item type */}
        <div className="inline-flex rounded-md border p-0.5">
          {(['PRODUCT', 'SERVICE'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setItemType(t)}
              className={cn(
                'rounded px-3 py-1.5 text-sm font-medium transition-colors',
                itemType === t ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'
              )}
            >
              {t === 'PRODUCT' ? 'Product' : 'Service'}
            </button>
          ))}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="pf-name">Name *</Label>
          <Input id="pf-name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="pf-sku">SKU *</Label>
            <Input
              id="pf-sku"
              value={sku}
              onChange={(e) => setSku(e.target.value.toUpperCase())}
              placeholder="e.g. SKU-001"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pf-barcode">Barcode</Label>
            <Input id="pf-barcode" value={barcode} onChange={(e) => setBarcode(e.target.value)} />
          </div>
        </div>

        {/* Category */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="pf-category">Category *</Label>
            <button
              type="button"
              className="text-xs font-medium text-primary hover:underline"
              onClick={() => setShowNewCategory((v) => !v)}
            >
              {showNewCategory ? 'Cancel' : '+ New category'}
            </button>
          </div>
          {showNewCategory ? (
            <div className="flex gap-2">
              <Input
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder="Category name"
                autoFocus
              />
              <Button
                type="button"
                onClick={handleCreateCategory}
                disabled={!newCategoryName.trim() || categoryMutations.create.isPending}
              >
                {categoryMutations.create.isPending && <Spinner className="h-4 w-4" />}
                Add
              </Button>
            </div>
          ) : (
            <select
              id="pf-category"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <option value="">Select a category…</option>
              {allCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Location */}
        <div className="space-y-1.5">
          <Label htmlFor="pf-location">Location</Label>
          <select
            id="pf-location"
            value={locationId}
            onChange={(e) => setLocationId(e.target.value)}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <option value="">No location assigned</option>
            {locations.map((loc) => (
              <option key={loc.id} value={loc.id}>
                {loc.name}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">
            Physical shop storage spot (e.g. Shelf A1, Refrigerator). Optional.
          </p>
        </div>

        {/* Prices */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="pf-marked">Selling price *</Label>
            <Input
              id="pf-marked"
              type="number"
              step="any"
              min="0"
              value={markedPrice}
              onChange={(e) => setMarkedPrice(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pf-discount">Discounted price</Label>
            <Input
              id="pf-discount"
              type="number"
              step="any"
              min="0"
              value={discountedPrice}
              onChange={(e) => setDiscountedPrice(e.target.value)}
              placeholder="Optional"
            />
            {discountAboveTag && (
              <p className="text-xs text-destructive">
                Discounted price can&apos;t exceed the selling price.
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pf-cost">Cost price</Label>
            <Input
              id="pf-cost"
              type="number"
              step="any"
              min="0"
              value={costPrice}
              onChange={(e) => setCostPrice(e.target.value)}
              placeholder="Optional"
            />
            {margin !== null && (
              <p className="text-xs text-muted-foreground">Margin: {margin.toFixed(1)}%</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pf-tax">Tax rate (%)</Label>
            <Input
              id="pf-tax"
              type="number"
              step="any"
              min="0"
              value={taxRate}
              onChange={(e) => setTaxRate(e.target.value)}
            />
          </div>
        </div>

        {/* Stock fields — PRODUCT only */}
        {isProduct && (
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="pf-unit">Unit</Label>
              <Input id="pf-unit" value={unit} onChange={(e) => setUnit(e.target.value)} />
            </div>
            {!isEdit && (
              <div className="space-y-1.5">
                <Label htmlFor="pf-qty">Initial stock</Label>
                <Input
                  id="pf-qty"
                  type="number"
                  step="any"
                  min="0"
                  value={initialQty}
                  onChange={(e) => setInitialQty(e.target.value)}
                />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="pf-threshold">Low-stock threshold</Label>
              <Input
                id="pf-threshold"
                type="number"
                step="1"
                min="0"
                value={threshold}
                onChange={(e) => setThreshold(e.target.value)}
                placeholder="10"
              />
            </div>
          </div>
        )}

        {/* Branch (admin multi-branch create only) */}
        {!isEdit && canChooseBranch && branches.length > 0 && (
          <div className="space-y-1.5">
            <Label htmlFor="pf-branch">Branch</Label>
            <select
              id="pf-branch"
              value={branchId ?? ''}
              onChange={(e) => setBranchId(e.target.value || undefined)}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="pf-description">Description</Label>
          <textarea
            id="pf-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          />
        </div>

        {/* Image */}
        <div className="space-y-1.5">
          <Label>Image</Label>
          {imageUrl ? (
            <div className="flex items-center gap-3 text-sm">
              <span className="text-emerald-700">Image attached ✓</span>
              <button
                type="button"
                className="text-xs text-destructive hover:underline"
                onClick={() => setImageUrl('')}
              >
                Remove
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <input
                type="file"
                accept="image/png,image/jpeg,image/jpg,image/webp"
                onChange={handleFile}
                disabled={uploadImage.isPending}
                className="text-sm file:mr-3 file:rounded-md file:border file:border-input file:bg-background file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-accent"
              />
              {uploadImage.isPending && <Spinner className="h-4 w-4" />}
            </div>
          )}
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {pending && <Spinner className="h-4 w-4" />}
            {isEdit ? 'Save changes' : 'Create'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
