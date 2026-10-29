'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { Search, Plus, Edit, Trash2, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { CustomerStats } from '@/components/customers/CustomerStats';
import { CustomerForm } from '@/components/customers/CustomerForm';
import { useCustomers, useCreateCustomer, useUpdateCustomer, useDeleteCustomer, useCustomerSummary } from '@/hooks/useCustomers';
import { naira } from '@jaypos/shared';

export default function CustomersPage() {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'vip' | 'new'>('all');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<any>(null);

  const { data: customers = [], isLoading } = useCustomers();
  const { data: summary, isLoading: summaryLoading } = useCustomerSummary();
  const createMutation = useCreateCustomer();
  const updateMutation = useUpdateCustomer();
  const deleteMutation = useDeleteCustomer();

  const filteredCustomers = useMemo(() => {
    return customers.filter((c) => {
      const matchesSearch = (c.first_name + ' ' + c.last_name).toLowerCase().includes(search.toLowerCase()) ||
                           c.phone?.toLowerCase().includes(search.toLowerCase());

      if (filter === 'vip') return matchesSearch && c.tag === 'vip';
      if (filter === 'new') return matchesSearch && !c.created_at; // Simplified for now
      return matchesSearch;
    });
  }, [customers, search, filter]);

  const stats = useMemo(() => ({
    total: summary?.total ?? 0,
    vips: summary?.vips ?? 0,
    active30d: summary?.active30d ?? 0,
    lifetimeSpend: summary?.lifetimeSpend ?? 0,
    outstanding: summary?.outstanding ?? 0,
  }), [summary]);

  const handleCreate = async (data: any) => {
    try {
      await createMutation.mutateAsync(data);
      setIsFormOpen(false);
    } catch (e) {
      alert('Failed to create customer');
    }
  };

  const handleUpdate = async (data: any) => {
    try {
      // Only send fields that are actually editable to avoid Prisma errors with read-only fields (id, created_at, etc.)
      const {
        first_name,
        last_name,
        phone,
        email,
        credit_limit,
        tag,
        notes,
      } = data;

      await updateMutation.mutateAsync({
        id: editingCustomer.id,
        data: { first_name, last_name, phone, email, credit_limit, tag, notes },
      });
      setIsFormOpen(false);
      setEditingCustomer(null);
    } catch (e) {
      alert('Failed to update customer');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this customer? All associated data will be lost.')) return;
    try {
      await deleteMutation.mutateAsync(id);
    } catch (e) {
      alert('Failed to delete customer');
    }
  };

  const openEdit = (customer: any) => {
    setEditingCustomer(customer);
    setIsFormOpen(true);
  };

  const openCreate = () => {
    setEditingCustomer(null);
    setIsFormOpen(true);
  };

  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Customers</h1>
          <p className="text-sm text-muted-foreground">Manage your customer directory and credit limits.</p>
        </div>
        <Button onClick={openCreate} className="gap-2">
          <UserPlus className="h-4 w-4" />
          New Customer
        </Button>
      </div>

      <CustomerStats {...stats} />

      <div className="flex flex-wrap items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search customers..."
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          {(['all', 'vip', 'new'] as const).map((f) => (
            <Badge
              key={f}
              variant={filter === f ? 'default' : 'outline'}
              className="cursor-pointer px-3 py-1 capitalize"
              onClick={() => setFilter(f)}
            >
              {f}
            </Badge>
          ))}
        </div>
      </div>

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Customer</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Tag</TableHead>
              <TableHead className="text-right">Credit Limit</TableHead>
              <TableHead className="text-center">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center">Loading customers...</TableCell>
              </TableRow>
            ) : filteredCustomers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                  No customers found.
                </TableCell>
              </TableRow>
            ) : (
              filteredCustomers.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">
                    <Link href={`/customers/${c.id}`} className="text-primary hover:underline">
                      {c.first_name} {c.last_name}
                    </Link>
                  </TableCell>
                  <TableCell>{c.phone}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="capitalize">{c.tag || 'Regular'}</Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {naira(c.credit_limit || 0)}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-center gap-2">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(c)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => handleDelete(c.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingCustomer ? 'Edit Customer' : 'Add New Customer'}</DialogTitle>
          </DialogHeader>
          <CustomerForm
            initialData={editingCustomer}
            onSubmit={editingCustomer ? handleUpdate : handleCreate}
            isLoading={createMutation.isPending || updateMutation.isPending}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
