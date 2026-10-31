'use client';

import React from 'react';
import type { Customer } from '@jaypos/shared';
import { naira } from '@jaypos/shared';
import { useAnalytics } from '@/hooks/useAnalytics';
import { useCustomers } from '@/hooks/useCustomers';
import { useBranchStore } from '@/store/branchStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2 } from 'lucide-react';
import { ReportActions } from '@/components/reports/ReportActions';
import type { ReportDoc } from '@/lib/reportExport';
import { ReportContext } from '../ReportContext';

/** `first_name last_name`, falling back to `name`, then a placeholder. */
function displayName(c: Customer): string {
  const full = [c.first_name, c.last_name].filter(Boolean).join(' ').trim();
  return full || c.name || 'Unnamed customer';
}

/** Per-customer receivable: total_spent − Σ payments.amount (mirrors CustomerLedger). */
function paidOf(c: Customer): number {
  return (c.payments ?? []).reduce((sum, p) => sum + Number(p.amount ?? 0), 0);
}

export default function DebtReportPage() {
  const { selectedBranchId } = useBranchStore();
  const { branchId } = React.useContext(ReportContext);
  const { useDebt } = useAnalytics();

  const activeBranch = branchId || selectedBranchId || '';
  const debtQ = useDebt(activeBranch);
  // Customers are store-scoped (not branch-scoped); matches mobile's receivables view.
  const customersQ = useCustomers({ filters: { limit: 500 } });

  const receivables = React.useMemo(() => {
    const rows = (customersQ.data ?? []).map((c) => {
      const spent = Number(c.total_spent ?? 0);
      const paid = paidOf(c);
      return { customer: c, spent, paid, balance: spent - paid };
    });
    return rows.filter((r) => r.balance > 0).sort((a, b) => b.balance - a.balance);
  }, [customersQ.data]);

  const totalOutstanding = debtQ.data?.total_outstanding ?? 0;
  const customersWithBalance = debtQ.data?.customers_with_balance ?? receivables.length;
  const isLoading = debtQ.isLoading || customersQ.isLoading;

  const buildDoc = React.useCallback((): ReportDoc | null => {
    if (receivables.length === 0) return null;
    return {
      title: 'Outstanding Debt Report',
      meta: [
        { label: 'Scope', value: 'Store-wide (all branches)' },
        { label: 'Generated', value: new Date().toLocaleString() },
      ],
      summary: [
        { label: 'Total Outstanding', value: naira(totalOutstanding) },
        { label: 'Customers With Balance', value: String(customersWithBalance) },
      ],
      tables: [
        {
          heading: 'Receivables',
          columns: [
            { label: 'Customer' },
            { label: 'Phone' },
            { label: 'Total Spent', type: 'currency', align: 'right' },
            { label: 'Paid', type: 'currency', align: 'right' },
            { label: 'Outstanding', type: 'currency', align: 'right' },
          ],
          rows: receivables.map((r) => [
            displayName(r.customer),
            r.customer.phone ?? '',
            r.spent,
            r.paid,
            r.balance,
          ]),
          totals: [
            'Totals',
            '',
            receivables.reduce((s, r) => s + r.spent, 0),
            receivables.reduce((s, r) => s + r.paid, 0),
            receivables.reduce((s, r) => s + r.balance, 0),
          ],
        },
      ],
    };
  }, [receivables, totalOutstanding, customersWithBalance]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Outstanding Debt</h2>
        <ReportActions getDoc={buildDoc} filenameBase="debt_report" disabled={isLoading} />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground uppercase">Total Outstanding</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-rose-600">{naira(totalOutstanding)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground uppercase">Customers With Balance</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{customersWithBalance}</div>
              </CardContent>
            </Card>
          </div>

          <p className="text-xs text-muted-foreground">
            Outstanding debt is store-wide (not filtered by branch).
          </p>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Customer</TableHead>
                    <TableHead className="text-right">Total Spent</TableHead>
                    <TableHead className="text-right">Paid</TableHead>
                    <TableHead className="text-right">Outstanding</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {receivables.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                        No customers with outstanding balance.
                      </TableCell>
                    </TableRow>
                  ) : (
                    receivables.map((r) => (
                      <TableRow key={r.customer.id}>
                        <TableCell>
                          <span className="font-medium">{displayName(r.customer)}</span>
                          {r.customer.phone && (
                            <span className="ml-2 text-xs text-muted-foreground">{r.customer.phone}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{naira(r.spent)}</TableCell>
                        <TableCell className="text-right tabular-nums text-emerald-600">{naira(r.paid)}</TableCell>
                        <TableCell className="text-right font-medium tabular-nums text-rose-600">{naira(r.balance)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
