'use client';

import React from 'react';
import { Download, FileText, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { downloadReportCSV, printReportDoc, type ReportDoc } from '@/lib/reportExport';

/**
 * Shared CSV / PDF / Print action bar for every report page.
 *
 * `getDoc()` returns the fully-built report (already filtered) at click time, so
 * the export always reflects the current filters/data — or `null` when there is
 * nothing to export, which disables the buttons. `filenameBase` + today's date
 * form the download filename (e.g. `sales_report_2026-10-30.csv`).
 */
export function ReportActions({
  getDoc,
  filenameBase,
  disabled,
}: {
  getDoc: () => ReportDoc | null;
  filenameBase: string;
  disabled?: boolean;
}) {
  const [busy, setBusy] = React.useState<null | 'csv' | 'pdf' | 'print'>(null);
  const [error, setError] = React.useState<string | null>(null);

  const filename = `${filenameBase}_${new Date().toISOString().slice(0, 10)}`;

  const run = (kind: 'csv' | 'pdf' | 'print') => {
    if (busy) return; // prevent duplicate requests from repeated clicks
    setError(null);
    const doc = getDoc();
    if (!doc) {
      setError('No data to export for the current filters.');
      return;
    }
    setBusy(kind);
    try {
      if (kind === 'csv') downloadReportCSV(filename, doc);
      else printReportDoc(doc); // pdf + print both use the branded print window
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed. Please try again.');
    } finally {
      // Native print/open is synchronous here; clear shortly after so the UI settles.
      setTimeout(() => setBusy(null), 400);
    }
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        <Button size="sm" variant="outline" disabled={disabled || busy !== null} onClick={() => run('csv')}>
          <Download className="mr-1.5 h-4 w-4" />
          CSV
        </Button>
        <Button size="sm" variant="outline" disabled={disabled || busy !== null} onClick={() => run('pdf')}>
          <FileText className="mr-1.5 h-4 w-4" />
          PDF
        </Button>
        <Button size="sm" variant="outline" disabled={disabled || busy !== null} onClick={() => run('print')}>
          <Printer className="mr-1.5 h-4 w-4" />
          Print
        </Button>
      </div>
      {error && <p className="text-xs text-rose-600">{error}</p>}
    </div>
  );
}
