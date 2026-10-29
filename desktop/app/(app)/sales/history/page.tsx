'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, WifiOff, RefreshCcw, Printer } from 'lucide-react';
import { naira } from '@jaypos/shared';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useNetworkStatus } from '@/lib/useNetwork';
import { numOr0 } from '@/lib/normalize';
import { cn } from '@/lib/utils';
import { useTransactions, type TransactionRow } from '@/hooks/useTransactions';
import { useSyncStore } from '@/store/syncStore';
import { useUsers } from '@/hooks/useUsers';
import { ReceiptModal, type ReceiptData } from '@/components/pos/ReceiptModal';
import { apiClient } from '@/lib/apiClient';
import { useAuthStore } from '@/store/authStore';
import { useBranchStore } from '@/store/branchStore';

const PAGE_SIZE = 50;

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Cash',
  card: 'Card',
  transfer: 'Transfer',
};

function statusClass(status: string): string {
  switch (status) {
    case 'completed':
      return 'bg-emerald-100 text-emerald-700';
    case 'refunded':
      return 'bg-amber-100 text-amber-700';
    case 'voided':
      return 'bg-muted text-muted-foreground';
    default:
      return 'bg-blue-100 text-blue-700';
  }
}

function customerName(tx: TransactionRow): string {
  return tx.customer?.first_name?.trim() || 'Walk-in';
}

const selectClass =
  'h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring';

/**
 * Transaction history.
 *
 * Server-backed (`GET /v1/transactions`) with date/payment/status/user filters and
 * basic paging. Offline, the server list is unavailable, so the page shows the
 * count of sales still pending sync (from Dexie via `syncStore`) rather than an
 * empty table — those rows appear here once they drain to the backend.
 */
