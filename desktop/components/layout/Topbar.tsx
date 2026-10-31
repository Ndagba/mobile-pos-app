'use client';

import Link from 'next/link';
import { Search, Plus } from 'lucide-react';
import { useUiStore } from '@/store/uiStore';
import { StatusIndicators } from './StatusIndicators';
import { BranchSelector } from './BranchSelector';
import { NotificationsBell } from './NotificationsBell';

/**
 * Topbar (handoff §4.1): 60px, white, bottom divider. Left = command-palette
 * trigger styled as a search field. Right = sync pill, branch switcher, the
 * notifications bell and the primary "New sale" action.
 */
export function Topbar() {
  const setCommandOpen = useUiStore((s) => s.setCommandOpen);

  return (
    <header className="flex h-[60px] shrink-0 items-center justify-between gap-4 border-b border-divider bg-surface px-6">
      <button
        type="button"
        onClick={() => setCommandOpen(true)}
        className="flex h-9 w-full max-w-[360px] items-center gap-2.5 rounded-lg border border-border-strong bg-surface-subtle px-3 text-sm text-text-faint transition-colors hover:border-primary-border"
      >
        <Search className="h-4 w-4" />
        <span className="flex-1 text-left">Search or jump to…</span>
        <kbd className="rounded-chip border border-border-strong bg-surface px-1.5 py-0.5 font-mono text-[11px] text-text-muted">
          Ctrl K
        </kbd>
      </button>

      <div className="flex items-center gap-3">
        <StatusIndicators />
        <BranchSelector />
        <NotificationsBell />
        <Link
          href="/sales"
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover active:bg-primary-active"
        >
          <Plus className="h-4 w-4" />
          New sale
          <kbd className="ml-0.5 rounded-chip bg-white/20 px-1.5 py-0.5 font-mono text-[11px]">F2</kbd>
        </Link>
      </div>
    </header>
  );
}
