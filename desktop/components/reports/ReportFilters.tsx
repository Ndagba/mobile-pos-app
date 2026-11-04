'use client';

import React, { useState } from 'react';
import { useBranchStore } from '@/store/branchStore';
import { useBranches } from '@/hooks/useBranches';
import { Input } from '@/components/ui/input';
import { Calendar as CalendarIcon } from 'lucide-react';

interface ReportFiltersProps {
  onFilterChange: (filters: { dateFrom: string; dateTo: string; branchId: string }) => void;
}

export default function ReportFilters({ onFilterChange }: ReportFiltersProps) {
  const { selectedBranchId } = useBranchStore();
  const branchesQ = useBranches();
  const branches = branchesQ.data ?? [];

  const [dateFrom, setDateFrom] = useState(
    new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().split('T')[0]
  );
  const [dateTo, setDateTo] = useState(new Date().toISOString().split('T')[0]);
  // Seed from the global branch selector; the dropdown below can override it
  // per-report without touching the app-wide selection.
  const [branchId, setBranchId] = useState(selectedBranchId || '');

  React.useEffect(() => {
    onFilterChange({ dateFrom, dateTo, branchId });
  }, [dateFrom, dateTo, branchId]);

  const branchName = branchId ? branches.find((b) => b.id === branchId)?.name : undefined;

  return (
    <div className="flex flex-wrap items-end gap-4 rounded-lg border bg-muted/30 p-4">
      <div className="space-y-2">
        <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          From Date
        </label>
        <div className="relative">
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="pl-8"
          />
          <CalendarIcon className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
        </div>
      </div>
      <div className="space-y-2">
        <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          To Date
        </label>
        <div className="relative">
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="pl-8"
          />
          <CalendarIcon className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
        </div>
      </div>
      <div className="space-y-2">
        <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Branch
        </label>
        <select
          value={branchId}
          onChange={(e) => setBranchId(e.target.value)}
          className="h-[38px] rounded-lg border border-border-strong bg-surface px-3 text-sm text-ink-2 focus:outline-none"
        >
          <option value="">All branches</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </div>
      <div className="flex-1" />
      <div className="text-right">
        <p className="mb-1 text-xs text-muted-foreground">Viewing Branch</p>
        <p className="text-sm font-bold">{branchName ?? 'All Branches'}</p>
      </div>
    </div>
  );
}
