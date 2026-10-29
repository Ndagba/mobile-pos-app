'use client';

import { cn } from '@/lib/utils';

export type InventoryTab = 'all' | 'products' | 'services' | 'categories' | 'locations' | 'low-stock';

export const INVENTORY_TABS: { key: InventoryTab; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'products', label: 'Products' },
  { key: 'services', label: 'Services' },
  { key: 'categories', label: 'Categories' },
  { key: 'locations', label: 'Location' },
  { key: 'low-stock', label: 'Low Stock' },
];

/** Segmented tab bar for the inventory catalog, each tab showing a live count. */
export function InventoryTabs({
  active,
  onChange,
  counts,
}: {
  active: InventoryTab;
  onChange: (tab: InventoryTab) => void;
  counts: Record<InventoryTab, number>;
}) {
  return (
    <div className="flex flex-wrap gap-1 border-b">
      {INVENTORY_TABS.map(({ key, label }) => {
        const isActive = key === active;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            className={cn(
              '-mb-px flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium transition-colors',
              isActive
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            {label}
            <span
              className={cn(
                'rounded-full px-1.5 py-0.5 text-xs tabular-nums',
                isActive ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
              )}
            >
              {counts[key]}
            </span>
          </button>
        );
      })}
    </div>
  );
}
