import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Standard page header (handoff §4): title 22/800 (−0.02em), optional subtitle,
 * and right-aligned actions with an 8px gap. Used at the top of every screen.
 */
export function PageHeader({
  title,
  subtitle,
  actions,
  className
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('mb-5 flex items-start justify-between gap-4', className)}>
      <div className="min-w-0">
        <h1 className="text-3xl font-extrabold text-ink">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}
