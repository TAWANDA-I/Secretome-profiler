import { clsx } from "clsx";

interface SpinnerProps { size?: "sm" | "md" | "lg"; className?: string; }

const sizes = { sm: "h-4 w-4", md: "h-6 w-6", lg: "h-10 w-10" };

export function Spinner({ size = "md", className }: SpinnerProps) {
  return (
    <svg
      className={clsx("animate-spin text-primary-600", sizes[size], className)}
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
      <path fill="currentColor" className="opacity-75"
        d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}