export default function HistoryPage() {
  const online = useNetworkStatus();
  const pendingCount = useSyncStore((s) => s.pendingCount);
  const refreshPendingCount = useSyncStore((s) => s.refreshPendingCount);
  const user = useAuthStore((s) => s.user);
  const selectedBranchId = useBranchStore((s) => s.selectedBranchId);
  const activeBranchId = selectedBranchId ?? user?.branch_id ?? undefined;
  const { data: users = [] } = useUsers(activeBranchId);

  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [status, setStatus] = useState('');
  const [userId, setUserId] = useState('');
  const [page, setPage] = useState(0);
  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);

  // Reset to the first page whenever a filter changes.
  useEffect(() => {
    setPage(0);
  }, [dateFrom, dateTo, paymentMethod, status, userId]);

  useEffect(() => {
    void refreshPendingCount();
  }, [refreshPendingCount]);

  const filters = useMemo(
    () => ({
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      paymentMethod: paymentMethod || undefined,
      status: status || undefined,
      userId: userId || undefined,
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    }),
    [dateFrom, dateTo, paymentMethod, status, userId, page]
  );

  const { data, isLoading, isError, isFetching, refetch } = useTransactions(filters);
  const rows = data?.data ?? [];
  const total = data?.pagination.total ?? 0;
  const pages = data?.pagination.pages ?? 0;
  const rangeStart = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const rangeEnd = Math.min((page + 1) * PAGE_SIZE, total);

  const resetFilters = () => {
    setDateFrom('');
    setDateTo('');
    setPaymentMethod('');
    setStatus('');
    setUserId('');
  };

  const handleRefund = async (txId: string) => {
    const reason = window.prompt('Reason for refund:');
    if (!reason) return;

    try {
      await apiClient.post(`/transactions/${txId}/refund`, { reason });
      void refetch();
    } catch (e: any) {
      alert(e.response?.data?.message || 'Refund failed');
    }
  };

  const handleReprint = async (txId: string) => {
    try {
      const tx = await apiClient.get<any>(`/transactions/${txId}`);

      setReceiptData({
        status: tx.status === 'completed' ? 'completed' : 'offline',
        receiptNumber: tx.receipt_number || tx.id,
        lines: tx.transaction_items.map((it: any) => ({
          name: it.product?.name ?? 'Product',
          quantity: Number(it.quantity),
          unit_price: Number(it.unit_price),
          line_total: Number(it.line_total),
        })),
        subtotal: Number(tx.subtotal),
        tax_amount: Number(tx.tax_amount),
        discount_amount: Number(tx.discount_amount),
        total: Number(tx.total_amount),
        paymentLabel: PAYMENT_LABELS[tx.payment_method] ?? tx.payment_method,
        customerName: tx.customer?.first_name || 'Walk-in',
        storeLabel: 'JayPOS',
        branchLabel: tx.branch?.name ?? 'Store',
        footer: 'Thank you for your purchase!',
        at: new Date(tx.created_at),
      });
    } catch (e: any) {
      alert(e.response?.data?.message || 'Could not load receipt');
    }
  };

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Transaction history</h1>
          {online && data && (
            <p className="text-sm text-muted-foreground">
              {total} transaction(s) · net {naira(data.netSum)}
            </p>
          )}
        </div>
        <Link href="/sales">
          <Button variant="outline" size="sm">
            <ArrowLeft className="h-4 w-4" />
            Back to sales
          </Button>
        </Link>
      </div>
      {pendingCount > 0 && (
        <div className="rounded-md bg-blue-100 px-3 py-2 text-sm text-blue-800">
          {pendingCount} sale(s) pending sync. They’ll appear here once synced to the server.
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="date"
          aria-label="From date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          className={selectClass}
        />
        <span className="text-sm text-muted-foreground">to</span>
        <input
          type="date"
          aria-label="To date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          className={selectClass}
        />
        <select
          aria-label="Payment method"
          value={paymentMethod}
          onChange={(e) => setPaymentMethod(e.target.value)}
          className={selectClass}
        >
          <option value="">All payments</option>
          <option value="cash">Cash</option>
          <option value="card">Card</option>
          <option value="transfer">Transfer</option>
        </select>
        <select
          aria-label="Status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className={selectClass}
        >
          <option value="">All statuses</option>
          <option value="completed">Completed</option>
          <option value="refunded">Refunded</option>
          <option value="voided">Voided</option>
        </select>
        <select
          aria-label="Cashier"
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          className={selectClass}
        >
          <option value="">All cashiers</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.first_name} {u.last_name}
            </option>
          ))}
        </select>
        {(dateFrom || dateTo || paymentMethod || status || userId) && (
          <Button variant="ghost" size="sm" onClick={resetFilters}>
            Reset
          </Button>
        )}
      </div>
      {/* Body */}
      <div className="min-h-0 flex-1 overflow-auto rounded-lg border">
        {!online ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 py-16 text-center text-muted-foreground">
            <WifiOff className="h-8 w-8" />
            <p className="text-sm">You’re offline — transaction history is unavailable.</p>
          </div>
        ) : isLoading ? (
          <div className="flex h-full items-center justify-center py-16">
            <Spinner />
          </div>
        ) : isError ? (
          <p className="py-16 text-center text-sm text-destructive">
            Could not load transactions. Please try again.
          </p>
        ) : rows.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted-foreground">
            No transactions match these filters.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Date</th>
                <th className="px-4 py-2 font-medium">Receipt / Cashier</th>
                <th className="px-4 py-2 font-medium">Customer</th>
                <th className="px-4 py-2 text-right font-medium">Items</th>
                <th className="px-4 py-2 font-medium">Payment</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 text-right font-medium">Total</th>
                <th className="px-4 py-2 text-center font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((tx) => (
                <tr key={tx.id} className="hover:bg-accent/50">
                  <td className="whitespace-nowrap px-4 py-2 text-muted-foreground">
                    {new Date(tx.created_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex flex-col">
                      <span className="font-mono text-xs">{tx.receipt_number || tx.id.slice(0, 8)}</span>
                      <span className="text-xs text-muted-foreground">{tx.user?.first_name || 'Unknown'}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2">{customerName(tx)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{tx.item_count ?? 0}</td>
                  <td className="px-4 py-2">
                    {PAYMENT_LABELS[tx.payment_method] ?? tx.payment_method}
                  </td>
                  <td className="px-4 py-2">
                    <span
                      className={cn(
                        'inline-block rounded-full px-2 py-0.5 text-xs font-medium capitalize',
                        statusClass(tx.status)
                      )}
                    >
                      {tx.status}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right font-medium tabular-nums">
                    {naira(numOr0(tx.total_amount))}
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex items-center justify-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={tx.status !== 'completed'}
                        onClick={() => handleRefund(tx.id)}
                      >
                        <RefreshCcw className="h-3 w-3 mr-1" />
                        Refund
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleReprint(tx.id)}
                      >
                        <Printer className="h-3 w-3 mr-1" />
                        Print
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {/* Pagination */}
      {online && total > 0 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Showing {rangeStart}–{rangeEnd} of {total}
            {isFetching && ' · updating…'}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page + 1 >= pages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
      <ReceiptModal data={receiptData} onClose={() => setReceiptData(null)} />
    </div>
  );
}
