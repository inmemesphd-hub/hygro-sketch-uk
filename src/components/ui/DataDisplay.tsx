import { cn } from "@/lib/utils";
import { ReactNode } from "react";

interface DataDisplayProps {
  label: string;
  value: string | number;
  unit?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function DataDisplay({ label, value, unit, size = 'md', className }: DataDisplayProps) {
  return (
    <div className={cn("flex flex-col gap-0.5", className)}>
      <span className="data-label">{label}</span>
      <div className="flex items-baseline gap-1">
        <span
          className={cn(
            "data-value font-mono",
            size === 'sm' && "text-sm",
            size === 'md' && "text-base",
            size === 'lg' && "text-xl font-semibold"
          )}
        >
          {value}
        </span>
        {unit && <span className="data-unit">{unit}</span>}
      </div>
    </div>
  );
}

interface DataCardProps {
  title: string;
  children: ReactNode;
  className?: string;
  action?: ReactNode;
}

export function DataCard({ title, children, className, action }: DataCardProps) {
  return (
    <div className={cn("panel", className)}>
      <div className="panel-header">
        <span className="panel-title">{title}</span>
        {action}
      </div>
      <div className="panel-content">{children}</div>
    </div>
  );
}
