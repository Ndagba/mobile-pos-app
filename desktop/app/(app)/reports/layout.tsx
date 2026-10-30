'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { canViewReports } from '@/lib/roles';
import ReportFilters from '@/components/reports/ReportFilters';
import { ReportContext } from './ReportContext';

interface ReportsLayoutProps {
  children: React.ReactNode;
}

export default function ReportsLayout({ children }: ReportsLayoutProps) {
  const router = useRouter();
  const { user } = useAuthStore();
  const [reportFilters, setReportFilters] = React.useState({
    dateFrom: '',
    dateTo: '',
    branchId: '',
  });

  // Reports are admin/manager only — send cashiers back to their dashboard.
  const allowed = canViewReports(user);
  React.useEffect(() => {
    if (user && !allowed) router.replace('/dashboard');
  }, [user, allowed, router]);

  if (user && !allowed) return null;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Business Reports</h1>
      </div>

      <ReportFilters onFilterChange={setReportFilters} />

      <div className="report-content">
        <ReportContext.Provider value={reportFilters}>
          {children}
        </ReportContext.Provider>
      </div>
    </div>
  );
}
