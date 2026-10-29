import React from 'react';

export default function ExpenseLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Expense Management</h1>
          <p className="text-muted-foreground">Track and organize business expenditures.</p>
        </div>
      </div>
      {children}
    </div>
  );
}
