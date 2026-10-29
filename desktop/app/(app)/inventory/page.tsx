'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { Product, Category, Location } from '@jaypos/shared';
import { useProducts } from '@/hooks/useProducts';
import { useCategories } from '@/hooks/useCategories';
import { useLocations } from '@/hooks/useLocations';
import { useBranches } from '@/hooks/useBranches';
import { useLowStock } from '@/hooks/useLowStock';
import { useAdjustStock } from '@/hooks/useAdjustStock';
import { useProductMutations } from '@/hooks/useProductMutations';
import { useCategoryMutations } from '@/hooks/useCategoryMutations';
import { useLocationMutations } from '@/hooks/useLocationMutations';
import { useAuthStore } from '@/store/authStore';
import { isAdmin } from '@/lib/roles';
import { apiErrorMessage } from '@/lib/errors';
import { Input } from '@/components/ui/input';
import { Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { InventoryTabs, type InventoryTab } from '@/components/inventory/InventoryTabs';
import { BranchFilter } from '@/components/inventory/BranchFilter';
import { ProductTable } from '@/components/inventory/ProductTable';
import { CategoryList } from '@/components/inventory/CategoryList';
import { LocationList } from '@/components/inventory/LocationList';
import { LowStockList } from '@/components/inventory/LowStockList';
import { StockAdjustModal } from '@/components/inventory/StockAdjustModal';
import { MovementLedgerModal } from '@/components/inventory/MovementLedgerModal';
import { ProductFormModal } from '@/components/inventory/ProductFormModal';
import { CategoryFormModal } from '@/components/inventory/CategoryFormModal';
import { LocationFormModal } from '@/components/inventory/LocationFormModal';

/**
 * Inventory catalog (admin + manager; the section layout gates cashiers out).
 *
 * Product-centric, mirroring mobile: one `GET /products` load (branch- and
 * category-scoped server-side) drives the All / Products / Services tabs, with
 * search applied client-side over the loaded set. Categories, Locations and Low-Stock have
 * their own scoped queries. Rows expose adjust/ledger/edit/delete; creation and
 * category/location management hang off the header. Delete is admin-only in the UI (the
 * backend enforces it too).
 */
export default function InventoryPage() {
  const user = useAuthStore((s) => s.user);
  const admin = isAdmin(user);

  const [tab, setTab] = useState<InventoryTab>('all');
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState<string | undefined>(undefined);
  const [branchId, setBranchId] = useState<string | undefined>(undefined);

  // Modal targets. `open` booleans pair with a target (null → create mode).
  const [adjustProduct, setAdjustProduct] = useState<Product | null>(null);
  const [ledgerProduct, setLedgerProduct] = useState<Product | null>(null);
  const [productFormOpen, setProductFormOpen] = useState(false);
  const [productFormTarget, setProductFormTarget] = useState<Product | null>(null);
  const [deleteProduct, setDeleteProduct] = useState<Product | null>(null);
  const [categoryFormOpen, setCategoryFormOpen] = useState(false);
  const [categoryFormTarget, setCategoryFormTarget] = useState<Category | null>(null);
  const [deleteCategory, setDeleteCategory] = useState<Category | null>(null);
  const [locationFormOpen, setLocationFormOpen] = useState(false);
  const [locationFormTarget, setLocationFormTarget] = useState<Location | null>(null);
  const [deleteLocation, setDeleteLocation] = useState<Location | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const branchesQ = useBranches();
  const productsQ = useProducts({ categoryId, branchId, limit: 500 });
  const categoriesQ = useCategories({ branchId });
  const locationsQ = useLocations({ branchId });
  const lowStockQ = useLowStock({ branchId });
  const quickRestock = useAdjustStock();
  const productMut = useProductMutations();
  const categoryMut = useCategoryMutations();
  const locationMut = useLocationMutations();

  const branches = useMemo(() => branchesQ.data ?? [], [branchesQ.data]);
  const products = useMemo(() => productsQ.data ?? [], [productsQ.data]);
  const categories = useMemo(() => categoriesQ.data ?? [], [categoriesQ.data]);
  const locations = useMemo(() => locationsQ.data ?? [], [locationsQ.data]);
  const lowStock = useMemo(() => lowStockQ.data ?? [], [lowStockQ.data]);

  const isProductTab = tab === 'all' || tab === 'products' || tab === 'services';
  const multiBranch = branches.length > 1;
  const canChooseBranch = admin && multiBranch;

  const counts: Record<InventoryTab, number> = {
    all: products.length,
    products: products.filter((p) => p.item_type !== 'SERVICE').length,
    services: products.filter((p) => p.item_type === 'SERVICE').length,
    categories: categories.length,
    locations: locations.length,
    'low-stock': lowStock.length,
  };

  const q = search.trim().toLowerCase();
  const visibleProducts = useMemo(() => {
    let list = products;
    if (tab === 'products') list = list.filter((p) => p.item_type !== 'SERVICE');
    else if (tab === 'services') list = list.filter((p) => p.item_type === 'SERVICE');
    if (q) {
      list = list.filter(
        (p) =>
          p.name?.toLowerCase().includes(q) ||
          p.sku?.toLowerCase().includes(q) ||
          p.barcode?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [products, tab, q]);

  const branchName = (id?: string | null) => branches.find((b) => b.id === id)?.name;

  const openCreateProduct = () => {
    setProductFormTarget(null);
    setProductFormOpen(true);
  };
  const openEditProduct = (p: Product) => {
    setProductFormTarget(p);
    setProductFormOpen(true);
  };
  const openCreateCategory = () => {
    setCategoryFormTarget(null);
    setCategoryFormOpen(true);
  };
  const openEditCategory = (c: Category) => {
    setCategoryFormTarget(c);
    setCategoryFormOpen(true);
  };
  const openCreateLocation = () => {
    setLocationFormTarget(null);
    setLocationFormOpen(true);
  };
  const openEditLocation = (loc: Location) => {
    setLocationFormTarget(loc);
    setLocationFormOpen(true);
  };

  const confirmDeleteProduct = () => {
    if (!deleteProduct) return;
    setDeleteError(null);
    productMut.remove.mutate(deleteProduct.id, {
      onSuccess: () => setDeleteProduct(null),
      onError: (e) => setDeleteError(apiErrorMessage(e, 'Could not delete the product.')),
    });
  };
  const confirmDeleteCategory = () => {
    if (!deleteCategory) return;
    setDeleteError(null);
    categoryMut.remove.mutate(deleteCategory.id, {
      onSuccess: () => setDeleteCategory(null),
      onError: (e) => setDeleteError(apiErrorMessage(e, 'Could not delete the category.')),
    });
  };
  const confirmDeleteLocation = () => {
    if (!deleteLocation) return;
    setDeleteError(null);
    locationMut.remove.mutate(deleteLocation.id, {
      onSuccess: () => setDeleteLocation(null),
      onError: (e) => setDeleteError(apiErrorMessage(e, 'Could not delete the location.')),
    });
  };

  return (
    <div className="flex h-full flex-col gap-4">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Inventory</h1>
          <p className="text-sm text-muted-foreground">Manage products, stock and categories.</p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Link href="/inventory/turnover" className={cn(buttonVariants({ variant: 'outline' }))}>
            Turnover
          </Link>
          <Link href="/inventory/expiring" className={cn(buttonVariants({ variant: 'outline' }))}>
            Expiring
          </Link>
          {admin && (
            <Link href="/inventory/import" className={cn(buttonVariants({ variant: 'outline' }))}>
              Import
            </Link>
          )}
          {admin && (
            <Link href="/inventory/counts" className={cn(buttonVariants({ variant: 'outline' }))}>
              Stock counts
            </Link>
          )}
          {tab === 'categories' ? (
            <Button onClick={openCreateCategory}>New category</Button>
          ) : tab === 'locations' ? (
            <Button onClick={openCreateLocation}>New location</Button>
          ) : (
            <Button onClick={openCreateProduct}>New product</Button>
          )}
        </div>
      </header>

      {multiBranch && (
        <BranchFilter branches={branches} selected={branchId} onSelect={setBranchId} />
      )}

      <InventoryTabs active={tab} onChange={setTab} counts={counts} />

      {isProductTab && (
        <div className="flex flex-wrap items-center gap-3">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, SKU or barcode"
            className="max-w-xs"
          />
          <select
            value={categoryId ?? ''}
            onChange={(e) => setCategoryId(e.target.value || undefined)}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-auto">
        {isProductTab && (
          <ProductTable
            products={visibleProducts}
            loading={productsQ.isLoading}
            showBranch={multiBranch && !branchId}
            branchName={branchName}
            renderRowActions={(p) => (
              <div className="flex justify-end gap-1.5">
                {p.item_type !== 'SERVICE' && (
                  <>
                    <Button size="sm" variant="outline" onClick={() => setAdjustProduct(p)}>
                      Adjust
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setLedgerProduct(p)}>
                      Ledger
                    </Button>
                  </>
                )}
                <Button size="sm" variant="ghost" onClick={() => openEditProduct(p)}>
                  Edit
                </Button>
                {admin && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    onClick={() => {
                      setDeleteError(null);
                      setDeleteProduct(p);
                    }}
                  >
                    Delete
                  </Button>
                )}
              </div>
            )}
          />
        )}
        {tab === 'categories' && (
          <CategoryList
            categories={categories}
            loading={categoriesQ.isLoading}
            renderRowActions={(c) => (
              <div className="flex justify-end gap-1.5">
                <Button size="sm" variant="ghost" onClick={() => openEditCategory(c)}>
                  Edit
                </Button>
                {admin && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    onClick={() => {
                      setDeleteError(null);
                      setDeleteCategory(c);
                    }}
                  >
                    Delete
                  </Button>
                )}
              </div>
            )}
          />
        )}
        {tab === 'locations' && (
          <LocationList
            locations={locations}
            loading={locationsQ.isLoading}
            renderRowActions={(loc) => (
              <div className="flex justify-end gap-1.5">
                <Button size="sm" variant="ghost" onClick={() => openEditLocation(loc)}>
                  Edit
                </Button>
                {admin && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    onClick={() => {
                      setDeleteError(null);
                      setDeleteLocation(loc);
                    }}
                  >
                    Delete
                  </Button>
                )}
              </div>
            )}
          />
        )}
        {tab === 'low-stock' && (
          <LowStockList
            items={lowStock}
            loading={lowStockQ.isLoading}
            renderItemActions={(it) => {
              const pending =
                quickRestock.isPending && quickRestock.variables?.productId === it.product_id;
              return (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={quickRestock.isPending}
                  onClick={() =>
                    quickRestock.mutate({
                      productId: it.product_id,
                      quantity: 10,
                      reason: 'restock',
                    })
                  }
                >
                  {pending ? 'Adding…' : '+10'}
                </Button>
              );
            }}
          />
        )}
      </div>

      <StockAdjustModal
        product={adjustProduct}
        open={adjustProduct !== null}
        onClose={() => setAdjustProduct(null)}
      />
      <MovementLedgerModal
        product={ledgerProduct}
        open={ledgerProduct !== null}
        onClose={() => setLedgerProduct(null)}
      />
      <ProductFormModal
        open={productFormOpen}
        onClose={() => setProductFormOpen(false)}
        product={productFormTarget}
        categories={categories}
        locations={locations}
        canChooseBranch={canChooseBranch}
        branches={branches}
        defaultBranchId={branchId}
      />
      <CategoryFormModal
        open={categoryFormOpen}
        onClose={() => setCategoryFormOpen(false)}
        category={categoryFormTarget}
        canChooseBranch={canChooseBranch}
        branches={branches}
        defaultBranchId={branchId}
      />
      <LocationFormModal
        open={locationFormOpen}
        onClose={() => setLocationFormOpen(false)}
        location={locationFormTarget}
        canChooseBranch={canChooseBranch}
        branches={branches}
        defaultBranchId={branchId}
      />
      <ConfirmDialog
        open={deleteProduct !== null}
        onClose={() => setDeleteProduct(null)}
        onConfirm={confirmDeleteProduct}
        title="Delete product"
        message={
          <>
            Delete <span className="font-medium text-foreground">{deleteProduct?.name}</span>? This
            deactivates it — past sales are unaffected.
          </>
        }
        pending={productMut.remove.isPending}
        error={deleteError}
      />
      <ConfirmDialog
        open={deleteCategory !== null}
        onClose={() => setDeleteCategory(null)}
        onConfirm={confirmDeleteCategory}
        title="Delete category"
        message={
          <>
            Delete <span className="font-medium text-foreground">{deleteCategory?.name}</span>?
            Products keep their data but lose this category.
          </>
        }
        pending={categoryMut.remove.isPending}
        error={deleteError}
      />
      <ConfirmDialog
        open={deleteLocation !== null}
        onClose={() => setDeleteLocation(null)}
        onConfirm={confirmDeleteLocation}
        title="Delete location"
        message={
          <>
            Delete <span className="font-medium text-foreground">{deleteLocation?.name}</span>?
            {deleteLocation?._count?.products ? (
              <p className="mt-2 text-destructive font-medium">
                This location is currently assigned to {deleteLocation._count.products} product(s).
                Please reassign these products before deleting the location.
              </p>
            ) : (
              ' Are you sure you want to delete this location?'
            )}
          </>
        }
        pending={locationMut.remove.isPending}
        error={deleteError}
      />
    </div>
  );
}
