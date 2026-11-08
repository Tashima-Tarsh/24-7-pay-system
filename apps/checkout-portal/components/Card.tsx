import React from 'react';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  header?: React.ReactNode;
  children: React.ReactNode;
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

export function Card({ className, header, children, padding = 'md', ...props }: CardProps) {
  const paddingClasses: Record<string, string> = {
    none: '',
    sm: 'p-3',
    md: 'p-4',
    lg: 'p-6',
  };
  return (
    <div
      className={`rounded-xl bg-white border border-slate-200 shadow-sm ${paddingClasses[padding]} ${className ?? ''}`}
      {...props}
    >
      {header && <div className="mb-3">{header}</div>}
      {children}
    </div>
  );
}

interface MetricCardProps {
  title: string;
  value: string;
  subtitle?: string;
  trend?: { value: string; label: string };
  icon?: React.ReactNode;
}

export function MetricCard({ title, value, subtitle, trend, icon }: MetricCardProps) {
  return (
    <Card padding="md" className="h-full">
      <div className="flex items-start justify-between mb-2">
        <div>
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">{title}</p>
          <p className="text-2xl font-bold text-slate-900">{value}</p>
          {subtitle && <p className="text-xs text-slate-400">{subtitle}</p>}
        </div>
        {icon && <div className="p-2 rounded-lg bg-slate-100 text-slate-500">{icon}</div>}
      </div>
      {trend && (
        <div className="mt-2 flex items-center gap-1">
          <span className="text-xs font-medium text-emerald-600">{trend.value}</span>
          <span className="text-xs text-slate-400">{trend.label}</span>
        </div>
      )}
    </Card>
  );
}
