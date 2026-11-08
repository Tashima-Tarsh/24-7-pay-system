import { cn } from "./utils/cn";

export interface SkeletonProps
  extends React.HTMLAttributes<HTMLDivElement> {}

export function Skeleton({ className, ...props }: SkeletonProps) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-neutral-800", className)}
      {...props}
    />
  );
}

export function SkeletonLine({ className, width = "100%", ...props }: SkeletonProps & { width?: string | number }) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-neutral-800 h-4 w-full", className)}
      style={{ width }}
      {...props}
    />
  );
}

export function SkeletonCircle({ className, size = "24px", ...props }: SkeletonProps & { size?: string | number }) {
  return (
    <div
      className={cn("animate-pulse rounded-full bg-neutral-800 h-4 w-4", className)}
      style={{ width: size, height: size }}
      {...props}
    />
  );
}
