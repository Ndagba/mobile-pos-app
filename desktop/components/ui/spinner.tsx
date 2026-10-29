import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('h-5 w-5 animate-spin text-muted-foreground', className)} />;
}

/** Centered full-viewport spinner, used while the session hydrates. */
export function FullscreenSpinner() {
  return (
    <div className="flex h-screen w-screen items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-2">
        <Spinner className="h-12 w-12 text-primary" />
        <p className="text-sm text-muted-foreground">Loading session...</p>
      </div>
    </div>
  );
}
