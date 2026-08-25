'use client';

import { useMemo, useState } from 'react';
import { isOutOfStock } from '@jaypos/shared';
import { useProducts } from '@/hooks/useProducts';
import { useCartStore } from '@/store/cartStore';
import { ProductSearch } from '@/components/pos/ProductSearch';
import { CategoryTabs } from '@/components/pos/CategoryTabs';
import { ProductGrid } from '@/components/pos/ProductGrid';
import { CartPanel } from '@/components/pos/CartPanel';
import { Checkout } from '@/components/pos/Checkout';
import { useSyncStore } from '@/store/syncStore';

/**
 * Point of sale.
 *
 * The category's catalogue is loaded once and filtered client-side by the search
 * box — instant, and it makes the barcode path (Enter) reliable because it matches
 * against the full loaded set rather than a debounced server round-trip. This also
 * mirrors mobile, which filters a loaded product list. The server `search` param
 * is still used by the hook for the offline (Dexie) fallback.
 */
export default function SalesPage() {
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState<string | undefined>(undefined);
  const productsQ = useProducts({ categoryId });
  const addItem = useCartStore((s) => s.addItem);

  const all = useMemo(() => productsQ.data ?? [], [productsQ.data]);
  const q = search.trim().toLowerCase();
  const products = useMemo(() => {
    if (!q) return all;
    return all.filter(
      (p) =>
        p.name?.toLowerCase().includes(q) ||
        p.sku?.toLowerCase().includes(q) ||
        p.barcode?.toLowerCase().includes(q)
    );
  }, [all, q]);

  const handleBarcodeEnter = () => {
    const raw = search.trim();
    if (!raw) return;
    const exact = all.find((p) => p.barcode === raw || p.sku === raw);
    const target = exact ?? (products.length === 1 ? products[0] : undefined);
    if (target && !isOutOfStock(target)) {
      addItem(target);
      setSearch('');
    }
  };

  return (
    <div className="flex h-full gap-6">
      <section className="flex min-w-0 flex-1 flex-col gap-4">
        <ProductSearch value={search} onChange={setSearch} onEnter={handleBarcodeEnter} />
        <CategoryTabs selected={categoryId} onSelect={setCategoryId} />
        <div className="min-h-0 flex-1 overflow-auto">
          <ProductGrid products={products} loading={productsQ.isLoading} onSelect={addItem} />
        </div>
      </section>
      <aside className="flex w-[360px] shrink-0 xl:w-[400px]">
        <CartPanel>
          <Checkout onCompleted={() => void useSyncStore.getState().refreshPendingCount()} />
        </CartPanel>
      </aside>
    </div>
  );
}
