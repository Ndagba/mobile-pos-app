'use client';

import type { ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { useAutoSync } from '@/hooks/useAutoSync';

/** Authenticated app chrome: fixed sidebar + sticky topbar + scrollable main. */
export function AppShell({ children }: { children: ReactNode }) {
  // Seed connectivity + pending count and drain the sync queue on reconnect.
  useAutoSync();

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>
    </div>
  );
}
