'use client';

import { naira } from '@jaypos/shared';

/**
 * Grouped bar chart for the dashboard's "Sales performance" card: one pair of bars
 * per day — this period (solid) against the previous one (light) — scaled to the
 * max value across both series. Purely presentational; the page supplies the
 * already-bucketed daily arrays (role/branch scoping happens server-side).
 */
export function WeekBars({
  thisWeek,
  lastWeek,
  labels,
  hideAmounts,
}: {
  thisWeek: number[];
  lastWeek: number[];
  labels: string[];
  hideAmounts?: boolean;
}) {
  const max = Math.max(1, ...thisWeek, ...lastWeek);
  const pct = (v: number) => (v > 0 ? Math.max(3, (v / max) * 100) : 0);
  const tip = (label: string, v: number) =>
    hideAmounts ? label : `${label}: ${naira(v)}`;

  return (
    <div className="flex h-full items-end gap-2">
      {labels.map((label, i) => (
        <div key={label + i} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-2">
          <div className="flex h-full w-full items-end justify-center gap-1">
            <div
              className="w-2.5 rounded-t-sm bg-primary/25"
              style={{ height: `${pct(lastWeek[i] ?? 0)}%` }}
              title={tip(`Last · ${label}`, lastWeek[i] ?? 0)}
            />
            <div
              className="w-2.5 rounded-t-sm bg-primary"
              style={{ height: `${pct(thisWeek[i] ?? 0)}%` }}
              title={tip(`This · ${label}`, thisWeek[i] ?? 0)}
            />
          </div>
          <span className="text-2xs text-text-muted">{label}</span>
        </div>
      ))}
    </div>
  );
}
