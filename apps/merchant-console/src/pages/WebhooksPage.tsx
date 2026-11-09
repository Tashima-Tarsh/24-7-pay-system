import { useState } from 'react';
import { Play, CheckCircle, XCircle, Clock } from 'lucide-react';

export interface WebhookTestResult {
  success: boolean;
  test: true;
  status_code: number | null;
  duration_ms: number;
  error_code?: string | null;
  message: string;
  response_body?: string;
  delivery_id?: string;
}

interface WebhookTesterProps {
  webhookUrl: string | null;
  // Inject your app's authenticated API client. The current production
  // workspace uses plain JavaScript, so its active implementation is in
  // public/assets/247-portal.js. This component is for a future React shell.
  onTest: () => Promise<WebhookTestResult>;
}

export function WebhookTester({ webhookUrl, onTest }: WebhookTesterProps) {
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<WebhookTestResult | null>(null);

  const runTest = async () => {
    if (testing) return;
    setTesting(true);
    setResult(null);
    try {
      setResult(await onTest());
    } catch (error) {
      setResult({ success: false, test: true, status_code: null, duration_ms: 0,
        error_code: 'REQUEST_FAILED', message: error instanceof Error ? error.message : 'Network error' });
    } finally {
      setTesting(false);
    }
  };
  return (
    <section aria-label="Webhook connectivity test" className="mt-6 p-6 rounded-xl border border-slate-700 bg-slate-900/60">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-50">Test webhook endpoint</h3>
          <p className="text-xs text-slate-300 mt-1">Send a signed WEBHOOK_TEST. No payment or bank credit is created.</p>
        </div>
        <button type="button" disabled={testing || !webhookUrl} onClick={runTest}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-cyan-300 text-slate-950 font-semibold disabled:opacity-50">
          {testing ? <Clock aria-hidden className="h-4 w-4 animate-spin" /> : <Play aria-hidden className="h-4 w-4" />}
          {testing ? 'Sending test…' : 'Send test payload'}
        </button>
      </div>
      {!webhookUrl && <p className="text-amber-200 text-xs mt-3">Configure your public HTTPS webhook URL in Business settings first.</p>}
      <div aria-live="polite" role="status">
        {result && <div className={'mt-4 rounded-lg p-4 border text-sm ' +
          (result.success ? 'border-emerald-700 bg-emerald-950/30' : 'border-red-700 bg-red-950/30')}>
          <div className="flex items-center gap-2">
            {result.success ? <CheckCircle aria-hidden className="w-4 h-4 text-emerald-300" /> :
              <XCircle aria-hidden className="w-4 h-4 text-red-300" />}
            <strong className="text-slate-50">{result.success ? 'Test acknowledged' : 'Test not acknowledged'}</strong>
            <span className="ml-auto text-slate-300">{result.duration_ms} ms</span>
          </div>
          <p className="mt-2 text-xs text-slate-200">{result.message}</p>
          <p className="mt-1 text-xs text-slate-300">HTTP {result.status_code ?? 'no response'} · {result.error_code || 'No error'}</p>
          {result.response_body && <pre className="mt-2 whitespace-pre-wrap break-all text-xs text-slate-200">{result.response_body}</pre>}
          <p className="mt-2 text-xs text-slate-300">Test delivery is not proof of a completed payment.</p>
        </div>}
      </div>
    </section>
  );
}

// The current live app uses public/assets/247-portal.js; this is a React-ready
// page for a future merchant console build, without inventing an API client.
export function WebhooksPage(props: WebhookTesterProps) {
  return <main><WebhookTester {...props} /></main>;
}
