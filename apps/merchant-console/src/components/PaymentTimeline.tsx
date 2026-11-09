import { CheckCircle, XCircle, Clock, AlertTriangle, ShieldCheck, Server } from 'lucide-react';

export type PaymentTimelineStatus =
  | 'SUCCEEDED' | 'SUCCESS' | 'FAILED' | 'EXPIRED' | 'REQUIRES_CUSTOMER_ACTION'
  | 'PROCESSING' | 'PENDING' | 'CALLBACK_DELIVERED' | 'SUPPLEMENTARY_OBSERVATION';

export interface PaymentTimelineEvent {
  id?: string;
  status?: PaymentTimelineStatus | string;
  title: string;
  description?: string;
  timestamp: string;
  metadata?: Record<string, string | number | boolean | null | undefined>;
}

const STATUS_CONFIG = {
  SUCCEEDED: { icon: CheckCircle, color: 'text-emerald-300', bg: 'bg-emerald-950/30', border: 'border-emerald-700' },
  SUCCESS: { icon: CheckCircle, color: 'text-emerald-300', bg: 'bg-emerald-950/30', border: 'border-emerald-700' },
  CALLBACK_DELIVERED: { icon: Server, color: 'text-cyan-300', bg: 'bg-cyan-950/30', border: 'border-cyan-700' },
  FAILED: { icon: XCircle, color: 'text-red-300', bg: 'bg-red-950/30', border: 'border-red-700' },
  EXPIRED: { icon: XCircle, color: 'text-red-300', bg: 'bg-red-950/30', border: 'border-red-700' },
  REQUIRES_CUSTOMER_ACTION: { icon: AlertTriangle, color: 'text-amber-300', bg: 'bg-amber-950/30', border: 'border-amber-700' },
  SUPPLEMENTARY_OBSERVATION: { icon: AlertTriangle, color: 'text-amber-300', bg: 'bg-amber-950/30', border: 'border-amber-700' },
  PROCESSING: { icon: Clock, color: 'text-blue-300', bg: 'bg-blue-950/30', border: 'border-blue-700' },
  PENDING: { icon: Clock, color: 'text-slate-300', bg: 'bg-slate-900', border: 'border-slate-600' }
} as const;

function maskedMetadata(key: string, value: PaymentTimelineEvent['metadata'][string]) {
  if (value === undefined || value === null) return '—';
  const string = String(value);
  if (/bank.?reference|utr/i.test(key)) return string.length > 4 ? '••••' + string.slice(-4) : '••••';
  return string.slice(0, 160);
}

export function PaymentTimeline({ events }: { events: PaymentTimelineEvent[] }) {
  if (!events?.length) return <p className="text-sm text-slate-400">No payment events have been recorded yet.</p>;
  return (
    <ol aria-label="Payment event timeline" className="relative ml-3 my-6 pl-7 border-l-2 border-slate-700 space-y-5">
      {events.map((event, index) => {
        const config = STATUS_CONFIG[(event.status || 'PENDING') as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.PENDING;
        const Icon = config.icon;
        const time = new Date(event.timestamp);
        const dateText = Number.isNaN(time.getTime()) ? 'Unknown time' : time.toLocaleString('en-IN');
        const keys = Object.keys(event.metadata || {}).filter(k => !/token|password|secret|authorization|cookie/i.test(k));
        return (
          <li key={event.id || index} className="relative">
            <span aria-hidden="true" className={'absolute -left-[42px] top-3 p-1.5 rounded-full border-2 bg-slate-950 ' + config.border}>
              <Icon className={'w-4 h-4 ' + config.color} />
            </span>
            <div className={'rounded-xl p-4 border ' + config.bg + ' ' + config.border}>
              <div className="flex flex-wrap justify-between items-start gap-2">
                <h4 className="text-sm font-semibold text-slate-50">{event.title}</h4>
                <time dateTime={Number.isNaN(time.getTime()) ? undefined : time.toISOString()}
                  className="text-xs font-mono text-slate-300">{dateText}</time>
              </div>
              {event.description && <p className="text-xs text-slate-300 mt-1">{event.description}</p>}
              {keys.length > 0 && <dl className="mt-3 pt-3 border-t border-slate-700 grid grid-cols-2 gap-2 text-xs">
                {keys.map(key => <div key={key} className="min-w-0 flex flex-wrap gap-2 items-start">
                  {/risk|score/i.test(key) ? <ShieldCheck aria-hidden className="h-3 w-3 text-slate-400" /> :
                    /latency|ms/i.test(key) ? <Server aria-hidden className="h-3 w-3 text-slate-400" /> : null}
                  <dt className="text-slate-400 capitalize">{key.replace(/_/g, ' ')}:</dt>
                  <dd className="font-mono text-slate-100 break-words">{maskedMetadata(key, event.metadata?.[key])}</dd>
                </div>)}
              </dl>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
