import { clsx } from "clsx";

interface ProgressBarProps {
  value: number;
  status?: string;
  label?: string;
  className?: string;
}

const trackColors: Record<string, string> = {
  completed: "bg-green-500",
  failed:    "bg-red-500",
  running:   "bg-blue-500",
  pending:   "bg-gray-300",
};

export function ProgressBar({ value, status = "running", label, className }: ProgressBarProps) {
  const color = trackColors[status] ?? trackColors.running;
  return (
    <div className={clsx("space-y-1", className)}>
      {label && <p className="text-xs text-gray-500">{label}</p>}
      <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
        <div
          className={clsx("h-2 rounded-full transition-all duration-500", color)}
          style={{ width: `${Math.min(value, 100)}%` }}
        />
      </div>
    </div>
  );
}
