import { clsx } from "clsx";
import type { JobStatus } from "@/types";

const statusVariants: Record<string, string> = {
  pending:   "bg-gray-100 text-gray-600",
  running:   "bg-blue-100 text-blue-700",
  completed: "bg-green-100 text-green-700",
  failed:    "bg-red-100 text-red-700",
};

const namedVariants: Record<string, string> = {
  success:   "bg-green-100 text-green-700",
  warning:   "bg-amber-100 text-amber-700",
  danger:    "bg-red-100 text-red-700",
  secondary: "bg-gray-100 text-gray-600",
  info:      "bg-blue-100 text-blue-700",
};

interface BadgeProps {
  status?: JobStatus | string;
  variant?: string;
  children?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export function Badge({ status, variant, children, className, style }: BadgeProps) {
  const resolvedClass =
    (variant && namedVariants[variant]) ??
    (status && (statusVariants[status] ?? namedVariants[status])) ??
    "bg-gray-100 text-gray-600";

  return (
    <span
      className={clsx(
        "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium capitalize",
        resolvedClass,
        className
      )}
      style={style}
    >
      {children ?? status}
    </span>
  );
}
