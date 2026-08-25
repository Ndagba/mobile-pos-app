'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { isAdmin } from '@/lib/roles';
import { useBranches } from '@/hooks/useBranches';
import { useBulkImport } from '@/hooks/useBulkImport';
import { apiErrorMessage } from '@/lib/errors';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Spinner, FullscreenSpinner } from '@/components/ui/spinner';

const SAMPLE_CSV = `category,name,sku,selling_price,cost_price,tax_rate,barcode,unit,initial_stock,low_stock_threshold,item_type,description
Beverages,Coca-Cola 50cl,CC-50,250,180,7.5,5449000000996,piece,100,20,PRODUCT,Chilled soft drink
Snacks,Digestive Biscuits,DIG-01,600,420,7.5,,pack,40,10,PRODUCT,
Services,Delivery,DEL-01,1500,,0,,,,,SERVICE,Within city`;

/**
 * Bulk CSV import (admin-only — the backend enforces it too; a manager who lands
 * here is bounced to the catalog). The CSV is sent as raw text — the backend
 * parses it — and the per-row error report is shown verbatim so a single bad row
 * doesn't fail the whole import.
 */
export default function BulkImportPage() {
  const router = useRouter();
  const hydrated = useAuthStore((s) => s.hydrated);
  const user = useAuthStore((s) => s.user);
  const admin = isAdmin(user);

  const branchesQ = useBranches();
  const branches = useMemo(() => branchesQ.data ?? [], [branchesQ.data]);
  const multiBranch = branches.length > 1;
  const importMut = useBulkImport();

  const [csv, setCsv] = useState('');
  const [branchId, setBranchId] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (hydrated && user && !admin) router.replace('/inventory');
  }, [hydrated, user, admin, router]);

  // Default the branch once branches load.
  useEffect(() => {
    if (branchId === undefined && branches.length > 0) setBranchId(branches[0].id);
  }, [branches, branchId]);

  if (!hydrated || !user || !admin) return <FullscreenSpinner />;

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setCsv((reader.result as string) ?? '');
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleImport = () => {
    setError(null);
    const branch_id = multiBranch ? branchId : branches[0]?.id;
    if (!branch_id) {
      setError('Select a branch to import into.');
      return;
    }
    if (!csv.trim()) {
      setError('Paste or upload CSV content first.');
      return;
    }
    importMut.mutate(
      { branch_id, csv },
      { onError: (e) => setError(apiErrorMessage(e, 'Import failed.')) }
    );
  };

  const report = importMut.data;

  return (
    <div className="flex h-full flex-col gap-4 overflow-auto">
      <header>
        <Link
          href="/inventory"
          className="mb-1 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Inventory
        </Link>
        <h1 className="text-xl font-semibold">Bulk import</h1>
        <p className="text-sm text-muted-foreground">
          Create or update many products at once from CSV.
        </p>
      </header>

      <div className="rounded-md border bg-muted/30 px-4 py-3 text-sm">
        <p className="font-medium">CSV format</p>
        <p className="mt-1 text-muted-foreground">
          Required columns: <code>category</code>, <code>name</code>, <code>sku</code>, and one of{' '}
          <code>selling_price</code> / <code>marked_price</code>. Optional:{' '}
          <code>effective_price</code>, <code>cost_price</code>, <code>tax_rate</code>,{' '}
          <code>barcode</code>, <code>unit</code>, <code>initial_stock</code>,{' '}
          <code>low_stock_threshold</code>, <code>item_type</code> (PRODUCT/SERVICE),{' '}
          <code>description</code>. Rows are matched by SKU (then barcode) — re-importing updates
          existing products.
        </p>
      </div>

      {multiBranch && (
        <div className="space-y-1.5">
          <Label htmlFor="imp-branch">Import into branch</Label>
          <select
            id="imp-branch"
            value={branchId ?? ''}
            onChange={(e) => setBranchId(e.target.value || undefined)}
            className="h-10 w-64 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="imp-csv">CSV content</Label>
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="text-xs font-medium text-primary hover:underline"
              onClick={() => setCsv(SAMPLE_CSV)}
            >
              Load sample
            </button>
            <input
              type="file"
              accept=".csv,text/csv,text/plain"
              onChange={handleFile}
              className="text-xs file:mr-2 file:rounded-md file:border file:border-input file:bg-background file:px-2 file:py-1 file:text-xs file:font-medium hover:file:bg-accent"
            />
          </div>
        </div>
        <textarea
          id="imp-csv"
          value={csv}
          onChange={(e) => setCsv(e.target.value)}
          rows={12}
          spellCheck={false}
          placeholder="category,name,sku,selling_price,..."
          className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex items-center gap-3">
        <Button onClick={handleImport} disabled={importMut.isPending || !csv.trim()}>
          {importMut.isPending && <Spinner className="h-4 w-4" />}
          Import products
        </Button>
        {importMut.isPending && (
          <span className="text-sm text-muted-foreground">Importing…</span>
        )}
      </div>

      {report && (
        <div className="space-y-3 rounded-lg border p-4">
          <p className="text-sm font-medium">Import complete</p>
          <div className="flex flex-wrap gap-4 text-sm">
            <span className="text-emerald-700">{report.products_created} created</span>
            <span className="text-blue-700">{report.products_updated} updated</span>
            <span className="text-muted-foreground">
              {report.categories_created} categories created
            </span>
            <span className={report.errors.length ? 'text-red-700' : 'text-muted-foreground'}>
              {report.errors.length} error{report.errors.length === 1 ? '' : 's'}
            </span>
          </div>
          {report.errors.length > 0 && (
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-3 py-2 font-medium">Row</th>
                    <th className="px-3 py-2 font-medium">Error</th>
                  </tr>
                </thead>
                <tbody>
                  {report.errors.map((e, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="px-3 py-2 tabular-nums text-muted-foreground">{e.row}</td>
                      <td className="px-3 py-2 text-red-700">{e.error}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
