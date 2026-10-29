'use client';

import React, { useState } from 'react';
import { useAuthStore } from '@/store/authStore';
import { useBranchStore } from '@/store/branchStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Calendar as CalendarIcon } from 'lucide-react';
import { useAnalytics } from '@/hooks/useAnalytics';
import { naira } from '@jaypos/shared';

interface ReportFiltersProps {
  onFilterChange: (filters: { dateFrom: string; dateTo: string; branchId: string }) => void;
}

export default function ReportFilters({ onFilterChange }: ReportFiltersProps) {
  const { selectedBranchId } = useBranchStore();
  const [dateFrom, setDateFrom] = useState(
    new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().split('T')[0]
  );
  const [dateTo, setDateTo] = useState(new Date().toISOString().split('T')[0]);

  const branchId = selectedBranchId || '';

  React.useEffect(() => {
    onFilterChange({ dateFrom, dateTo, branchId });
  }, [dateFrom, dateTo, branchId]);

  return (
    <div className="flex flex-wrap items-end gap-4 p-4 bg-muted/30 rounded-lg border">
      <div className="space-y-2">
        <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">From Date</label>
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
        <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">To Date</label>
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
      <div className="flex-1" />
      <div className="text-right">
        <p className="text-xs text-muted-foreground mb-1">Viewing Branch</p>
        <p className="text-sm font-bold">{selectedBranchId ? 'Selected Branch' : 'All Branches'}</p>
      </div>
    </div>
  );
}
