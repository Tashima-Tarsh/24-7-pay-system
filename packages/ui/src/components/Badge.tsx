import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "./utils/cn";

const badgeVariants = cva(
  "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors",
  {
    variants: {
      variant: {
        default: "bg-neutral-800 text-neutral-300",
        success: "bg-success-500/10 text-success-500 ring-1 ring-success-500/20",
        warning: "bg-warning-500/10 text-warning-500 ring-1 ring-warning-500/20",
        danger: "bg-danger-500/10 text-danger-500 ring-1 ring-danger-500/20",
        info: "bg-info-500/10 text-info-500 ring-1 ring-info-500/20",
        outline: "border border-neutral-700 text-neutral-300",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}
