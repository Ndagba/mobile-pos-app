import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        // Primary brand button (§6).
        default: 'bg-primary text-primary-foreground hover:bg-primary-hover active:bg-primary-active',
        // Destructive: danger ink on a soft danger fill (§6).
        destructive: 'bg-danger-soft text-danger hover:brightness-95',
        // Outline: white bg, strong border, ink text.
        outline: 'border border-border-strong bg-surface text-ink-2 hover:bg-surface-subtle',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        ghost: 'text-ink-2 hover:bg-surface-subtle',
        link: 'text-primary underline-offset-4 hover:text-primary-ink hover:underline'
      },
      size: {
        default: 'h-[38px] px-4',
        sm: 'h-9 px-3',
        lg: 'h-11 px-6',
        icon: 'h-9 w-9'
      }
    },
    defaultVariants: {
      variant: 'default',
      size: 'default'
    }
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button ref={ref} className={cn(buttonVariants({ variant, size, className }))} {...props} />
  )
);
Button.displayName = 'Button';

export { Button, buttonVariants };
