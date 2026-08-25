'use client';

import { useMemo } from 'react';
import { create } from 'zustand';
import type { CartItem, CartTotals, PaymentMethod, Product } from '@jaypos/shared';
import {
  calculateCartTotals,
  canAddToCart,
  canIncrementQuantity,
  getAvailableStock,
  tracksInventory,
} from '@jaypos/shared';
import type { NormalizedCustomer } from '@/lib/normalize';

/**
 * A cart line. Extends the shared `CartItem` (the exact shape
 * `buildTransactionInput` consumes) with an `inventory` snapshot captured at
 * add-time, so the cart can gate quantity increments against stock without
 * re-fetching the product. `buildTransactionInput` ignores the extra field.
 */
export interface CartLine extends CartItem {
  inventory?: { quantity_on_hand?: number | string | null } | null;
}

interface CartStore {
  items: CartLine[];
  discount_amount: number;
  customer: NormalizedCustomer | null;
  payment_method: PaymentMethod | null;

  /** Add one unit of a product, or increment an existing line (stock-gated). */
  addItem: (product: Product) => void;
  /** Set an absolute quantity; ≤0 removes the line; clamped to available stock. */
  updateQuantity: (productId: string, quantity: number) => void;
  removeItem: (productId: string) => void;
  setDiscount: (amount: number) => void;
  setCustomer: (customer: NormalizedCustomer | null) => void;
  setPaymentMethod: (method: PaymentMethod | null) => void;
  clear: () => void;
}

/**
 * Cart state, mirroring mobile's `cartSlice` (mobile/src/redux/slices/cartSlice.ts).
 *
 * Totals are NOT stored here (mobile keeps them on state, but that risks staleness
 * and there is no consumer for a persisted copy) — read them via `useCartTotals`,
 * which recomputes with the exact shared `calculateCartTotals` arithmetic the
 * backend trusts. Stock gating uses the shared inventory helpers so a SERVICE has
 * no ceiling and a physical product can never exceed on-hand quantity.
 */
export const useCartStore = create<CartStore>((set, get) => ({
  items: [],
  discount_amount: 0,
  customer: null,
  payment_method: null,

  addItem: (product) => {
    const { items } = get();
    const existing = items.find((i) => i.product_id === product.id);

    if (existing) {
      if (!canIncrementQuantity(existing, existing.quantity)) return; // at stock ceiling
      set({
        items: items.map((i) =>
          i.product_id === product.id ? { ...i, quantity: i.quantity + 1 } : i
        ),
      });
      return;
    }

    if (!canAddToCart(product, 0)) return; // out of stock
    const line: CartLine = {
      product_id: product.id,
      product_name: product.name,
      quantity: 1,
      unit_price: product.effective_price ?? product.unit_price ?? 0,
      tax_rate: product.tax_rate ?? 0,
      item_type: product.item_type ?? 'PRODUCT',
      inventory: product.inventory ?? null,
    };
    set({ items: [...items, line] });
  },

  updateQuantity: (productId, quantity) => {
    if (quantity <= 0) {
      set({ items: get().items.filter((i) => i.product_id !== productId) });
      return;
    }
    set({
      items: get().items.map((i) => {
        if (i.product_id !== productId) return i;
        const ceiling = tracksInventory(i) ? getAvailableStock(i) : Infinity;
        return { ...i, quantity: Math.min(quantity, Math.max(1, ceiling)) };
      }),
    });
  },

  removeItem: (productId) =>
    set({ items: get().items.filter((i) => i.product_id !== productId) }),

  setDiscount: (amount) => set({ discount_amount: Number.isFinite(amount) ? amount : 0 }),

  setCustomer: (customer) => set({ customer }),

  setPaymentMethod: (method) => set({ payment_method: method }),

  clear: () =>
    set({ items: [], discount_amount: 0, customer: null, payment_method: null }),
}));

/** Live cart totals — recomputed from items + discount with the shared arithmetic. */
export function useCartTotals(): CartTotals {
  const items = useCartStore((s) => s.items);
  const discount = useCartStore((s) => s.discount_amount);
  return useMemo(() => calculateCartTotals(items, discount), [items, discount]);
}
