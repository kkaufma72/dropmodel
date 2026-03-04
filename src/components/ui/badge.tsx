type BadgeVariant = "success" | "warning" | "error" | "default";

const variantStyles: Record<BadgeVariant, string> = {
  success: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  warning: "bg-amber-50 text-amber-700 ring-amber-600/20",
  error: "bg-red-50 text-red-700 ring-red-600/20",
  default: "bg-gray-50 text-gray-600 ring-gray-500/20",
};

interface BadgeProps {
  variant?: BadgeVariant;
  children: React.ReactNode;
  className?: string;
}

export function Badge({ variant = "default", children, className = "" }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${variantStyles[variant]} ${className}`}
    >
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { variant: BadgeVariant; label: string }> = {
    READY: { variant: "success", label: "Ready" },
    PROCESSING: { variant: "warning", label: "Processing" },
    ERROR: { variant: "error", label: "Error" },
  };

  const { variant, label } = config[status] ?? { variant: "default" as BadgeVariant, label: status };

  return <Badge variant={variant}>{label}</Badge>;
}
