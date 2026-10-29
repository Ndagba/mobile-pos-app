'use client';

import type { ReactNode } from 'react';
import type { Location } from '@jaypos/shared';
import { Spinner } from '@/components/ui/spinner';

/**
 * Physical locations catalog table: name, description, product count
 * (`_count.products` provided by backend). Row actions (edit / delete)
 * injected by page via `renderRowActions`.
 */
export function LocationList({
  locations,
  loading,
  renderRowActions,
}: {
  locations: Location[];
  loading?: boolean;
  renderRowActions?: (location: Location) => ReactNode;
}) {
  if (loading && locations.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }

  if (locations.length === 0) {
    return <p className="py-10 text-center text-sm text-muted-foreground">No locations yet.</p>;
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
          {locations.map((loc) => (
            <tr key={loc.id} className="border-b last:border-0 hover:bg-muted/30">
              <td className="px-4 py-2.5 font-medium">{loc.name}</td>
              <td className="px-4 py-2.5 text-muted-foreground">{loc.description || '—'}</td>
              <td className="px-4 py-2.5 text-right tabular-nums">{loc._count?.products ?? 0}</td>
              {renderRowActions && (
                <td className="px-4 py-2.5 text-right">{renderRowActions(loc)}</td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
