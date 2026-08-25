'use client';

import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';

/**
 * Product search box. Typing filters the grid (via `GET /products?search=`, which
 * matches name/sku/barcode); pressing Enter is the barcode path — the page tries
 * to add an exact/only match to the cart.
 */
export function ProductSearch({
  value,
  onChange,
  onEnter,
}: {
  value: string;
  onChange: (v: string) => void;
  onEnter: () => void;
}) {
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onEnter();
        }}
        placeholder="Search products or scan a barcode…"
        className="pl-9 pr-9"
        autoFocus
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
          aria-label="Clear search"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
