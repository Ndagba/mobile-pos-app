import { configureStore } from '@reduxjs/toolkit';
import cartReducer, {
  addItem,
  removeItem,
  updateQuantity,
  clearCart
} from './cartSlice';

describe('cartSlice', () => {
  let store: any;

  beforeEach(() => {
    store = configureStore({
      reducer: { cart: cartReducer }
    });
  });

  it('should add item to cart', () => {
    store.dispatch(addItem({
      product_id: 'prod_1',
      product_name: 'Widget',
      quantity: 1,
      unit_price: 100,
      tax_amount: 18,
      line_total: 118
    }));
    const state = store.getState().cart;
    expect(state.items).toHaveLength(1);
    expect(state.total).toBe(118);
  });

  it('should remove item from cart', () => {
    store.dispatch(addItem({
      product_id: 'prod_1',
      product_name: 'Widget',
      quantity: 1,
      unit_price: 100,
      tax_amount: 18,
      line_total: 118
    }));
    store.dispatch(removeItem('prod_1'));
    const state = store.getState().cart;
    expect(state.items).toHaveLength(0);
    expect(state.total).toBe(0);
  });

  it('should update item quantity', () => {
    store.dispatch(addItem({
      product_id: 'prod_1',
      product_name: 'Widget',
      quantity: 1,
      unit_price: 100,
      tax_amount: 18,
      line_total: 118
    }));
    store.dispatch(updateQuantity({ product_id: 'prod_1', quantity: 3 }));
    const state = store.getState().cart;
    expect(state.items[0].quantity).toBe(3);
  });

  it('should clear cart', () => {
    store.dispatch(addItem({
      product_id: 'prod_1',
      product_name: 'Widget',
      quantity: 1,
      unit_price: 100,
      tax_amount: 18,
      line_total: 118
    }));
    store.dispatch(clearCart());
    const state = store.getState().cart;
    expect(state.items).toHaveLength(0);
    expect(state.payment_method).toBeNull();
  });
});