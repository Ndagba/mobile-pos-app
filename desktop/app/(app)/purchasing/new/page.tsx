'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import { naira, type Product } from '@jaypos/shared';
import { useAuthStore } from '@/store/authStore';
import { isAdmin } from '@/lib/roles';
import { useBranches } from '@/hooks/useBranches';
import { useSuppliers } from '@/hooks/useSuppliers';
import { useProducts } from '@/hooks/useProducts';
import { usePurchaseOrderMutations, type POWriteLine } from '@/hooks/usePurchaseOrderMutations';
import { apiErrorMessage } from '@/lib/errors';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';

/** A line under construction — strings for the editable numeric inputs. */
interface DraftLine {
  product_id: string;
  name: string;
  sku?: string | null;
  unit?: string | null;
  tax_rate: number;
  qty: string;
  unit_cost: string;
}

/**
 * Purchase-order builder. A PO is scoped to one branch and one supplier, then
 * filled with product lines; the server computes the authoritative totals (from
 * each product's `tax_rate`) and creates it as a **draft**. Admins must pick a
 * branch (the backend rejects a branch-less write); a single-branch user has it
 * pre-selected. SERVICE items can't be purchased and are excluded from the picker.
 */
export default function NewPurchaseOrderPage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const admin = isAdmin(user);
  const { create } = usePurchaseOrderMutations();

  const [branchId, setBranchId] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [poNumber, setPoNumber] = useState('');
  const [expectedDate, setExpectedDate] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [productSearch, setProductSearch] = useState('');
  const [error, setError] = useState<string | null>(null);

  const branchesQ = useBranches();
  const suppliersQ = useSuppliers();
  const branches = useMemo(() => branchesQ.data ?? [], [branchesQ.data]);
  const suppliers = useMemo(() => suppliersQ.data ?? [], [suppliersQ.data]);

  // Pre-select the only branch a single-branch user can act on.
  useEffect(() => {
    if (!branchId && branches.length === 1) setBranchId(branches[0].id);
  }, [branches, branchId]);

  // Product search is branch-scoped, so it only runs once a branch is chosen.
  const productsQ = useProducts({ search: productSearch, branchId: branchId || undefined, limit: 50 });
  const addedIds = useMemo(() => new Set(lines.map((l) => l.product_id)), [lines]);
  const results = useMemo(() => {
    const q = productSearch.trim();
    if (!branchId || !q) return [] as Product[];
    return (productsQ.data ?? [])
      .filter((p) => p.item_type !== 'SERVICE' && !addedIds.has(p.id))
      .slice(0, 8);
  }, [productsQ.data, productSearch, branchId, addedIds]);

  const addLine = (p: Product) => {
    setLines((prev) => [
      ...prev,
      {
        product_id: p.id,
        name: p.name,
        sku: p.sku,
        unit: p.unit,
        tax_rate: p.tax_rate ?? 0,
        qty: '1',
        unit_cost: String(p.cost_price ?? 0),
      },
    ]);
    setProductSearch('');
  };
  const setLine = (id: string, patch: Partial<DraftLine>) =>
    setLines((prev) => prev.map((l) => (l.product_id === id ? { ...l, ...patch } : l)));
  const removeLine = (id: string) => setLines((prev) => prev.filter((l) => l.product_id !== id));

  const totals = useMemo(() => {
    let subtotal = 0;
    let tax = 0;
    for (const l of lines) {
      const qty = Number(l.qty);
      const cost = Number(l.unit_cost);
      if (!Number.isFinite(qty) || !Number.isFinite(cost)) continue;
      const lineTotal = qty * cost;
      subtotal += lineTotal;
      tax += lineTotal * (l.tax_rate / 100);
    }
    return { subtotal, tax, total: subtotal + tax };
  }, [lines]);

  const pending = create.isPending;

  const handleSubmit = () => {
    setError(null);
    if (!branchId) return setError('Choose a branch for this order.');
    if (!supplierId) return setError('Choose a supplier.');
    if (lines.length === 0) return setError('Add at least one product line.');

    const items: POWriteLine[] = [];
    for (const l of lines) {
      const qty = Number(l.qty);
      const cost = Number(l.unit_cost);
      if (!Number.isFinite(qty) || qty <= 0) return setError(`Enter a quantity for "${l.name}".`);
      if (!Number.isFinite(cost) || cost < 0) return setError(`Enter a valid unit cost for "${l.name}".`);
      items.push({ product_id: l.product_id, quantity_ordered: qty, unit_cost: cost });
    }

    create.mutate(
      {
        branch_id: branchId,
        supplier_id: supplierId,
        po_number: poNumber.trim() || null,
        expected_date: expectedDate || null,
        notes: notes.trim() || null,
        items,
      },
      {
        onSuccess: (po) => router.push(`/purchasing/${po.id}`),
        onError: (e) => setError(apiErrorMessage(e, 'Could not create the purchase order.')),
      }
    );
  };

  return (
    <div className="flex h-full flex-col gap-4">
      <header>
        <Link
          href="/purchasing"
          className="mb-1 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Purchasing
        </Link>
        <h1 className="text-xl font-semibold">New purchase order</h1>
      </header>

      <div className="min-h-0 flex-1 space-y-5 overflow-auto pb-4">
        {/* Header fields */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <Label htmlFor="po-branch">Branch *</Label>
            <select
              id="po-branch"
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
              disabled={!admin && branches.length <= 1}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm disabled:opacity-60"
            >
              <option value="">Select branch…</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="po-supplier">Supplier *</Label>
            <select
              id="po-supplier"
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">Select supplier…</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="po-number">PO number</Label>
            <Input
              id="po-number"
              value={poNumber}
              onChange={(e) => setPoNumber(e.target.value)}
              placeholder="Auto-generated if blank"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="po-expected">Expected date</Label>
            <Input
              id="po-expected"
              type="date"
              value={expectedDate}
              onChange={(e) => setExpectedDate(e.target.value)}
            />
          </div>
        </div>

        {/* Product picker */}
        <div className="space-y-2">
          <Label>Add products</Label>
          {!branchId ? (
            <p className="text-sm text-muted-foreground">Choose a branch to search its products.</p>
          ) : (
            <div className="relative max-w-md">
              <Input
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                placeholder="Search product name, SKU or barcode"
              />
              {productSearch.trim() && (
                <div className="absolute z-10 mt-1 max-h-72 w-full overflow-auto rounded-md border bg-card shadow-lg">
                  {productsQ.isLoading ? (
                    <div className="flex justify-center py-4">
                      <Spinner className="h-5 w-5" />
                    </div>
                  ) : results.length === 0 ? (
                    <p className="px-3 py-3 text-sm text-muted-foreground">No matching products.</p>
                  ) : (
                    results.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => addLine(p)}
                        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-accent"
                      >
                        <span>
                          <span className="font-medium">{p.name}</span>
                          {p.sku && <span className="ml-1.5 text-xs text-muted-foreground">{p.sku}</span>}
                        </span>
                        <Plus className="h-4 w-4 shrink-0 text-muted-foreground" />
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Lines */}
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2 font-medium">Product</th>
                <th className="px-3 py-2 text-right font-medium">Quantity</th>
                <th className="px-3 py-2 text-right font-medium">Unit cost</th>
                <th className="px-3 py-2 text-right font-medium">Line total</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {lines.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-sm text-muted-foreground">
                    No lines yet — search above to add products.
                  </td>
                </tr>
              ) : (
                lines.map((l) => {
                  const lineTotal = (Number(l.qty) || 0) * (Number(l.unit_cost) || 0);
                  return (
                    <tr key={l.product_id} className="border-b last:border-0">
                      <td className="px-3 py-2">
                        <span className="font-medium">{l.name}</span>
                        {l.sku && <span className="ml-1.5 text-xs text-muted-foreground">{l.sku}</span>}
                        {l.tax_rate > 0 && (
                          <span className="ml-1.5 text-xs text-muted-foreground">VAT {l.tax_rate}%</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Input
                          type="number"
                          step="any"
                          min="0"
                          value={l.qty}
                          onChange={(e) => setLine(l.product_id, { qty: e.target.value })}
                          className="h-9 w-24 text-right"
                        />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Input
                          type="number"
                          step="any"
                          min="0"
                          value={l.unit_cost}
                          onChange={(e) => setLine(l.product_id, { unit_cost: e.target.value })}
                          className="h-9 w-28 text-right"
                        />
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{naira(lineTotal)}</td>
                      <td className="px-3 py-2 text-right">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => removeLine(l.product_id)}
                          aria-label="Remove line"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="space-y-1.5 max-w-md">
          <Label htmlFor="po-notes">Notes</Label>
          <Input
            id="po-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional"
          />
        </div>
      </div>

      {/* Footer: totals + submit */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-t pt-4">
        <div className="flex gap-6 text-sm">
          <span className="text-muted-foreground">
            Subtotal <span className="ml-1 font-medium tabular-nums text-foreground">{naira(totals.subtotal)}</span>
          </span>
          <span className="text-muted-foreground">
            Tax <span className="ml-1 font-medium tabular-nums text-foreground">{naira(totals.tax)}</span>
          </span>
          <span className="text-muted-foreground">
            Total <span className="ml-1 text-base font-semibold tabular-nums text-foreground">{naira(totals.total)}</span>
          </span>
        </div>
        <div className="flex items-center gap-3">
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button variant="outline" onClick={() => router.push('/purchasing')} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={pending || lines.length === 0}>
            {pending && <Spinner className="h-4 w-4" />}
            Create draft PO
          </Button>
        </div>
      </div>
    </div>
  );
}
