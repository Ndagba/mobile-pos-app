'use client';

import React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Loader2, AlertCircle } from 'lucide-react';
import { naira } from '@jaypos/shared';
import { useAuthStore } from '@/store/authStore';
import {
  useEmployeeTransactions,
  useUsers,
  type EmployeeTransaction,
} from '@/hooks/useEmployeeTransactions';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ReportActions } from '@/components/reports/ReportActions';
import { apiErrorMessage } from '@/lib/errors';
import type { ReportDoc } from '@/lib/reportExport';
import { printReportDoc } from '@/lib/reportExport';
import {
  PERIOD_LABELS,
  periodToRange,
  rangeLabel,
  ymd,
  type PeriodPreset,
} from '@/lib/reportPeriods';

const num = (v: unknown): number => Number(v) || 0;

const PAYMENT_LABEL: Record<string, string> = {
  cash: 'Cash',
  card: 'Card',
  transfer: 'Transfer',
  mobile_wallet: 'Transfer',
  split: 'Split',
};
const payLabel = (m: string) => PAYMENT_LABEL[m] ?? m;

function customerName(t: EmployeeTransaction): string {
  const c = t.customer;
  if (!c) return 'Walk-in';
  const full = [c.first_name, c.last_name].filter(Boolean).join(' ').trim();
  return full || c.phone || 'Walk-in';
}

const STATUS_TONE: Record<string, string> = {
  completed: 'text-emerald-600',
  refunded: 'text-amber-600',
  voided: 'text-rose-600',
};

