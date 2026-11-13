import { alertCount, buildAlerts } from './alerts';

const low = (id: string, name: string, q: number) => ({
  product_id: id, product_name: name, current_quantity: q, low_stock_threshold: 10, reorder_point: null,
});
const batch = (id: string, name: string, days: number, batch_number?: string) => ({
  batch_id: id, product_name: name, days_until_expiry: days, batch_number,
});

describe('buildAlerts', () => {
  it('orders rows: sync, out of stock, low stock, expiring', () => {
    const alerts = buildAlerts({
      pendingSync: 3,
      lowStock: [low('a', 'Rice', 4), low('b', 'Beans', 0), low('c', 'Garri', -1)],
      expiring: [batch('x', 'Milk', 5, 'B7')],
      canInventory: true,
    });
    expect(alerts.map(a => a.kind)).toEqual(['sync', 'out_of_stock', 'out_of_stock', 'low_stock', 'expiring']);
    expect(alerts[0].title).toBe('3 sales pending sync');
    expect(alerts[3].sub).toBe('Low · 4 left');
    expect(alerts[4].sub).toBe('Expires in 5 days · Batch B7');
    // Pending syncs count as one alert regardless of how many sales wait.
    expect(alertCount(alerts)).toBe(5);
  });

  it('shows cashiers only the pending-sync alert', () => {
    const alerts = buildAlerts({
      pendingSync: 1,
      lowStock: [low('a', 'Rice', 0)],
      expiring: [batch('x', 'Milk', 2)],
      canInventory: false,
    });
    expect(alerts).toHaveLength(1);
    expect(alerts[0].title).toBe('1 sale pending sync');
  });

  it('words expiry edge cases and marks them by urgency', () => {
    const alerts = buildAlerts({
      pendingSync: 0,
      lowStock: [],
      expiring: [batch('a', 'A', -2), batch('b', 'B', 0), batch('c', 'C', 1)],
      canInventory: true,
    });
    expect(alerts.map(a => a.sub)).toEqual(['Expired', 'Expires today', 'Expires in 1 day']);
    expect(alerts.map(a => a.tone)).toEqual(['danger', 'danger', 'warning']);
  });

  it('is empty when there is nothing to report', () => {
    expect(buildAlerts({ pendingSync: 0, lowStock: [], expiring: [], canInventory: true })).toEqual([]);
  });
});
