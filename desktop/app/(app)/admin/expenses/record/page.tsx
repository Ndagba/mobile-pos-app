'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { useBranchStore } from '@/store/branchStore';
import { useAuthStore } from '@/store/authStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { Loader2, Save } from 'lucide-react';

interface ExpenseCategory {
  id: string;
  name: string;
}

export default function RecordExpensePage() {
  const queryClient = useQueryClient();
  const { selectedBranchId } = useBranchStore();
  const { user } = useAuthStore();
  const branchId = selectedBranchId || '';

  const { data: categories = [], isLoading: catsLoading } = useQuery({
    queryKey: ['expense-categories', branchId],
    queryFn: async () => {
      const res = await apiClient.get<ExpenseCategory[]>(`/expenses/categories?branchId=${branchId}`);
      return res;
    },
  });

  const [formData, setFormData] = useState({
    category_id: '',
    amount: '',
    description: '',
    expenseDate: new Date().toISOString().split('T')[0],
    paymentMethod: 'cash',
    referenceNumber: '',
  });

  const recordMutation = useMutation({
    mutationFn: async (data: any) => apiClient.post('/expenses', data),
    onSuccess: () => {
      toast.success('Expense recorded successfully');
      setFormData({
        category_id: '',
        amount: '',
        description: '',
        expenseDate: new Date().toISOString().split('T')[0],
        paymentMethod: 'cash',
        referenceNumber: '',
      });
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log('DEBUG: Attempting to record expense', {
      formData,
      branchId,
      userId: user?.id
    });
    try {
      await recordMutation.mutateAsync({
        ...formData,
        amount: Number(formData.amount),
        branch_id: branchId,
        createdBy: user?.id || 'system',
      });
    } catch (err: any) {
      console.error('DEBUG: recordMutation error:', err);
      toast.error(err?.response?.data?.message || 'An error occurred');
    }
  };

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">Record Expense</h1>
        <p className="text-muted-foreground">Log a new business expenditure.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Expense Details</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="category">Category</Label>
                <Select
                  value={formData.category_id}
                  onValueChange={(v) => setFormData({ ...formData, category_id: v })}
                  required
                >
                  {catsLoading ? (
                    <option disabled>Loading...</option>
                  ) : (
                    <>
                      <option value="" disabled>Select category</option>
                      {categories.map((cat) => (
                        <option key={cat.id} value={cat.id}>
                          {cat.name}
                        </option>
                      ))}
                    </>
                  )}
                </Select>
              </div>


              <div className="space-y-2">
                <Label htmlFor="amount">Amount (₦)</Label>
                <Input
                  id="amount"
                  type="number"
                  step="0.01"
                  value={formData.amount}
                  onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="date">Date</Label>
                <Input
                  id="date"
                  type="date"
                  value={formData.expenseDate}
                  onChange={(e) => setFormData({ ...formData, expenseDate: e.target.value })}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="paymentMethod">Payment Method</Label>
                <Select
                  value={formData.paymentMethod}
                  onValueChange={(v) => setFormData({ ...formData, paymentMethod: v })}
                >
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="card">Card</SelectItem>
                  <SelectItem value="transfer">Transfer</SelectItem>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Input
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="e.g. Fuel for delivery van"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="ref">Reference Number (Optional)</Label>
              <Input
                id="ref"
                value={formData.referenceNumber}
                onChange={(e) => setFormData({ ...formData, referenceNumber: e.target.value })}
              />
            </div>

            <Button type="submit" className="w-full gap-2" disabled={recordMutation.isPending}>
              {recordMutation.isPending ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Saving...</>
              ) : (
                <><Save className="h-4 w-4" /> Record Expense</>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

// function Label({ children, htmlFor }: { children: React.ReactNode; htmlFor: string }) {
//   return <label htmlFor={htmlFor} className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">{children}</label>;
// }
