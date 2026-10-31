'use client';

import { useRef } from 'react';
import { ScanBarcode, X } from 'lucide-react';
import { useShortcut } from '@/hooks/useShortcuts';

/**
 * POS product search (handoff §4.3): 44px bar, `/` focuses it, Enter is the
 * barcode path (the page adds the exact/only match). Typing filters the grid.
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
  const ref = useRef<HTMLInputElement>(null);
  useShortcut('focus-search', () => ref.current?.focus());

  return (
    <div className="relative">
      <ScanBarcode className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-text-muted" />
      <input
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onEnter();
        }}
        placeholder="Scan a barcode or search by name / SKU — Enter adds the top match"
        className="h-11 w-full rounded-lg border border-border-strong bg-surface pl-11 pr-10 text-sm text-ink-2 transition-colors placeholder:text-text-faint focus-visible:outline-none"
        autoFocus
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-text-muted hover:text-ink"
          aria-label="Clear search"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
