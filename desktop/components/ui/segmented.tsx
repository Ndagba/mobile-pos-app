'use client';

import { cn } from '@/lib/utils';

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  /** Optional count shown after the label (handoff §4.5 tab counts). */
  count?: number;
}

/**
 * Segmented tab bar (handoff §4.5): a muted track with a white, shadowed active
 * segment. Also used for sub-nav (reports) and small toggles (product/service).
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className,
  size = 'md'
}: {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
  size?: 'sm' | 'md';
}) {
  return (
    <div
      className={cn(
        'inline-flex items-center gap-1 rounded-seg bg-muted p-[3px]',
        className
      )}
      role="tablist"
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.value)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-[7px] font-semibold transition-colors',
              size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-sm',
              active
                ? 'bg-surface text-ink shadow-segment'
                : 'text-[#6A687C] hover:text-ink-2'
            )}
          >
            {opt.label}
            {opt.count !== undefined && (
              <span
                className={cn(
                  'rounded-pill px-1.5 font-mono text-2xs',
                  active ? 'bg-primary-soft text-primary-ink' : 'bg-surface/70 text-text-faint'
                )}
              >
                {opt.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
