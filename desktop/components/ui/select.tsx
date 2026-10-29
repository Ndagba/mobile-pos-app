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
        "flex h-9 w-full rounded-md border border-input bg-background px-3 py-9 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
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
