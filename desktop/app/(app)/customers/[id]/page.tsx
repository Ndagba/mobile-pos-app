'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Wallet, History, Receipt, Trash2, Plus, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { naira } from '@jaypos/shared';
import { useCustomerLedger, useRecordPayment, useDeletePayment } from '@/hooks/useCustomers';
import { cn } from '@/lib/utils';

export default function CustomerLedgerPage() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, isError } = useCustomerLedger(id);
  const recordPayment = useRecordPayment();
  const deletePayment = useDeletePayment();
  const [isPaymentOpen, setIsPaymentOpen] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');

  if (!id) return null;

  const { customer, history, payments } = data || { customer: null, history: [], payments: [] };

  const totalSpent = history.reduce((sum, tx) => sum + Number(tx.total_amount || 0), 0);
  const totalPaid = payments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
  const outstanding = totalSpent - totalPaid;

  const handleRecordPayment = async () => {
    if (!paymentAmount || Number(paymentAmount) <= 0) return;
    try {
      await recordPayment.mutateAsync({
        customerId: id,
        data: {
          amount: Number(paymentAmount),
          date: new Date().toISOString(),
          notes: 'Payment via Desktop POS',
        },
      });
      setPaymentAmount('');
      setIsPaymentOpen(false);
    } catch (e: any) {
      const errorMessage = e?.response?.data?.message || e?.message || 'Failed to record payment';
      alert(`Error: ${errorMessage}`);
    }
  };

  const handleDeletePayment = async (paymentId: string) => {
    if (!confirm('Delete this payment record?')) return;
    try {
      await deletePayment.mutateAsync({ customerId: id, paymentId });
    } catch (e) {
      alert('Failed to delete payment');
    }
  };

  if (isLoading) return (
    <div className="flex h-full items-center justify-center">
      <Spinner />
    </div>
  );

  if (isError || !customer) return (
    <div className="flex h-full items-center justify-center text-destructive">
      Customer not found.
    </div>
  );

  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/customers">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">{customer.first_name} {customer.last_name}</h1>
            <p className="text-sm text-muted-foreground">{customer.phone} · {customer.email}</p>
          </div>
        </div>
        <Dialog open={isPaymentOpen} onOpenChange={setIsPaymentOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              Record Payment
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Record Payment</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="amount">Amount (₦)</Label>
                <Input
                  id="amount"
                  type="number"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  placeholder="0.00"
                />
              </div>
              <Button className="w-full" onClick={handleRecordPayment} disabled={recordPayment.isPending}>
                {recordPayment.isPending ? 'Saving...' : 'Save Payment'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase">Total Spent</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 text-2xl font-bold">
              <Receipt className="h-5 w-5 text-muted-foreground" />
              {naira(totalSpent)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase">Total Paid</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 text-2xl font-bold">
              <Wallet className="h-5 w-5 text-emerald-600" />
              {naira(totalPaid)}
            </div>
          </CardContent>
        </Card>
        <Card className={cn('border-l-4 border-l-red-500', outstanding > 0 ? '' : 'border-l-emerald-500')}>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase">Outstanding Balance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 text-2xl font-bold">
              <AlertCircle className="h-5 w-5 text-red-600" />
              {naira(outstanding)}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <History className="h-5 w-5" />
              Purchase History
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Receipt</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="h-24 text-center text-muted-foreground">
                      No purchase history.
                    </TableCell>
                  </TableRow>
                ) : (
                  history.map((tx: any) => (
                    <TableRow key={tx.id}>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(tx.created_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{tx.receipt_number || tx.id.slice(0, 8)}</TableCell>
                      <TableCell className="text-right tabular-nums font-medium">
                        {naira(tx.total_amount)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Wallet className="h-5 w-5" />
              Payment Records
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-center">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="h-24 text-center text-muted-foreground">
                      No payments recorded.
                    </TableCell>
                  </TableRow>
                ) : (
                  payments.map((p: any) => (
                    <TableRow key={p.id}>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(p.created_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-medium text-emerald-600">
                        {naira(p.amount)}
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-center">
                          <Button variant="ghost" size="icon" onClick={() => handleDeletePayment(p.id)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
