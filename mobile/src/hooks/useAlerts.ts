import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { useSelector } from 'react-redux';

import { RootState } from '../redux/store';
import ApiClient from '../services/ApiClient';
import DatabaseService from '../services/DatabaseService';
import { AppAlert, ExpiringBatch, buildAlerts } from '../utils/alerts';
import { LowStockItem, normalizeLowStock } from '../utils/purchaseOrders';

const EXPIRY_WINDOW_DAYS = 30;

/**
 * Loads the in-app alerts whenever the screen using it gains focus (and on
 * reconnect): pending-sync sales from local storage for everyone; low/out-of-
 * stock and batches expiring within 30 days from the server for admins and
 * managers. Each source fails soft — one failing never hides the others.
 */
export function useAlerts() {
  const role = useSelector((s: RootState) => s.auth.user?.role);
  const online = useSelector((s: RootState) => s.sync.isConnected);
  const canInventory = role === 'admin' || role === 'manager';

  const [alerts, setAlerts] = useState<AppAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const seq = useRef(0);

  const reload = useCallback(async () => {
    const mine = ++seq.current;

    const pendingP = DatabaseService.getUnsyncedTransactions()
      .then((rows: any[]) => (Array.isArray(rows) ? rows.length : 0))
      .catch(() => 0);

    const lowP: Promise<LowStockItem[]> = canInventory
      ? ApiClient.get('/inventory/low-stock')
          .then((res: any) => (Array.isArray(res) ? res : res?.data ?? []).map(normalizeLowStock))
          .catch(() => [])
      : Promise.resolve([]);

    const expP: Promise<ExpiringBatch[]> = canInventory
      ? ApiClient.get(`/inventory/expiring?days=${EXPIRY_WINDOW_DAYS}&status=expiring`)
          .then((res: any) =>
            (Array.isArray(res) ? res : res?.data ?? []).map((r: any) => ({
              batch_id: String(r.batch_id),
              product_name: String(r.product_name ?? ''),
              batch_number: r.batch_number ?? null,
              days_until_expiry: Number(r.days_until_expiry) || 0,
            }))
          )
          .catch(() => [])
      : Promise.resolve([]);

    const [pendingSync, lowStock, expiring] = await Promise.all([pendingP, lowP, expP]);
    if (mine !== seq.current) return;
    setAlerts(buildAlerts({ pendingSync, lowStock, expiring, canInventory }));
    setLoading(false);
  }, [canInventory]);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload, online])
  );

  return { alerts, loading, reload, canInventory };
}
