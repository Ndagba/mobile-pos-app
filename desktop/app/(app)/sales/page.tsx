'use client';

import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Camera } from 'lucide-react';
import { toast } from 'sonner';
import { isOutOfStock } from '@jaypos/shared';
import { useProducts } from '@/hooks/useProducts';
import { useCartStore } from '@/store/cartStore';
import { useBranchStore } from '@/store/branchStore';
import { ProductSearch } from '@/components/pos/ProductSearch';
import { ScanModal } from '@/components/pos/ScanModal';
import { CategoryTabs } from '@/components/pos/CategoryTabs';
import { ProductGrid } from '@/components/pos/ProductGrid';
import { CartPanel } from '@/components/pos/CartPanel';
import { Button } from '@/components/ui/button';
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
  const [scanOpen, setScanOpen] = useState(false);
  const [categoryId, setCategoryId] = useState<string | undefined>(undefined);
  const selectedBranchId = useBranchStore((s) => s.selectedBranchId);
  const productsQ = useProducts({ categoryId, branchId: selectedBranchId ?? undefined });
  const addItem = useCartStore((s) => s.addItem);
  const queryClient = useQueryClient();

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

  // A code read from the camera is matched exactly like a wedge-scanner/Enter
  // scan: exact barcode or SKU wins. No match → drop it into the search box so
  // the cashier sees it and can pick manually.
  const handleScanned = (code: string) => {
    const raw = code.trim();
    const exact = all.find((p) => p.barcode === raw || p.sku === raw);
    if (exact && !isOutOfStock(exact)) {
      addItem(exact);
      toast.success(`Added ${exact.name}`);
    } else if (exact && isOutOfStock(exact)) {
      toast.error(`${exact.name} is out of stock`);
    } else {
      setSearch(raw);
      toast.error('No product matches that barcode');
    }
    setScanOpen(false);
  };

  const handleSaleCompleted = async () => {
    // Refresh pending sync count
    await useSyncStore.getState().refreshPendingCount();
    // Force immediate refetch of product list to update stock counts
    await queryClient.refetchQueries({ queryKey: ['products'] });
  };

  return (
    <div className="-mx-7 -my-6 flex h-[calc(100vh-60px)]">
      <section className="flex min-w-0 flex-1 flex-col gap-3 overflow-hidden px-6 py-5">
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <ProductSearch value={search} onChange={setSearch} onEnter={handleBarcodeEnter} />
          </div>
          <Button
            type="button"
            variant="outline"
            className="h-11 shrink-0 gap-2"
            onClick={() => setScanOpen(true)}
          >
            <Camera className="h-4 w-4" /> Scan
          </Button>
        </div>
        <CategoryTabs selected={categoryId} onSelect={setCategoryId} />
        <div className="min-h-0 flex-1 overflow-auto pr-1">
          <ProductGrid products={products} loading={productsQ.isLoading} onSelect={addItem} />
        </div>
      </section>
      <aside className="flex w-[400px] shrink-0">
        <CartPanel onCompleted={handleSaleCompleted} />
      </aside>

      <ScanModal open={scanOpen} onClose={() => setScanOpen(false)} onScan={handleScanned} />
    </div>
  );
}
