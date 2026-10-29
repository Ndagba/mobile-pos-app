'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Product } from '@jaypos/shared';
import { apiClient } from '@/lib/apiClient';

/**
 * Product create / update / delete against `/v1/products*` (admin + manager;
 * delete is admin-only — the backend enforces both).
 *
 * The catalog is product-centric, so a write can shift stock status, low-stock
 * alerts and category counts — every mutation invalidates those query prefixes.
 * Stock **quantity** is never set here (that's the adjust modal / create's
 * `initial_quantity`); the only inventory write on update is the low-stock
 * threshold, which `PATCH /products/:id` doesn't accept, so it goes to
 * `PATCH /inventory/:id` as a second call.
 */
export interface ProductWriteFields {
  name: string;
  sku: string;
  category_id: string;
  item_type: 'PRODUCT' | 'SERVICE';
  /** Tag / "Selling Price". */
  marked_price: number;
  /** "Discounted Price" — equals marked_price when there's no discount. */
  effective_price: number;
  cost_price?: number;
  tax_rate: number;
  barcode?: string;
  description?: string;
  image_url?: string;
  unit?: string;
  location_id?: string | null;
}

export interface ProductCreateInput extends ProductWriteFields {
  /** PRODUCT + create only — seeds the auto-created inventory row. */
  initial_quantity?: number;
  low_stock_threshold?: number;
  /** Admin multi-branch create — the backend lets an admin's branch_id win. */
  branch_id?: string;
}

export interface ProductUpdateInput {
  id: string;
  data: Partial<ProductWriteFields>;
  /** When set (PRODUCT only), also `PATCH /inventory/:id` to change the threshold. */
  low_stock_threshold?: number;
}

export function useProductMutations() {
  const queryClient = useQueryClient();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['products'] });
    queryClient.invalidateQueries({ queryKey: ['low-stock'] });
    queryClient.invalidateQueries({ queryKey: ['categories'] });
    queryClient.invalidateQueries({ queryKey: ['locations'] });
  };

  const create = useMutation({
    mutationFn: (input: ProductCreateInput) => apiClient.post<Product>('/products', input),
    onSuccess: invalidate,
  });

  const update = useMutation({
    mutationFn: async ({ id, data, low_stock_threshold }: ProductUpdateInput) => {
      const product = await apiClient.patch<Product>(`/products/${id}`, data);
      if (low_stock_threshold !== undefined) {
        await apiClient.patch(`/inventory/${id}`, { low_stock_threshold });
      }
      return product;
    },
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/products/${id}`),
    onSuccess: invalidate,
  });

  return { create, update, remove };
}
