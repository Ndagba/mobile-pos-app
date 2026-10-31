'use client';

import Dexie, { type Table } from 'dexie';
import type { CartLine } from '@/store/cartStore';
import type { NormalizedCustomer } from '@/lib/normalize';
import { useAuthStore } from '@/store/authStore';

/**
 * Held (parked) sales — a client-only feature (handoff §5): the cart is stashed
 * to IndexedDB per device so a cashier can start a new sale and resume the parked
 * one later. Kept in its own Dexie database, isolated from the sync-critical
 * offline store, and scoped per store_id.
 */
export interface HeldSale {
  id: string;
  store_id: string;
  label: string;
  items: CartLine[];
  discount_amount: number;
  customer: NormalizedCustomer | null;
  created_at: string;
}

class HeldSalesDexie extends Dexie {
  held!: Table<HeldSale, string>;
  constructor() {
    super('jaypos_held_sales');
    this.version(1).stores({ held: 'id, store_id, created_at' });
  }
}

let _db: HeldSalesDexie | null = null;
function db(): HeldSalesDexie {
  if (typeof window === 'undefined') throw new Error('Held sales are browser-only.');
  if (!_db) _db = new HeldSalesDexie();
  return _db;
}

function storeId(): string {
  return useAuthStore.getState().user?.store_id ?? '';
}

export async function holdSale(input: {
  items: CartLine[];
  discount_amount: number;
  customer: NormalizedCustomer | null;
  label?: string;
}): Promise<void> {
  const sale: HeldSale = {
    id: `held_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    store_id: storeId(),
    label: input.label || (input.customer?.name ?? 'Walk-in sale'),
    items: input.items,
    discount_amount: input.discount_amount,
    customer: input.customer,
    created_at: new Date().toISOString()
  };
  await db().held.put(sale);
}

export async function listHeldSales(): Promise<HeldSale[]> {
  const rows = await db().held.where('store_id').equals(storeId()).toArray();
  return rows.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
}

export async function deleteHeldSale(id: string): Promise<void> {
  await db().held.delete(id);
}
