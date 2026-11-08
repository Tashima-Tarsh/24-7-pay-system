import { cn } from "./utils/cn";

export interface CardProps
  extends React.HTMLAttributes<HTMLDivElement> {}

export function Card({ className, children, ...props }: CardProps) {
  return (
    <div
      className={cn("rounded-xl border border-neutral-800 bg-neutral-900 shadow-sm", className)}
      {...props}
    >
      {children}
    </div>
  );
}

export interface CardHeaderProps
  extends React.HTMLAttributes<HTMLDivElement> {}

export function CardHeader({ className, children, ...props }: CardHeaderProps) {
  return (
    <div className={cn("flex flex-col space-y-1.5 p-6", className)} {...props}>
      {children}
    </div>
  );
}

export function CardTitle({ className, children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3 className={cn("text-lg font-semibold leading-none tracking-tight text-neutral-100", className)} {...props}>
      {children}
    </h3>
  );
}

export function CardContent({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("pt-0", className)} {...props}>
      {children}
    </div>
  );
}

export function CardFooter({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("flex items-center pt-6", className)} {...props}>
      {children}
    </div>
  );
}

export function CardTitleWithActions({
  className,
  title,
  actions,
}: {
  className?: string;
  title: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className={cn("flex items-center justify-between", className)}>
      <h3 className="text-lg font-semibold leading-none tracking-tight text-neutral-100">
        {title}
      </h3>
      <div className="flex items-center gap-2">{actions}</div>
    </div>
  );
}
