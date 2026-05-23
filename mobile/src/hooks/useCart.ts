import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '../redux/store';
import * as cartActions from '../redux/slices/cartSlice';

export function useCart() {
  const dispatch = useDispatch();
  const cart = useSelector((state: RootState) => state.cart);

  return {
    items: cart.items,
    subtotal: cart.subtotal,
    taxAmount: cart.tax_amount,
    discountAmount: cart.discount_amount,
    total: cart.total,
    paymentMethod: cart.payment_method,
    
    addItem: (item: any) => dispatch(cartActions.addItem(item)),
    removeItem: (productId: string) => dispatch(cartActions.removeItem(productId)),
    updateQuantity: (productId: string, quantity: number) =>
      dispatch(cartActions.updateQuantity({ product_id: productId, quantity })),
    setPaymentMethod: (method: 'cash' | 'card' | 'mobile_wallet') =>
      dispatch(cartActions.setPaymentMethod(method)),
    clear: () => dispatch(cartActions.clearCart())
  };
}
