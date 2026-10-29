'use client';

import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { StatusIndicators } from './StatusIndicators';
import { Button } from '@/components/ui/button';
import { BranchSelector } from './BranchSelector';

export function Topbar() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  const handleLogout = async () => {
    await logout();
    router.replace('/login');
  };

  return (
    <header className="flex h-16 items-center justify-between border-b bg-background px-6">
      <div className="flex flex-col">
        <BranchSelector />
        <span className="text-xs text-muted-foreground">
          {user ? `${user.first_name || user.email} · ${user.role}` : ''}
        </span>
      </div>
      <div className="flex items-center gap-4">
        <StatusIndicators />
        <Button variant="ghost" size="sm" onClick={handleLogout}>
          <LogOut className="h-4 w-4" />
          Sign out
        </Button>
      </div>
    </header>
  );
}
