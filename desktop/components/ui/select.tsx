import * as React from "react"
import { cn } from "@/lib/utils"

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  onValueChange?: (value: string) => void;
  defaultValue?: string;
}

export function Select({
  className,
  onValueChange,
  defaultValue,
  ...props
}: SelectProps) {
  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    if (onValueChange) onValueChange(e.target.value);
    if (props.onChange) props.onChange(e);
  };

  return (
    <select
      className={cn(
        "flex h-[38px] w-full rounded-lg border border-border-strong bg-surface px-3 text-sm text-ink-2 transition-colors focus:outline-none disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      defaultValue={defaultValue}
      onChange={handleChange}
      {...props}
    />
  );
}

export function SelectTrigger({ children, ...props }: any) {
  // In a native implementation, the Trigger is the Select itself.
  // This is a dummy component to maintain API compatibility.
  return <>{children}</>;
}

export function SelectValue({ placeholder }: { placeholder?: string }) {
  // In a native implementation, the value is handled by the <select>
  return null;
}

export function SelectContent({ children }: { children: React.ReactNode }) {
  // In a native implementation, the content is the list of <option>s
  return <>{children}</>;
}

export function SelectItem({ value, children }: { value: string; children: React.ReactNode }) {
  return <option value={value}>{children}</option>;
}
