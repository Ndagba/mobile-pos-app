'use client';

import { Users, Star, Activity, Wallet, AlertCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { naira } from '@jaypos/shared';
import { cn } from '@/lib/utils';

interface CustomerStatsProps {
  total: number;
  vips: number;
  active30d: number;
  lifetimeSpend: number;
  outstanding: number;
}

export function CustomerStats({
  total,
  vips,
  active30d,
  lifetimeSpend,
  outstanding,
}: CustomerStatsProps) {
  const stats = [
    {
      label: 'Total Customers',
      value: total,
      icon: Users,
      color: 'text-blue-600',
    },
    {
      label: 'VIP Customers',
      value: vips,
      icon: Star,
      color: 'text-amber-600',
    },
    {
      label: 'Active (30d)',
      value: active30d,
      icon: Activity,
      color: 'text-emerald-600',
    },
    {
      label: 'Lifetime Spend',
      value: naira(lifetimeSpend),
      icon: Wallet,
      color: 'text-indigo-600',
    },
    {
      label: 'Outstanding',
      value: naira(outstanding),
      icon: AlertCircle,
      color: 'text-red-600',
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
      {stats.map((stat) => (
        <Card key={stat.label}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground">{stat.label}</p>
                <p className="text-lg font-bold">{stat.value}</p>
              </div>
              <stat.icon className={cn('h-5 w-5', stat.color)} />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
