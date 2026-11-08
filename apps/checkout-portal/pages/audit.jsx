/**
 * Audit Page — Phase 7: Audit Logs
 *
 * View audit trail of all system activities for compliance and security.
 */

'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, Badge } from '@24-7-pay/ui';
import { api } from '../hooks/useApi';
import { formatDate } from '../utils/format';

export function AuditPage() {
  const [filter, setFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');

  const { data: auditLogs, isLoading } = useQuery({
    queryKey: ['audit-log', filter, sourceFilter],
    queryFn: () => api.getAuditLogs({ filter, sourceFilter }),
  });

  const statusColor = (status: string) => {
    switch (status) {
      case 'SUCCESS':
        return 'text-emerald-400';
      case 'FAILED':
        return 'text-red-400';
      case 'REJECTED':
        return 'text-amber-400';
      default:
        return 'text-neutral-400';
    }
  };

  return (
    <div className="space-y-8 max-w-full mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Audit Logs</h2>
          <p className="text-neutral-400 text-sm">
            View all audit trail events
          </p>
        </div>
        <div className="flex gap-4">
          <select
            className="text-xs text-white bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary-500 focus:outline-none"
            value={filter}
            onChange={(e) => setFilter(e.target.value as any)}
          >
            <option value="all">All Activities</option>
            <option value="payment.created">Payment Created</option>
            <option value="payment.verified">Payment Verified</option>
            <option value="payment.failed">Payment Failed</option>
            <option value="fraud_detected">Fraud Detected</option>
            <option value="user.login">User Login</option>
          </select>
          <select
            className="bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-neutral-300 focus:ring-2 focus:ring-primary-500 focus:outline-none"
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value as any)}
          >
            <option value="all">All Sources</option>
            <option value="system">System</option>
            <option value="merchant">Merchant</option>
            <option value="admin">Admin</option>
          </select>
        </div>
      </div>

      <div className="bg-neutral-950 border border-white/10 rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-neutral-800 border-b border-white/10">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase">
                Time
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase">
                Actor
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase">
                Action
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase">
                Resource
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase">
                Status
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {auditLogs?.map((log) => (
              <tr key={log.id} className="hover:bg-white/5">
                <td className="px-4 py-3 text-xs font-mono text-neutral-400">
                  {formatDate(log.created_at)}
                </td>
                <td className="px-4 py-3 text-sm text-white font-medium">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-white/5 flex items-center justify-center text-white/60 text-xs">
                      {actorInitials(log.actor)}
                    </span>
                    <span className="ml-2">{log.actor}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-sm font-mono text-white">
                  {log.action}
                </td>
                <td className="px-4 py-3 text-sm text-neutral-400 font-mono">
                  {log.resource_type}
                </td>
                <td className="px-4 py-3 text-sm font-medium">
                  <Badge variant={getStatusVariant(log.status)}>
                    {log.status}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getStatusVariant(status: string): 'success' | 'danger' | 'warning' | 'default' {
  switch (status) {
    case 'SUCCESS':
      return 'success';
    case 'FAILED':
      return 'danger';
    case 'REJECTED':
      return 'warning';
    default:
      return 'default';
  }
}

function actorInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}
