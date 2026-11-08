/**
 * Reports Page — Phase 7: Reports
 *
 * Transaction reports and analytics.
 */

'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, Button } from '@youpi/ui';
import { api } from '../hooks/useApi';
import { formatCurrency, formatDate } from '../utils/format';

export default function ReportsPage() {
  const [range, setRange] = useState<'7d' | '30d' | '90d'>('7d');

  const { data: reports, isLoading } = useQuery({
    queryKey: ['reports', range],
    queryFn: () => api.getReports(range),
  });

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Reports</h1>
          <p className="text-neutral-400 text-sm">
            Transaction reports and analytics
          </p>
        </div>
        <div className="flex gap-2">
          {['7d', '30d', '90d'].map((r) => (
            <Button
              key={r}
              variant={range === r ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => setRange(r as '7d' | '30d' | '90d')}
            >
              {r}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="p-6">
          <p className="text-sm font-medium text-neutral-400 uppercase">Total Volume</p>
          <p className="text-3xl font-bold text-white mt-2">
            {formatCurrency(reports?.total_volume || 0)}
          </p>
        </Card>
        <Card className="p-6">
          <p className="text-sm font-medium text-neutral-400 uppercase">Total Transactions</p>
          <p className="text-3xl font-bold text-white mt-2">
            {reports?.total_transactions || 0}
          </p>
        </Card>
        <Card className="p-6">
          <p className="text-sm font-medium text-neutral-400 uppercase">Success Rate</p>
          <p className="text-3xl font-bold text-white mt-2">
            {reports?.success_rate || 0}%
          </p>
        </Card>
        <Card className="p-6">
          <p className="text-sm font-medium text-neutral-400 uppercase">Fraud Blocked</p>
          <p className="text-3xl font-bold text-white mt-2">
            {reports?.fraud_blocked || 0}
          </p>
        </Card>
      </div>

      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 h-96">
        <div className="flex h-full items-center justify-center text-neutral-500 text-sm">
          Transaction volume chart coming soon
        </div>
      </div>

      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Daily Transactions</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-neutral-400 uppercase bg-neutral-800">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Volume</th>
                <th className="px-4 py-3">Transactions</th>
                <th className="px-4 py-3">Success Rate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800">
              {reports?.daily_stats?.map((day: any) => (
                <tr key={day.date} className="hover:bg-neutral-800/50">
                  <td className="px-4 py-3 text-neutral-300 font-mono">
                    {formatDate(day.date)}
                  </td>
                  <td className="px-4 py-3 text-white text-left">
                    {formatCurrency(day.volume)}
                  </td>
                  <td className="px-4 py-3 text-white text-left">
                    {day.transactions}
                  </td>
                  <td className="px-4 py-3 text-white text-left">
                    {day.success_rate}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

