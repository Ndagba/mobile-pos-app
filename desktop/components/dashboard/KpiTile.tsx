'use client';

import React from 'react';
import { TrendingUp, Package, AlertCircle, PieChart, Banknote, LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface KpiTileProps {
  icon: string;
  tone: string;
  label: string;
  value: string;
  sub: string;
}

export function KpiTile({ icon, tone, label, value, sub }: KpiTileProps) {
  const iconMap: Record<string, LucideIcon> = {
    'cash-multiple': Banknote,
    'trending-up': TrendingUp,
    'package-variant': Package,
    'alert-circle': AlertCircle,
    'chart-donut': PieChart,
  };

  const IconComponent = iconMap[icon] || Banknote;

  return (
    <div className={cn(
      "bg-card border border-border rounded-lg p-4 flex flex-col gap-1",
      "transition-all hover:border-accent/50"
    )}>
      <div
        className="w-10 h-10 rounded-md flex items-center justify-center mb-2"
        style={{ backgroundColor: tone + '1A' }}
      >
        <span style={{ color: tone }}>
          <IconComponent size={20} />
        </span>
      </div>
      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{label}</div>
      <div className="text-2xl font-bold tabular-nums tracking-tight">{value}</div>
      <div className="text-xs text-muted-foreground">{sub}</div>
    </div>
  );
}
