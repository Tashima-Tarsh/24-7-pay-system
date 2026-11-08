/**
 * MetricCard — Phase 2: Overview Dashboard
 *
 * Displays a single metric card with value, optional change indicator,
 * and optional icon.
 */

import { Card } from '@youpi/ui';
import { cn } from '@youpi/ui/utils';
import { TrendingUp, TrendingDown } from 'lucide-react';

interface MetricCardProps {
  title: string;
  value: string | number;
  change?: number;
  icon: React.ReactNode;
  variant?: 'default' | 'success' | 'danger';
}

export function MetricCard({
  title,
  value,
  change,
  icon: Icon,
  variant = 'default',
}: MetricCardProps) {
  return (
    <Card>
      <div className="p-6">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-neutral-400">{title}</p>
          <div className={cn(
            'p-2 rounded-lg',
            variant === 'success' && 'bg-success-500/10 text-success-500',
            variant === 'danger' && 'bg-danger-500/10 text-danger-500',
            variant === 'default' && 'bg-primary-500/10 text-primary-500'
          )}>
            {Icon}
          </div>
        </div>
        <div className="mt-4">
          <p className="text-3xl font-bold text-neutral-100">{value}</p>
          {change !== undefined && (
            <div className="flex items-center mt-2">
              {change >= 0 ? (
                <TrendingUp className="w-4 h-4 text-success-500" />
              ) : (
                <TrendingDown className="w-4 h-4 text-danger-500" />
              )}
              <span className={cn(
                'ml-1 text-sm font-medium',
                change >= 0 ? 'text-success-500' : 'text-danger-500'
              )}>
                {Math.abs(change)}%
              </span>
              <span className="ml-2 text-sm text-neutral-400">
                vs yesterday
              </span>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
