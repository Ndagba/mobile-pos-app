'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

interface DropdownMenuContextValue {
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

const DropdownMenuContext =
  React.createContext<DropdownMenuContextValue | null>(null);

function useDropdownMenu() {
  const context = React.useContext(DropdownMenuContext);

  if (!context) {
    throw new Error(
      'DropdownMenu components must be used inside DropdownMenu'
    );
  }

  return context;
}

export function DropdownMenu({
  children,
}: {
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);

  return (
    <DropdownMenuContext.Provider value={{ open, setOpen }}>
      <div className="relative inline-block text-left">
        {children}
      </div>
    </DropdownMenuContext.Provider>
  );
}

export function DropdownMenuTrigger({
  children,
  asChild = false,
}: {
  children: React.ReactNode;
  asChild?: boolean;
}) {
  const { open, setOpen } = useDropdownMenu();

  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(
      children as React.ReactElement<any>,
      {
        onClick: (event: React.MouseEvent) => {
          const childProps = (
            children as React.ReactElement<any>
          ).props;

          childProps.onClick?.(event);

          if (!event.defaultPrevented) {
            setOpen(!open);
          }
        },
      }
    );
  }

  return (
    <button
      type="button"
      onClick={() => setOpen(!open)}
    >
      {children}
    </button>
  );
}

export function DropdownMenuContent({
  children,
  align = 'start',
  className,
}: {
  children: React.ReactNode;
  align?: 'start' | 'end';
  className?: string;
}) {
  const { open, setOpen } = useDropdownMenu();

  if (!open) {
    return null;
  }

  return (
    <>
      <div
        className="fixed inset-0 z-40"
        onClick={() => setOpen(false)}
        aria-hidden="true"
      />

      <div
        className={cn(
          'absolute z-50 mt-2 min-w-[160px] rounded-md border bg-popover p-1 text-popover-foreground shadow-md',
          align === 'end' ? 'right-0' : 'left-0',
          className
        )}
      >
        {children}
      </div>
    </>
  );
}

export function DropdownMenuItem({
  children,
  onClick,
  className,
}: {
  children: React.ReactNode;
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  className?: string;
}) {
  const { setOpen } = useDropdownMenu();

  const handleClick = (
    event: React.MouseEvent<HTMLButtonElement>
  ) => {
    onClick?.(event);

    if (!event.defaultPrevented) {
      setOpen(false);
    }
  };

  return (
    <button
      type="button"
      className={cn(
        'flex w-full cursor-pointer items-center rounded-sm px-3 py-2 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground',
        className
      )}
      onClick={handleClick}
    >
      {children}
    </button>
  );
}