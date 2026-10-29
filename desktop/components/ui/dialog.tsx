'use client';

import React, { createContext, useContext } from 'react';
import { Modal } from './modal';

interface DialogContextType {
  open: boolean;
  setOpen: (open: boolean) => void;
}

const DialogContext = createContext<DialogContextType | null>(null);

export function Dialog({
  open,
  onOpenChange,
  children
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <DialogContext.Provider value={{ open, setOpen: onOpenChange }}>
      {children}
    </DialogContext.Provider>
  );
}

export function DialogTrigger({
  children,
  onClick,
  asChild
}: {
  children: React.ReactNode;
  onClick?: () => void;
  asChild?: boolean;
}) {
  const context = useContext(DialogContext);
  if (!context) return <>{children}</>;

  return (
    <span onClick={() => context.setOpen(true)} className="contents">
      {children}
    </span>
  );
}

export function DialogContent({
  children,
  title
}: {
  children: React.ReactNode;
  title?: React.ReactNode;
}) {
  const context = useContext(DialogContext);
  if (!context) return null;

  return (
    <Modal
      open={context.open}
      onClose={() => context.setOpen(false)}
      title={title}
    >
      <div className="p-6">
        {children}
      </div>
    </Modal>
  );
}

export function DialogHeader({
  children
}: {
  children: React.ReactNode;
}) {
  return <div className="flex flex-col space-y-1.5 text-center sm:text-left">{children}</div>;
}

export function DialogTitle({
  children
}: {
  children: React.ReactNode;
}) {
  return <h2 className="text-lg font-semibold leading-none tracking-tight">{children}</h2>;
}
