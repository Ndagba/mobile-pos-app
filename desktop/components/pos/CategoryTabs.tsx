'use client';

import { useCategories } from '@/hooks/useCategories';
import { cn } from '@/lib/utils';

/** Horizontal category filter. "All" clears the filter (undefined category id). */
export function CategoryTabs({
  selected,
  onSelect,
}: {
  selected?: string;
  onSelect: (id?: string) => void;
}) {
  const { data: categories = [] } = useCategories();

  const tab = (label: string, id: string | undefined, key: string) => (
    <button
      key={key}
      type="button"
      onClick={() => onSelect(id)}
      className={cn(
        'whitespace-nowrap rounded-full border px-3 py-1.5 text-sm transition-colors',
        selected === id
          ? 'border-primary bg-primary/10 text-primary'
          : 'border-input text-muted-foreground hover:bg-accent hover:text-accent-foreground'
      )}
    >
      {label}
    </button>
  );

  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {tab('All', undefined, '__all')}
      {categories.map((c) => tab(c.name, c.id, c.id))}
    </div>
  );
}
