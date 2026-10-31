'use client';

import { Segmented } from '@/components/ui/segmented';

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
    <Segmented
      className="flex-wrap"
      value={active}
      onChange={onChange}
      options={INVENTORY_TABS.map((t) => ({ value: t.key, label: t.label, count: counts[t.key] }))}
    />
  );
}
