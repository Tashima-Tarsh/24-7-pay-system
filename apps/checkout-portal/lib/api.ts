const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://127.0.0.1:6100';

export interface PaymentCreateRequest {
  orderId: string;
  amount: string;
  currency?: string;
  merchantId?: string;
  customer?: { name?: string; email?: string; mobileNumber?: string };
  returnUrl?: string;
  deviceId?: string;
  autoActivate?: boolean;
  metadata?: Record<string, any>;
}

export interface PaymentCreateResponse {
  paymentId: string;
  orderId: string;
  amount: string;
  amountPaise: string;
  baseAmount: string;
  baseAmountPaise: string;
  paiseOffset: number;
  currency: string;
  status: string;
  queuePosition: number;
  customer: any;
  checkoutUrl: string;
}

export interface PaymentDetail {
  paymentId: string;
  orderId: string;
  amount: string;
  amountPaise: string;
  currency: string;
  status: string;
  method?: string;
  completedAt?: string | null;
  metadata?: { receivingVpa?: string; upiId?: string; payeeName?: string };
  receivingVpa?: string;
}

export interface VerifyCallbackRequest {
  token: string;
  utr: string;
  responseCode: string;
  amount: string;
  fingerprint: string;
  returnedAt: number;
  appOpenedAt: number;
}

export interface VerifyCallbackResponse {
  verdict: string;
  reason?: string;
  code?: string;
  order_id?: string;
  payment_id?: string;
  utr?: string;
  status?: string;
  verified_at?: string;
}

export interface Metrics {
  totalCollected: string;
  totalPayments: number;
  successfulPayments: string;
  awaitingConfirmation: number;
}

function getHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  const merchantId = localStorage.getItem('merchantId');
  const merchantKey = localStorage.getItem('merchantKey');
  if (merchantId) headers['X-Merchant-Id'] = merchantId;
  if (merchantKey) headers['X-Merchant-Key'] = merchantKey;
  return { ...headers, ...extra };
}

export async function apiRequest<T>(
  path: string,
  { method = 'GET', body, headers = {} }: { method?: string; body?: any; headers?: Record<string, string> } = {}
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: getHeaders(headers),
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(errorText || `Request failed with status ${res.status}`);
  }
  return res.json();
}

export async function createPayment(data: PaymentCreateRequest): Promise<PaymentCreateResponse> {
  return apiRequest<PaymentCreateResponse>('/api/v1/payments', { method: 'POST', body: data });
}

export async function getPayment(paymentId: string): Promise<PaymentDetail> {
  return apiRequest<PaymentDetail>(`/api/v1/payments/${encodeURIComponent(paymentId)}`);
}

export async function verifyCallback(
  paymentId: string,
  data: VerifyCallbackRequest
): Promise<VerifyCallbackResponse> {
  return apiRequest<VerifyCallbackResponse>(
    `/api/v1/payments/${encodeURIComponent(paymentId)}/verify-callback`,
    { method: 'POST', body: data }
  );
}

export async function getMetrics(): Promise<Metrics> {
  return apiRequest<Metrics>('/api/v1/dashboard/metrics');
}

export async function getPayments(): Promise<PaymentDetail[]> {
  return apiRequest<PaymentDetail[]>('/api/v1/payments');
}

export function storeAuth(merchantId: string, merchantKey: string): void {
  localStorage.setItem('merchantId', merchantId);
  localStorage.setItem('merchantKey', merchantKey);
}

export function getAuth(): { merchantId: string | null; merchantKey: string | null } {
  return {
    merchantId: localStorage.getItem('merchantId'),
    merchantKey: localStorage.getItem('merchantKey'),
  };
}

export function clearAuth(): void {
  localStorage.removeItem('merchantId');
  localStorage.removeItem('merchantKey');
}

export function isAuthenticated(): boolean {
  return !!localStorage.getItem('merchantId') && !!localStorage.getItem('merchantKey');
}
