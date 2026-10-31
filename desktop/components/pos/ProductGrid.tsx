'use client';

import type { Product } from '@jaypos/shared';
import { ProductCard } from './ProductCard';
import { Spinner } from '@/components/ui/spinner';

/** Responsive product grid with loading and empty states. */
export function ProductGrid({
  products,
  loading,
  onSelect,
}: {
  products: Product[];
  loading?: boolean;
  onSelect: (p: Product) => void;
}) {
  if (loading && products.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }

  if (products.length === 0) {
    return <p className="py-10 text-center text-sm text-text-muted">No products found.</p>;
  }

  return (
    <div
      className="grid gap-3"
      style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}
    >
      {products.map((p) => (
        <ProductCard key={p.id} product={p} onSelect={onSelect} />
      ))}
    </div>
  );
}
