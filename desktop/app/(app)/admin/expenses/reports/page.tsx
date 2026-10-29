'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { useBranchStore } from '@/store/branchStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Download } from 'lucide-react';
import { naira } from '@jaypos/shared';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface Expense {
  id: string;
  amount: number;
  description: string | null;
  expenseDate: string;
  paymentMethod: string;
  status: string;
  category: {
    name: string;
  };
}

interface ExpenseCategory {
  id: string;
  name: string;
}

export default function ExpenseReportsPage() {
  const { selectedBranchId } = useBranchStore();
  const branchId = selectedBranchId || '';
  const [filters, setFilters] = useState({
    startDate: '',
    endDate: '',
    search: '',
    categoryId: '',
    paymentMethod: '',
  });

  const { data: categories = [], isLoading: categoriesLoading } = useQuery({
    queryKey: ['expense-categories', branchId],
    queryFn: async () => {
      const res = await apiClient.get<ExpenseCategory[]>(`/expenses/categories?branchId=${branchId}`);
      return res;
    },
    enabled: !!branchId,
  });

  const { data: expenses = [], isLoading } = useQuery({
    queryKey: ['expenses-report', branchId, filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set('branchId', branchId);
      if (filters.startDate) params.set('startDate', filters.startDate);
      if (filters.endDate) params.set('endDate', filters.endDate);
      if (filters.search) params.set('search', filters.search);
      if (filters.categoryId) params.set('categoryId', filters.categoryId);
      if (filters.paymentMethod) params.set('paymentMethod', filters.paymentMethod);

      const res = await apiClient.get<Expense[]>(`/expenses?${params.toString()}`);
      return res;
    },
  });

  const totalExpenditure = expenses.reduce((sum, exp) => sum + Number(exp.amount), 0);

  const paymentMethods = [
    { value: 'cash', label: 'Cash' },
    { value: 'card', label: 'Card' },
    { value: 'transfer', label: 'Transfer' },
  ];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Expense Reports</h1>
          <p className="text-muted-foreground">Track business expenditures across branches.</p>
        </div>
        <Button variant="outline" className="gap-2">
          <Download className="h-4 w-4" /> Export CSV
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-5">
            <div className="space-y-2">
              <label className="text-xs font-medium">Start Date</label>
              <Input
                type="date"
                value={filters.startDate}
                onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium">End Date</label>
              <Input
                type="date"
                value={filters.endDate}
                onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium">Search</label>
              <Input
                placeholder="Description..."
                value={filters.search}
                onChange={(e) => setFilters({ ...filters, search: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium">Category</label>
              <Select
                value={filters.categoryId}
                onValueChange={(val) => setFilters({ ...filters, categoryId: val })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {categories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium">Payment Method</label>
              <Select
                value={filters.paymentMethod}
                onValueChange={(val) => setFilters({ ...filters, paymentMethod: val })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select Method" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Methods</SelectItem>
                  {paymentMethods.map((m) => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase">Total Expenditure</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{naira(totalExpenditure)}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin" /></div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Payment</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {expenses.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                      No expense records found.
                    </TableCell>
                  </TableRow>
                ) : (
                  expenses.map((exp) => (
                    <TableRow key={exp.id}>
                      <TableCell className="text-xs">{new Date(exp.expenseDate).toLocaleDateString()}</TableCell>
                      <TableCell>{exp.category.name}</TableCell>
                      <TableCell>{exp.description}</TableCell>
                      <TableCell className="capitalize">{exp.paymentMethod}</TableCell>
                      <TableCell className="text-right tabular-nums font-medium">
                        {naira(exp.amount)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
