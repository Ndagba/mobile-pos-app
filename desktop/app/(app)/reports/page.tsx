'use client';

import React from 'react';
import Link from 'next/link';
import { BarChart3, TrendingUp, Package, Users, Wallet, AlertCircle, Landmark } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default function ReportsPage() {
  const reports = [
    {
      title: 'Profit & Loss Report',
      description: 'Analyze revenue, direct costs, operating expenses, and net profit.',
      href: '/admin/financials/pl',
      icon: Landmark,
      color: 'text-indigo-500',
    },
    {
      title: 'Sales Report',
      description: 'Analyze revenue, profit, and transaction trends over time.',
      href: '/reports/sales',
      icon: TrendingUp,
      color: 'text-emerald-500',
    },
    {
      title: 'Product Performance',
      description: 'Identify your best-selling products and high-margin items.',
      href: '/reports/products',
      icon: Package,
      color: 'text-blue-500',
    },
    {
      title: 'Employee Activity',
      description: 'Track sales performance and productivity by staff member.',
      href: '/reports/employees',
      icon: Users,
      color: 'text-purple-500',
    },
    {
      title: 'Outstanding Debt',
      description: 'Manage customer balances and track total credit risk.',
      href: '/reports/debt',
      icon: AlertCircle,
      color: 'text-rose-500',
    },
    {
      title: 'Discount Analysis',
      description: 'Monitor discount usage and identify revenue leakage.',
      href: '/reports/discounts',
      icon: Wallet,
      color: 'text-amber-500',
    },
  ];

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Business Intelligence</h1>
        <p className="text-muted-foreground">Deep-dive analytics to optimize your store's performance.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {reports.map((report) => (
          <Link key={report.href} href={report.href}>
            <Card className="h-full transition-all hover:ring-2 hover:ring-primary hover:shadow-md group cursor-pointer">
              <CardHeader className="flex flex-row items-center gap-4">
                <div className={`p-3 rounded-lg bg-muted ${report.color}`}>
                  <report.icon className="h-6 w-6" />
                </div>
                <CardTitle className="text-lg group-hover:text-primary transition-colors">
                  {report.title}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  {report.description}
                </p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
