/**
 * Overview Page — Phase 2: Overview Dashboard
 *
 * Dashboard with key metrics, live transaction feed, and VPA pool health.
 */

'use client';

import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@24-7-pay/ui';
import { MetricCard } from '../components/MetricCard';
import { TransactionFeed } from '../components/TransactionFeed';
import { VPAPoolHealth } from '../components/VPAPoolHealth';
import { api } from '../hooks/useApi';
import { formatCurrency } from '../utils/format';
import { TrendingUp, TrendingDown, CreditCard, Shield } from 'lucide-react';

export function OverviewPage() {
  const { data: metrics, isLoading } = useQuery({
    queryKey: ['dashboard', 'metrics'],
    queryFn: () => api.getDashboardMetrics(),
    refetchInterval: 30000, // Refresh every 30s
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-neutral-100">Overview</h1>
        <p className="text-neutral-400 mt-1">
          Real-time payment metrics and system health
        </p>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <MetricCard
          title="Today's Volume"
          value={formatCurrency(metrics?.totalVolume || 0)}
          change={metrics?.volumeChange}
          icon={<CreditCard className="w-5 h-5" />}
        />
        <MetricCard
          title="Transactions"
          value={metrics?.totalCount || 0}
          change={metrics?.countChange}
          icon={<TrendingUp className="w-5 h-5" />}
        />
        <MetricCard
          title="Success Rate"
          value={`${metrics?.successRate || 0}%`}
          change={metrics?.successRateChange}
          icon={<TrendingUp className="w-5 h-5" />}
        />
        <MetricCard
          title="Fraud Blocked"
          value={metrics?.fraudBlocked || 0}
          icon={<Shield className="w-5 h-5" />}
          variant="danger"
        />
      </div>

      {/* Live Feed + VPA Health */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Live Transactions</CardTitle>
            </CardHeader>
            <CardContent>
              <TransactionFeed />
            </CardContent>
          </Card>
        </div>

        <div>
          <Card>
            <CardHeader>
              <CardTitle>VPA Pool Health</CardTitle>
            </CardHeader>
            <CardContent>
              <VPAPoolHealth />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
