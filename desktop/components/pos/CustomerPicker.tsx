'use client';

import { useState } from 'react';
import { UserPlus, X } from 'lucide-react';
import { naira } from '@jaypos/shared';
import { Modal } from '@/components/ui/modal';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useCustomers } from '@/hooks/useCustomers';
import { customerDisplayName, type NormalizedCustomer } from '@/lib/normalize';

/**
 * Optional customer for the sale. Selecting one enables the soft credit warning
 * in Checkout (mobile parity — a sale is never blocked by credit). The picker
 * only fetches while open (`enabled`), and a "walk-in" clear removes the customer.
 */
export function CustomerPicker({
  customer,
  onSelect,
}: {
  customer: NormalizedCustomer | null;
  onSelect: (c: NormalizedCustomer | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const { data: customers = [], isLoading } = useCustomers({
    search: search.trim() || undefined,
    enabled: open,
  });

  return (
    <div>
      <p className="mb-1.5 text-sm text-muted-foreground">Customer</p>

      {customer ? (
        <div className="flex items-center justify-between gap-2 rounded-md border px-3 py-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{customerDisplayName(customer)}</p>
            {customer.phone && (
              <p className="truncate text-xs text-muted-foreground">{customer.phone}</p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
              Change
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              aria-label="Remove customer"
              onClick={() => onSelect(null)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="outline" className="w-full justify-start" onClick={() => setOpen(true)}>
          <UserPlus className="h-4 w-4" />
          Add customer (optional)
        </Button>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Select customer">
        <div className="space-y-3 p-4">
          <Input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, phone, or email…"
          />
          <div className="max-h-72 overflow-auto">
            {isLoading ? (
              <div className="flex h-24 items-center justify-center">
                <Spinner />
              </div>
            ) : customers.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No customers found.
              </p>
            ) : (
              <ul className="divide-y">
                {customers.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => {
                        onSelect(c);
                        setOpen(false);
                      }}
                      className="flex w-full items-center justify-between gap-3 px-1 py-2.5 text-left hover:bg-accent"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{customerDisplayName(c)}</p>
                        {c.phone && (
                          <p className="truncate text-xs text-muted-foreground">{c.phone}</p>
                        )}
                      </div>
                      {c.available_credit !== null && (
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {naira(c.available_credit)} credit
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
}
