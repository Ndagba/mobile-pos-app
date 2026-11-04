import React from 'react';

/**
 * Pass-through layout for the expenses section. Each page owns its header and
 * spacing (and the app shell supplies the page padding), so this no longer adds a
 * section title — that only duplicated the per-page headers.
 */
export default function ExpenseLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
