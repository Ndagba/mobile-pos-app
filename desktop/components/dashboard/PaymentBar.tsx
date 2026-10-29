'use client';

import React from 'react';

interface PaymentBarProps {
  breakdown: Array<{
    method: string;
    total: number;
  }>;
  totalAmount: number;
}

export function PaymentBar({ breakdown, totalAmount }: PaymentBarProps) {
  const colors: Record<string, string> = {
    cash: '#10B981', // green
    card: '#3B82F6', // blue
    transfer: '#F59E0B', // amber
  };

  if (!breakdown || breakdown.length === 0) return null;

  return (
    <div className="space-y-4">
      <div className="h-3 w-full bg-muted rounded-full overflow-hidden flex">
        {breakdown.map((p, i) => {
          const pct = totalAmount > 0 ? (p.total / totalAmount) * 100 : 0;
          return (
            <div
              key={p.method}
              style={{
                width: `${pct}%`,
                backgroundColor: colors[p.method] || '#6366F1',
                transition: 'width 0.3s ease'
              }}
            />
          );
        })}
      </div>
      <div className="grid grid-cols-2 gap-x-8 gap-y-2">
        {breakdown.map((p) => (
          <div key={p.method} className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <div
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: colors[p.method] || '#6366F1' }}
              />
              <span className="text-muted-foreground capitalize">{p.method.replace('_', ' ')}</span>
            </div>
            <span className="font-medium tabular-nums">
              {((p.total / (totalAmount || 1)) * 100).toFixed(1)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
