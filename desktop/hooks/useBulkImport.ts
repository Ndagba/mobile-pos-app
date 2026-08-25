'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';

/**
 * Bulk product import via `POST /v1/products/bulk-import { branch_id, csv }`
 * (admin only — backend-enforced). The server parses the raw CSV text itself, so
 * there is no client-side CSV parser; we send the textarea contents verbatim.
 *
 * Required columns: `category, name, sku` and one of `selling_price | price |
 * marked_price`. Optional: `marked_price, effective_price, cost_price, tax_rate,
 * barcode, unit, description, item_type, initial_stock, low_stock_threshold`. The
 * import is idempotent (matches on sku, then barcode) — re-running merges into
 * existing rows and counts them as updated.
 *
 * A successful import creates/updates products, categories and inventory, so all
 * three query families are invalidated.
 */
export interface BulkImportError {
  row: number;
  error: string;
}

export interface BulkImportResult {
  categories_created: number;
  products_created: number;
  products_updated: number;
  errors: BulkImportError[];
}

export function useBulkImport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ branch_id, csv }: { branch_id?: string; csv: string }) =>
      apiClient.post<BulkImportResult>('/products/bulk-import', { branch_id, csv }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      queryClient.invalidateQueries({ queryKey: ['low-stock'] });
    },
  });
}