export default function EmployeeDetailReportPage() {
  const params = useParams<{ id: string }>();
  const employeeId = params?.id ?? '';
  const { user } = useAuthStore();

  const [preset, setPreset] = React.useState<PeriodPreset>('month');
  const [customFrom, setCustomFrom] = React.useState(ymd(new Date(new Date().setDate(new Date().getDate() - 30))));
  const [customTo, setCustomTo] = React.useState(ymd(new Date()));
  const [paymentMethod, setPaymentMethod] = React.useState('');
  const [status, setStatus] = React.useState('');

  const range = React.useMemo(
    () => periodToRange(preset, customFrom, customTo),
    [preset, customFrom, customTo]
  );

  const txQ = useEmployeeTransactions(employeeId, {
    dateFrom: range.dateFrom,
    dateTo: range.dateTo,
    status: status || undefined,
    paymentMethod: paymentMethod || undefined,
  });
  const usersQ = useUsers();

  const transactions = txQ.data?.data ?? [];
  const rosterUser = (usersQ.data ?? []).find((u) => u.id === employeeId);

  // Resolve employee identity from the roster, falling back to the first transaction.
  const firstTx = transactions[0];
  const employeeName =
    (rosterUser && `${rosterUser.first_name} ${rosterUser.last_name}`.trim()) ||
    (firstTx?.user && `${firstTx.user.first_name ?? ''} ${firstTx.user.last_name ?? ''}`.trim()) ||
    'Employee';
  const employeeRole = rosterUser?.role ?? '';
  const employeeEmail = rosterUser?.email ?? '';

  // Totals — gross/discount/tax from completed sales; refunds separate; net = completed − refunded.
  const totals = React.useMemo(() => {
    let sales = 0;
    let discount = 0;
    let tax = 0;
    let refunds = 0;
    for (const t of transactions) {
      if (t.status === 'completed') {
        sales += num(t.total_amount);
        discount += num(t.discount_amount);
        tax += num(t.tax_amount);
      } else if (t.status === 'refunded') {
        refunds += num(t.total_amount);
      }
    }
    return { count: transactions.length, sales, discount, tax, refunds, net: sales - refunds };
  }, [transactions]);

  // Build the export/print document from the current, filtered data.
  const buildDoc = React.useCallback((): ReportDoc | null => {
    if (transactions.length === 0) return null;
    const period = rangeLabel(range.dateFrom, range.dateTo);

    const txRows = transactions.map((t) => [
      t.receipt_number ?? t.id.slice(0, 8),
      new Date(t.created_at).toLocaleString(),
      customerName(t),
      payLabel(t.payment_method),
      t.status,
      t.transaction_items?.length ?? 0,
      num(t.discount_amount),
      num(t.tax_amount),
      num(t.total_amount),
    ]);

    const itemRows: (string | number)[][] = [];
    for (const t of transactions) {
      for (const it of t.transaction_items ?? []) {
        itemRows.push([
          t.receipt_number ?? t.id.slice(0, 8),
          it.product?.name ?? it.product_id,
          num(it.quantity),
          num(it.unit_price),
          num(it.discount_amount),
          num(it.tax_amount),
          num(it.line_total),
        ]);
      }
    }

    return {
      title: `Employee Report — ${employeeName}`,
      meta: [
        { label: 'Employee', value: employeeName },
        ...(employeeRole ? [{ label: 'Role', value: employeeRole }] : []),
        ...(employeeEmail ? [{ label: 'Email', value: employeeEmail }] : []),
        { label: 'Employee ID', value: employeeId },
        { label: 'Store', value: user?.store_id ?? '—' },
        { label: 'Period', value: period },
        { label: 'Generated', value: new Date().toLocaleString() },
      ],
      summary: [
        { label: 'Total Transactions', value: String(totals.count) },
        { label: 'Total Sales', value: naira(totals.sales) },
        { label: 'Total Discounts', value: naira(totals.discount) },
        { label: 'Total Tax', value: naira(totals.tax) },
        { label: 'Total Refunds', value: naira(totals.refunds) },
        { label: 'Net Sales', value: naira(totals.net) },
      ],
      tables: [
        {
          heading: 'Transactions',
          columns: [
            { label: 'Receipt' },
            { label: 'Date & Time' },
            { label: 'Customer' },
            { label: 'Payment' },
            { label: 'Status' },
            { label: 'Items', type: 'number', align: 'right' },
            { label: 'Discount', type: 'currency', align: 'right' },
            { label: 'Tax', type: 'currency', align: 'right' },
            { label: 'Total', type: 'currency', align: 'right' },
          ],
          rows: txRows,
          totals: ['Totals', '', '', '', '', '', totals.discount, totals.tax, totals.sales],
        },
        {
          heading: 'Line Items',
          columns: [
            { label: 'Receipt' },
            { label: 'Product' },
            { label: 'Qty', type: 'number', align: 'right' },
            { label: 'Unit Price', type: 'currency', align: 'right' },
            { label: 'Discount', type: 'currency', align: 'right' },
            { label: 'Tax', type: 'currency', align: 'right' },
            { label: 'Line Total', type: 'currency', align: 'right' },
          ],
          rows: itemRows,
        },
      ],
    };
  }, [transactions, range, employeeName, employeeRole, employeeEmail, employeeId, user, totals]);

  // Auto-print when opened from the list's "Print Report" (?print=1), once data is ready.
  const printedRef = React.useRef(false);
  React.useEffect(() => {
    if (printedRef.current || txQ.isLoading) return;
    const wantsPrint =
      typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).get('print') === '1';
    if (wantsPrint) {
      const doc = buildDoc();
      if (doc) {
        printedRef.current = true;
        try {
          printReportDoc(doc);
        } catch {
          /* pop-up blocked — user can use the Print button */
        }
      }
    }
  }, [txQ.isLoading, buildDoc]);

  const slug = employeeName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'employee';

  const summaryCards: { label: string; value: string; tone?: string }[] = [
    { label: 'Total Transactions', value: String(totals.count) },
    { label: 'Total Sales', value: naira(totals.sales) },
    { label: 'Total Discounts', value: naira(totals.discount), tone: 'text-rose-600' },
    { label: 'Total Tax', value: naira(totals.tax) },
    { label: 'Total Refunds', value: naira(totals.refunds), tone: 'text-amber-600' },
    { label: 'Net Sales', value: naira(totals.net), tone: 'text-emerald-600' },
  ];

  return (
    <div className="space-y-6">
      <Link href="/reports/employees" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Employees
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{employeeName}</h1>
          <p className="text-sm text-muted-foreground">
            Employee Report
            {employeeRole ? ` · ${employeeRole}` : ''} · {rangeLabel(range.dateFrom, range.dateTo)}
          </p>
        </div>
        <ReportActions getDoc={buildDoc} filenameBase={`employee_report_${slug}`} disabled={txQ.isLoading} />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-muted/30 p-4">
        <div className="flex gap-1.5">
          {PERIOD_LABELS.map((p) => (
            <Button
              key={p.key}
              size="sm"
              variant={preset === p.key ? 'default' : 'outline'}
              onClick={() => setPreset(p.key)}
            >
              {p.label}
            </Button>
          ))}
        </div>
        {preset === 'custom' && (
          <div className="flex items-end gap-2">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">From</label>
              <Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="h-9" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">To</label>
              <Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="h-9" />
            </div>
          </div>
        )}
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Payment</label>
          <select
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          >
            <option value="">All</option>
            <option value="cash">Cash</option>
            <option value="card">Card</option>
            <option value="transfer">Transfer</option>
            <option value="mobile_wallet">Mobile Wallet</option>
            <option value="split">Split</option>
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Status</label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          >
            <option value="">All</option>
            <option value="completed">Completed</option>
            <option value="refunded">Refunded</option>
            <option value="voided">Voided</option>
          </select>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-6">
        {summaryCards.map((c) => (
          <Card key={c.label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground uppercase">{c.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`text-xl font-bold ${c.tone ?? ''}`}>{c.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Transactions */}
      {txQ.isLoading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : txQ.isError ? (
        <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          <AlertCircle className="h-4 w-4" />
          {apiErrorMessage(txQ.error, 'Could not load this employee’s transactions.')}
        </div>
      ) : transactions.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            No transactions for this employee in the selected period.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {transactions.map((t) => (
            <Card key={t.id}>
              <CardContent className="p-0">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/30 px-4 py-2.5 text-sm">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                    <span className="font-medium">{t.receipt_number ?? t.id.slice(0, 8)}</span>
                    <span className="text-muted-foreground">{new Date(t.created_at).toLocaleString()}</span>
                    <span className="text-muted-foreground">{customerName(t)}</span>
                    <span className="rounded bg-muted px-2 py-0.5 text-xs">{payLabel(t.payment_method)}</span>
                    <span className={`text-xs font-medium ${STATUS_TONE[t.status] ?? ''}`}>{t.status}</span>
                  </div>
                  <span className="font-semibold tabular-nums">{naira(num(t.total_amount))}</span>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Unit Price</TableHead>
                      <TableHead className="text-right">Discount</TableHead>
                      <TableHead className="text-right">Tax</TableHead>
                      <TableHead className="text-right">Line Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(t.transaction_items ?? []).length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground">
                          No line items recorded.
                        </TableCell>
                      </TableRow>
                    ) : (
                      (t.transaction_items ?? []).map((it) => (
                        <TableRow key={it.id}>
                          <TableCell>
                            <span className="font-medium">{it.product?.name ?? it.product_id}</span>
                            {it.product?.sku && (
                              <span className="ml-2 text-xs text-muted-foreground">{it.product.sku}</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{num(it.quantity)}</TableCell>
                          <TableCell className="text-right tabular-nums">{naira(num(it.unit_price))}</TableCell>
                          <TableCell className="text-right tabular-nums">{naira(num(it.discount_amount))}</TableCell>
                          <TableCell className="text-right tabular-nums">{naira(num(it.tax_amount))}</TableCell>
                          <TableCell className="text-right font-medium tabular-nums">{naira(num(it.line_total))}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ))}

          {/* Period totals */}
          <Card>
            <CardContent className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
              <span className="font-semibold">Period Totals</span>
              <div className="flex flex-wrap gap-x-6 gap-y-1">
                <span>Discounts: <b className="tabular-nums">{naira(totals.discount)}</b></span>
                <span>Tax: <b className="tabular-nums">{naira(totals.tax)}</b></span>
                <span>Refunds: <b className="tabular-nums text-amber-600">{naira(totals.refunds)}</b></span>
                <span>Gross Sales: <b className="tabular-nums">{naira(totals.sales)}</b></span>
                <span>Net Sales: <b className="tabular-nums text-emerald-600">{naira(totals.net)}</b></span>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
