import { LowStockItem } from './purchaseOrders';

/**
 * In-app alerts — the mobile counterpart of the desktop top-bar notifications
 * bell, built with the same rules: pending-sync sales (everyone), then
 * out-of-stock, low-stock and expiring batches (admin + manager only, because
 * cashiers can't manage the catalog). Pure, so it is unit-tested.
 */
export type AlertKind = 'sync' | 'out_of_stock' | 'low_stock' | 'expiring';
export type AlertTone = 'danger' | 'warning';

export interface ExpiringBatch {
  batch_id: string;
  product_name: string;
  batch_number?: string | null;
  days_until_expiry: number;
}

export interface AppAlert {
  key: string;
  kind: AlertKind;
  tone: AlertTone;
  title: string;
  sub: string;
}

export interface AlertInputs {
  pendingSync: number;
  lowStock: LowStockItem[];
  expiring: ExpiringBatch[];
  /** Admin or manager: may see inventory alerts. */
  canInventory: boolean;
}

const plural = (n: number, word: string) => `${word}${n === 1 ? '' : 's'}`;
const qty = (n: number) => String(Math.round(n * 10000) / 10000);

/** Ordered alert rows: sync first, then out of stock, low stock, expiring (as on desktop). */
export function buildAlerts({ pendingSync, lowStock, expiring, canInventory }: AlertInputs): AppAlert[] {
  const out: AppAlert[] = [];

  if (pendingSync > 0) {
    out.push({
      key: 'sync',
      kind: 'sync',
      tone: 'warning',
      title: `${pendingSync} ${plural(pendingSync, 'sale')} pending sync`,
      sub: 'They upload automatically when you are back online',
    });
  }

  if (!canInventory) return out;

  for (const i of lowStock) {
    if (i.current_quantity <= 0) {
      out.push({ key: `oos-${i.product_id}`, kind: 'out_of_stock', tone: 'danger', title: i.product_name, sub: 'Out of stock' });
    }
  }
  for (const i of lowStock) {
    if (i.current_quantity > 0) {
      out.push({
        key: `low-${i.product_id}`,
        kind: 'low_stock',
        tone: 'warning',
        title: i.product_name,
        sub: `Low · ${qty(i.current_quantity)} left`,
      });
    }
  }
  for (const b of expiring) {
    const d = b.days_until_expiry;
    out.push({
      key: `exp-${b.batch_id}`,
      kind: 'expiring',
      tone: d <= 0 ? 'danger' : 'warning',
      title: b.product_name,
      sub:
        (d < 0 ? 'Expired' : d === 0 ? 'Expires today' : `Expires in ${d} ${plural(d, 'day')}`) +
        (b.batch_number ? ` · Batch ${b.batch_number}` : ''),
    });
  }
  return out;
}

/**
 * Badge number for the bell. Same counting as desktop: every inventory row
 * counts once, and pending syncs count as ONE alert however many sales wait.
 */
export function alertCount(alerts: AppAlert[]): number {
  return alerts.length;
}
