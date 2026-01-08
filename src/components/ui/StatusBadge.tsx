import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

interface StatusBadgeProps {
  status: 'pass' | 'fail' | 'warning' | 'info';
  label: string;
  icon?: LucideIcon;
  className?: string;
}

export function StatusBadge({ status, label, icon: Icon, className }: StatusBadgeProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold uppercase tracking-wider",
        status === 'pass' && "status-pass",
        status === 'fail' && "status-fail",
        status === 'warning' && "status-warning",
        status === 'info' && "bg-primary/20 text-primary border border-primary/30",
        className
      )}
    >
      {Icon && <Icon className="w-3.5 h-3.5" />}
      {label}
    </div>
  );
}
