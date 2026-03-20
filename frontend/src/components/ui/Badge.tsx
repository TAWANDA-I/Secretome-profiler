import { clsx } from "clsx";
import type { JobStatus } from "@/types";

const variants: Record<string, string> = {
  pending:   "bg-gray-100 text-gray-600",
  running:   "bg-blue-100 text-blue-700",
  completed: "bg-green-100 text-green-700",
  failed:    "bg-red-100 text-red-700",
};

interface BadgeProps {
  status: JobStatus | string;
  className?: string;
}

export function Badge({ status, className }: BadgeProps) {
  return (
    <span
      className={clsx(
        "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium capitalize",
        variants[status] ?? "bg-gray-100 text-gray-600",
        className
      )}
    >
      {status}
    </span>
  );
}
