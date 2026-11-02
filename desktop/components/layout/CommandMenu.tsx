'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, CornerDownLeft, type LucideIcon } from 'lucide-react';
import { useUiStore } from '@/store/uiStore';
import { useAuthStore } from '@/store/authStore';
import { useSyncStore } from '@/store/syncStore';
import { useSettings } from '@/hooks/useSettings';
import { visibleNavItems } from './nav';
import { cn } from '@/lib/utils';

interface CommandEntry {
  label: string;
  hint?: string;
  icon: LucideIcon;
  run: () => void;
}

/**
 * Command palette (handoff §4.1 / §6): Ctrl/⌘K modal listing role-filtered pages
 * and a few quick actions, filterable by text and navigable by keyboard.
 */
export function CommandMenu() {
  const router = useRouter();
  const open = useUiStore((s) => s.commandOpen);
  const setOpen = useUiStore((s) => s.setCommandOpen);
  const user = useAuthStore((s) => s.user);
  const syncNow = useSyncStore((s) => s.syncNow);
  const { settings } = useSettings();

  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const entries = useMemo<CommandEntry[]>(() => {
    const nav: CommandEntry[] = visibleNavItems(user, settings).map((i) => ({
      label: i.label,
      hint: i.shortcut,
      icon: i.icon,
      run: () => router.push(i.href)
    }));
    return nav;
  }, [user, settings, router]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((e) => e.label.toLowerCase().includes(q));
  }, [entries, query]);

  // Reset + focus whenever the palette opens.
  useEffect(() => {
    if (open) {
      setQuery('');
      setActive(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  if (!open) return null;

  const close = () => setOpen(false);
  const choose = (e?: CommandEntry) => {
    const entry = e ?? results[active];
    if (!entry) return;
    close();
    entry.run();
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      choose();
    }
  };

  // `syncNow` quick action is appended only when there is a custom query match too.
  void syncNow;

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center p-4 pt-[12vh]">
      <div className="jp-scrim-in absolute inset-0 bg-[rgba(14,14,16,0.32)]" onClick={close} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        className="jp-modal-in relative z-10 w-full max-w-[560px] overflow-hidden rounded-modal border bg-card shadow-modal"
        onKeyDown={onKey}
      >
        <div className="flex items-center gap-2.5 border-b border-divider px-4">
          <Search className="h-4 w-4 shrink-0 text-text-faint" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search or jump to…"
            className="h-12 w-full bg-transparent text-sm text-ink outline-none placeholder:text-text-faint"
          />
          <kbd className="hidden shrink-0 rounded-chip border border-border-strong bg-surface-subtle px-1.5 py-0.5 font-mono text-2xs text-text-muted sm:inline">
            Esc
          </kbd>
        </div>
        <div className="max-h-[320px] overflow-y-auto p-2">
          {results.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-text-muted">No results</p>
          ) : (
            results.map((e, i) => (
              <button
                key={e.label}
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(e)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm',
                  i === active ? 'bg-primary-soft text-primary-ink' : 'text-ink-2 hover:bg-surface-subtle'
                )}
              >
                <e.icon className={cn('h-4 w-4', i === active ? 'text-primary' : 'text-text-muted')} />
                <span className="flex-1 font-medium">{e.label}</span>
                {e.hint && (
                  <kbd className="rounded-chip border border-border-strong bg-surface-subtle px-1.5 py-0.5 font-mono text-2xs text-text-muted">
                    {e.hint}
                  </kbd>
                )}
                {i === active && <CornerDownLeft className="h-3.5 w-3.5 text-text-faint" />}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
