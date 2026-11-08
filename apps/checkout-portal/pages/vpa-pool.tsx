/**
 * VPAPool Page — Phase 5: VPA Pool Management
 *
 * Displays receiving account pool with health scores, fraud scores,
 * and manual freeze/thaw controls.
 */

'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, Button, Badge, Input } from '@youpi/ui';
import { Dialog } from '@radix-ui/react-dialog';
import { api } from '../hooks/useApi';
import { useToast } from '../hooks/useToast';
import { cn } from '@youpi/ui/utils';
import { Plus, Snowflake, Sun, Trash2 } from 'lucide-react';

export default function VPAPoolPage() {
  const queryClient = useQueryClient();
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [newVPA, setNewVPA] = useState('');
  const [bankName, setBankName] = useState('');
  const { toast } = useToast();

  const { data: vpaPool } = useQuery({
    queryKey: ['vpa-pool'],
    queryFn: () => api.getVPAPool(),
  });

  const addVPAMutation = useMutation({
    mutationFn: (data: { vpa: string; bank_name: string }) => api.addVPA(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vpa-pool'] });
      setAddModalOpen(false);
      setNewVPA('');
      setBankName('');
      toast.success('VPA added to pool');
    },
  });

  const freezeMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      api.freezeVPA(id, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vpa-pool'] });
      toast.success('VPA frozen');
    },
  });

  const thawMutation = useMutation({
    mutationFn: (id: string) => api.thawVPA(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vpa-pool'] });
      toast.success('VPA thawed');
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-neutral-100">VPA Pool</h1>
          <p className="text-neutral-400 mt-1">
            Manage receiving accounts and monitor health scores
          </p>
        </div>
        <Button onClick={() => setAddModalOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Add VPA
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {vpaPool?.map((vpa) => (
          <Card key={vpa.id}>
            <div className="p-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <p className="font-mono text-lg text-neutral-100">{vpa.vpa}</p>
                  <p className="text-sm text-neutral-400 mt-1">{vpa.bank_name}</p>
                </div>
                <Badge variant={getStatusVariant(vpa.status)}>
                  {vpa.status}
                </Badge>
              </div>

              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-neutral-400">Health Score</span>
                  <span className={cn(
                    'text-lg font-bold',
                    vpa.health_score >= 70 && 'text-success-500',
                    vpa.health_score >= 40 && vpa.health_score < 70 && 'text-warning-500',
                    vpa.health_score < 40 && 'text-danger-500'
                  )}>
                    {vpa.health_score}/100
                  </span>
                </div>
                <div className="w-full bg-neutral-700 rounded-full h-2">
                  <div
                    className={cn(
                      'h-2 rounded-full transition-all',
                      vpa.health_score >= 70 && 'bg-success-500',
                      vpa.health_score >= 40 && vpa.health_score < 70 && 'bg-warning-500',
                      vpa.health_score < 40 && 'bg-danger-500'
                    )}
                    style={{ width: `${vpa.health_score}%` }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center mb-4">
                <div className="p-2 rounded-lg bg-neutral-800">
                  <p className="text-xs text-neutral-400">Tx Today</p>
                  <p className="text-lg font-bold text-neutral-100">
                    {vpa.daily_tx_count}/25
                  </p>
                </div>
                <div className="p-2 rounded-lg bg-neutral-800">
                  <p className="text-xs text-neutral-400">Inflow</p>
                  <p className="text-lg font-bold text-neutral-100">
                    ${(vpa.daily_inflow_paise / 100).toFixed(0)}
                  </p>
                </div>
                <div className="p-2 rounded-lg bg-neutral-800">
                  <p className="text-xs text-neutral-400">Senders</p>
                  <p className="text-lg font-bold text-neutral-100">
                    {vpa.unique_senders_24h}/20
                  </p>
                </div>
              </div>

              <div className="flex gap-2">
                {vpa.status === 'ACTIVE' && (
                  <Button
                    variant="secondary"
                    size="sm"
                    className="flex-1"
                    onClick={() => {
                      const reason = prompt('Reason for freezing:');
                      if (reason) freezeMutation.mutate({ id: vpa.id, reason });
                    }}
                  >
                    <Snowflake className="w-4 h-4 mr-2" />
                    Freeze
                  </Button>
                )}
                {vpa.status === 'FROZEN' && (
                  <Button
                    variant="success"
                    size="sm"
                    className="flex-1"
                    onClick={() => thawMutation.mutate(vpa.id)}
                  >
                    <Sun className="w-4 h-4 mr-2" />
                    Thaw
                  </Button>
                )}
              </div>
            </div>
          </Card>
        ))}
      </div>

      <div className="bg-neutral-900 border border-neutral-700 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-neutral-100 mb-4">Add New VPA</h3>
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="block text-sm font-medium text-neutral-400 mb-2">
              VPA Address
            </label>
            <Input
              value={newVPA}
              onChange={(e) => setNewVPA(e.target.value)}
              placeholder="merchant@sbi"
              className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-primary-500 focus:outline-none"
            />
          </div>
          <div className="flex-1">
            <label className="block text-sm font-medium text-neutral-400 mb-2">
              Bank Name
            </label>
            <Input
              value={bankName}
              onChange={(e) => setBankName(e.target.value)}
              placeholder="State Bank of India"
              className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-primary-500 focus:outline-none"
            />
          </div>
          <div className="flex-1">
            <Button
              variant="primary"
              className="flex-1"
              onClick={() => addVPAMutation.mutate({ vpa: newVPA, bank_name: bankName })}
              loading={addVPAMutation.isPending}
            >
              Add VPA
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function getStatusVariant(status: string): 'success' | 'warning' | 'danger' | 'default' {
  switch (status) {
    case 'ACTIVE':
      return 'success';
    case 'WARMING':
    case 'COOLING':
      return 'warning';
    case 'FROZEN':
      return 'danger';
    default:
      return 'default';
  }
}
