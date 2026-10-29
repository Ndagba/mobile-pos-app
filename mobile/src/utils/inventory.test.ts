import {
  tracksInventory,
  getAvailableStock,
  isOutOfStock,
  canAddToCart,
  canIncrementQuantity,
} from './inventory';

const product = (qty: number) => ({
  item_type: 'PRODUCT' as const,
  inventory: { quantity_on_hand: qty },
});
const service = () => ({ item_type: 'SERVICE' as const });

describe('utils/inventory', () => {
  describe('tracksInventory', () => {
    it('is true for products', () => {
      expect(tracksInventory(product(5))).toBe(true);
    });
    it('is false for services', () => {
      expect(tracksInventory(service())).toBe(false);
    });
    it('treats a missing/legacy item_type as a product (matches DatabaseService)', () => {
      expect(tracksInventory({})).toBe(true);
      expect(tracksInventory(undefined)).toBe(true);
      expect(tracksInventory(null)).toBe(true);
    });
  });

  describe('getAvailableStock', () => {
    it('reads quantity_on_hand as a number', () => {
      expect(getAvailableStock(product(7))).toBe(7);
    });
    it('coerces a decimal string quantity', () => {
      expect(getAvailableStock({ item_type: 'PRODUCT', inventory: { quantity_on_hand: '2.5' } })).toBe(2.5);
    });
    it('is 0 when there is no inventory row (e.g. a service)', () => {
      expect(getAvailableStock(service())).toBe(0);
      expect(getAvailableStock({})).toBe(0);
    });
  });

  describe('isOutOfStock', () => {
    it('is true for a stock-tracked product at 0', () => {
      expect(isOutOfStock(product(0))).toBe(true);
    });
    it('is false for a product with stock', () => {
      expect(isOutOfStock(product(1))).toBe(false);
    });
    it('is NEVER true for a service — a service does not track stock', () => {
      expect(isOutOfStock(service())).toBe(false);
    });
  });

  describe('canAddToCart', () => {
    it('blocks adding a zero-stock product', () => {
      expect(canAddToCart(product(0))).toBe(false);
    });
    it('allows adding a product with stock', () => {
      expect(canAddToCart(product(3))).toBe(true);
    });
    it('blocks adding a product already fully claimed by the cart', () => {
      expect(canAddToCart(product(2), 2)).toBe(false);
      expect(canAddToCart(product(2), 1)).toBe(true);
    });
    it('always allows adding a service, regardless of (absent) stock or cart qty', () => {
      expect(canAddToCart(service())).toBe(true);
      expect(canAddToCart(service(), 99)).toBe(true);
    });
  });

  describe('canIncrementQuantity', () => {
    it('caps a product at its available stock', () => {
      expect(canIncrementQuantity(product(3), 2)).toBe(true);
      expect(canIncrementQuantity(product(3), 3)).toBe(false);
    });
    it('lets a service increment without a ceiling (the cart-line "+" bug)', () => {
      // A service has stock 0; the old `qty >= stock` check wrongly disabled "+".
      expect(canIncrementQuantity(service(), 0)).toBe(true);
      expect(canIncrementQuantity(service(), 50)).toBe(true);
    });
  });

  it('end-to-end eligibility contract: service increments while a zero-stock product cannot be added', () => {
    const svc = service();
    const emptyProduct = product(0);
    expect(canAddToCart(emptyProduct)).toBe(false);
    expect(canIncrementQuantity(svc, 10)).toBe(true);
  });
});
