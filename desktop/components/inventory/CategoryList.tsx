'use client';

import type { ReactNode } from 'react';
import type { Category } from '@jaypos/shared';
import { Spinner } from '@/components/ui/spinner';

/**
 * The category catalog as a table: name, description, and product count
 * (`_count.products`, provided by the backend). Row actions (edit / delete) are
 * injected by the page via `renderRowActions` — category CRUD is wired in 3C.
 */
export function CategoryList({
  categories,
  loading,
  renderRowActions,
}: {
  categories: Category[];
  loading?: boolean;
  renderRowActions?: (category: Category) => ReactNode;
}) {
  if (loading && categories.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }

  if (categories.length === 0) {
    return <p className="py-10 text-center text-sm text-muted-foreground">No categories yet.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th className="px-4 py-2.5 font-medium">Name</th>
            <th className="px-4 py-2.5 font-medium">Description</th>
            <th className="px-4 py-2.5 text-right font-medium">Products</th>
            {renderRowActions && <th className="px-4 py-2.5 text-right font-medium">Actions</th>}
          </tr>
        </thead>
        <tbody>
          {categories.map((c) => (
            <tr key={c.id} className="border-b last:border-0 hover:bg-muted/30">
              <td className="px-4 py-2.5 font-medium">{c.name}</td>
              <td className="px-4 py-2.5 text-muted-foreground">{c.description || '—'}</td>
              <td className="px-4 py-2.5 text-right tabular-nums">{c._count?.products ?? 0}</td>
              {renderRowActions && (
                <td className="px-4 py-2.5 text-right">{renderRowActions(c)}</td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
