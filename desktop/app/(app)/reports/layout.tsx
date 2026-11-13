'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { canViewReports } from '@/lib/roles';
import ReportFilters from '@/components/reports/ReportFilters';
import { PageHeader } from '@/components/ui/page-header';
import { cn } from '@/lib/utils';
import { ReportContext } from './ReportContext';

const REPORT_TABS: { label: string; href: string; match?: string[] }[] = [
  { label: 'Overview', href: '/reports' },
  { label: 'Sales', href: '/reports/sales' },
  { label: 'Products', href: '/reports/products' },
  { label: 'Cashiers', href: '/reports/employees' },
  { label: 'Debt', href: '/reports/debt' },
  { label: 'Discounts', href: '/reports/discounts' },
  { label: 'End of day', href: '/reports/eod' },
  { label: 'Voids & refunds', href: '/reports/voids' },
  { label: 'Profit & loss', href: '/admin/financials/pl' },
];

interface ReportsLayoutProps {
  children: React.ReactNode;
}

export default function ReportsLayout({ children }: ReportsLayoutProps) {
  const router = useRouter();
  const pathname = usePathname();
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

  // The employee detail report (/reports/employees/<id>) renders its own header
  // and filter toolbar, so suppress the shared frame there.
  const isDetail = /^\/reports\/[^/]+\/[^/]+/.test(pathname ?? '');

  if (isDetail) {
    return <div className="p-6">{children}</div>;
  }

  const activeHref = REPORT_TABS.map((t) => t.href)
    .filter((href) => pathname === href || pathname?.startsWith(`${href}/`))
    .sort((a, b) => b.length - a.length)[0];

  return (
    <div className="space-y-5">
      <PageHeader title="Reports" subtitle="Sales, products, staff and financials." />

      {/* Sub-nav */}
      <div className="flex gap-1 overflow-x-auto border-b border-divider">
        {REPORT_TABS.map((t) => {
          const active = t.href === activeHref;
          return (
            <Link
              key={t.href}
              href={t.href}
              className={cn(
                '-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-semibold transition-colors',
                active
                  ? 'border-primary text-primary-ink'
                  : 'border-transparent text-text-muted hover:text-ink-2'
              )}
            >
              {t.label}
            </Link>
          );
        })}
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
