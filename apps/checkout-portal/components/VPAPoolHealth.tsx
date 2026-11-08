/**
 * VPAPoolHealth Component — Phase 2: Overview Dashboard
 *
 * Displays health scores for VPAs in the pool with visual indicators.
 */

import { useQuery } from '@tanstack/react-query';
import { api } from '../hooks/useApi';
import { cn } from '@youpi/ui/utils';

export function VPAPoolHealth() {
  const { data: vpaPool } = useQuery({
    queryKey: ['vpa-pool'],
    queryFn: () => api.getVPAPool(),
  });

  const healthDistribution = {
    healthy: vpaPool?.filter((v) => v.health_score >= 70).length || 0,
    warning: vpaPool?.filter((v) => v.health_score >= 40 && v.health_score < 70).length || 0,
    critical: vpaPool?.filter((v) => v.health_score < 40).length || 0,
  };

  return (
    <div className="space-y-4">
      {/* Health Distribution */}
      <div className="grid grid-cols-3 gap-3">
        <div className="text-center p-3 rounded-lg bg-success-500/10">
          <p className="text-2xl font-bold text-success-500">
            {healthDistribution.healthy}
          </p>
          <p className="text-xs text-neutral-400 mt-1">Healthy</p>
        </div>
        <div className="text-center p-3 rounded-lg bg-warning-500/10">
          <p className="text-2xl font-bold text-warning-500">
            {healthDistribution.warning}
          </p>
          <p className="text-xs text-neutral-400 mt-1">Warning</p>
        </div>
        <div className="text-center p-3 rounded-lg bg-danger-500/10">
          <p className="text-2xl font-bold text-danger-500">
            {healthDistribution.critical}
          </p>
          <p className="text-xs text-neutral-400 mt-1">Critical</p>
        </div>
      </div>

      {/* VPA List */}
      <div className="space-y-2">
        {vpaPool?.slice(0, 5).map((vpa) => (
          <div key={vpa.id} className="flex items-center justify-between p-3 rounded-lg bg-neutral-800/50">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-mono text-neutral-100 truncate">
                {vpa.vpa}
              </p>
              <p className="text-xs text-neutral-400">
                {vpa.daily_tx_count}/25 tx
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div
                className="w-16 bg-neutral-700 rounded-full h-1.5"
              >
                <div
                  className={cn(
                    'h-1.5 rounded-full transition-all',
                    vpa.health_score >= 70 && 'bg-success-500',
                    vpa.health_score >= 40 && vpa.health_score < 70 && 'bg-warning-500',
                    vpa.health_score < 40 && 'bg-danger-500'
                  )}
                  style={{ width: `${vpa.health_score}%` }}
                />
              </div>
              <span className="text-xs font-medium text-neutral-300 w-8 text-right">
                {vpa.health_score}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
