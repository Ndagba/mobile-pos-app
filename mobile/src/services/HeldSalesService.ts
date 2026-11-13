import AsyncStorage from '@react-native-async-storage/async-storage';
import type { CartItem } from '../redux/slices/cartSlice';
import type { Customer } from '../redux/slices/customersSlice';

/**
 * Held (parked) sales — mobile mirror of desktop `lib/heldSales.ts`.
 *
 * Desktop parks a cart to its own Dexie database; React Native has no Dexie, so
 * this backs the same feature with AsyncStorage, scoped per store under the key
 * `{store_id}_held_sales` (matching DatabaseService's store-key convention). A
 * cashier can stash the current sale, start a new one, and resume or discard the
 * parked sale later. This is a device-local convenience — it is never synced.
 */

export interface HeldSale {
  id: string;
  store_id: string;
  label: string;
  items: CartItem[];
  discount_amount: number;
  customer: Customer | null;
  created_at: string;
}

const BASE_KEY = 'held_sales';

function getStoreId(): string | null {
  try {
    const { store } = require('../redux/store');
    return store.getState().auth.user?.store_id || null;
  } catch {
    return null;
  }
}

function storeKey(): string {
  const sid = getStoreId();
  return sid ? `${sid}_${BASE_KEY}` : BASE_KEY;
}

async function readAll(): Promise<HeldSale[]> {
  try {
    const raw = await AsyncStorage.getItem(storeKey());
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

async function writeAll(list: HeldSale[]): Promise<void> {
  await AsyncStorage.setItem(storeKey(), JSON.stringify(list));
}

export async function holdSale(input: {
  items: CartItem[];
  discount_amount: number;
  customer: Customer | null;
  label?: string;
}): Promise<void> {
  const sid = getStoreId() ?? '';
  const sale: HeldSale = {
    id: `held_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    store_id: sid,
    label:
      input.label ||
      (input.customer ? `${input.customer.first_name} ${input.customer.last_name}`.trim() : 'Walk-in sale'),
    items: input.items,
    discount_amount: input.discount_amount,
    customer: input.customer,
    created_at: new Date().toISOString(),
  };
  const list = await readAll();
  list.push(sale);
  await writeAll(list);
}

/** Newest first. */
export async function listHeldSales(): Promise<HeldSale[]> {
  const list = await readAll();
  return list.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
}

export async function deleteHeldSale(id: string): Promise<void> {
  const list = await readAll();
  await writeAll(list.filter((h) => h.id !== id));
}
