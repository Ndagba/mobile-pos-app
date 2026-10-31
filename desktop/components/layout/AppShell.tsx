'use client';

import type { ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { CommandMenu } from './CommandMenu';
import { useAutoSync } from '@/hooks/useAutoSync';
import { useGlobalShortcuts } from '@/hooks/useShortcuts';

/** Authenticated app chrome: sidebar + topbar + scrollable main, plus the global
 *  command palette and keyboard shortcuts (handoff §4.1 / §6). */
export function AppShell({ children }: { children: ReactNode }) {
  useAutoSync();
  useGlobalShortcuts();

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main className="flex-1 overflow-auto px-7 py-6">{children}</main>
      </div>
      <CommandMenu />
    </div>
  );
}
