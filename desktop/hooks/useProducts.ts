'use client';

import { useQuery } from '@tanstack/react-query';
import type { Product } from '@jaypos/shared';
import { apiClient } from '@/lib/apiClient';
import { offlineStore } from '@/lib/db';
import { network } from '@/lib/network';
import { normalizeProduct } from '@/lib/normalize';

export interface UseProductsOptions {
  search?: string;
  categoryId?: string;
  /** Admin branch filter. Omitted → server scopes to the JWT's authorized branches. */
  branchId?: string;
  /** Row cap (default 200 for the POS grid; the inventory catalog passes 500). */
  limit?: number;
}

/**
 * Products for the POS grid / search / barcode lookup and the inventory catalog.
 *
 * `GET /v1/products?search=&category_id=&branch_id=&limit=` — `search` matches
 * name/sku/barcode (the barcode path; `/products/search` is dead). Branch scoping
 * is enforced server-side from the JWT; an admin may additionally narrow to one
 * `branch_id`. Services are included (the catalog filters them by tab). Decimal
 * strings are normalised to numbers.
 *
 * Network-first with a Dexie fallback: online results are cached (upsert, so the
 * offline catalogue only grows) and, when offline or on request failure, served
 * from Dexie so the POS keeps selling.
 */
async function fetchProducts({ search, categoryId, branchId, limit }: UseProductsOptions): Promise<Product[]> {
  console.log('[useProducts] Fetching products...', { search, categoryId, branchId, limit });
  const params = new URLSearchParams();
  if (search) params.set('search', search);
  if (categoryId) params.set('category_id', categoryId);
  if (branchId) params.set('branch_id', branchId);
  params.set('limit', String(limit ?? 200));
  const qs = params.toString();


  if (network.isOnline()) {
    try {
      const rows = await apiClient.get<Record<string, any>[]>(`/products?${qs}`);
      const products = (rows ?? []).map(normalizeProduct);
      // bulkPut upsert — enriches the offline catalogue without dropping others.
      await offlineStore.saveProducts(products);
      return products;
    } catch {
      /* fall through to the offline cache */
    }
  }

  let cached = search
    ? await offlineStore.searchProducts(search)
    : await offlineStore.getProducts();
  if (categoryId) cached = cached.filter((p) => p.category_id === categoryId);
  if (branchId) cached = cached.filter((p) => p.branch_id === branchId);
  return cached;
}

export function useProducts(opts: UseProductsOptions = {}) {
  return useQuery({
    queryKey: [
      'products',
      opts.search ?? '',
      opts.categoryId ?? '',
      opts.branchId ?? '',
      opts.limit ?? 200,
    ],
    // Run the queryFn even when offline so its Dexie fallback can serve the cached
    // catalogue. The default 'online' networkMode pauses fetches while the browser
    // is offline, which is what left the POS grid empty. Connectivity is decided
    // inside fetchProducts via network.isOnline(); on reconnect the default
    // refetchOnReconnect refreshes and re-caches. `online` is intentionally NOT in
    // the queryKey so a mid-session drop keeps the last-known catalogue on screen.
    networkMode: 'always',
    queryFn: () => fetchProducts(opts),
  });
}
