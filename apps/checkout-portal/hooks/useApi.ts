/**
 * API Client — Phase 1: Auth + App Shell
 *
 * Centralized API client for all backend API calls.
 * Handles authentication headers, error handling, and response parsing.
 */

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:6100';

const API_HEADERS: Record<string, string> = {
  'Content-Type': 'application/json',
};

export async function apiRequest(
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  const token = localStorage.getItem('youpi_merchant_token');
  const headers: Record<string, string> = {
    ...API_HEADERS,
    ...(((options.headers as Record<string, string> | undefined) ?? {})),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || `Request failed: ${res.status}`);
  }

  return res;
}

export async function apiGet(path: string, params?: Record<string, string>): Promise<any> {
  const url = new URL(`${BASE_URL}${path}`);
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.append(key, value);
    });
  }

  const res = await apiRequest(url.toString(), { method: 'GET' });
  return res.json();
}

export async function apiPost(path: string, body: any): Promise<any> {
  const res = await apiRequest(`${BASE_URL}${path}`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return res.json();
}

export async function apiPut(path: string, body: any): Promise<any> {
  const res = await apiRequest(`${BASE_URL}${path}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
  return res.json();
}

export async function apiDelete(path: string): Promise<any> {
  const res = await apiRequest(`${BASE_URL}${path}`, {
    method: 'DELETE',
  });
  return res.json();
}

export const api = {
  getDashboardMetrics: () => apiGet('/api/v1/dashboard/metrics'),
  getPayments: (params?: { search?: string; status?: string; limit?: number }) =>
    apiGet('/api/v1/payments', {
      ...(params?.search ? { search: params.search } : {}),
      ...(params?.status ? { status: params.status } : {}),
      ...(params?.limit ? { limit: String(params.limit) } : {}),
    }),
  getPaymentDetail: (paymentId: string) =>
    apiGet(`/api/v1/payments/${encodeURIComponent(paymentId)}`),
  getVPAPool: () => apiGet('/api/v1/vpa-pool'),
  getRecentTransactions: (limit: number) =>
    apiGet('/api/v1/transactions/recent', { limit: String(limit) }),
  addVPA: (data: { vpa: string; bank_name: string }) =>
    apiPost('/api/v1/vpa-pool', data),
  freezeVPA: (id: string, reason: string) =>
    apiPost(`/api/v1/vpa-pool/${encodeURIComponent(id)}/freeze`, { reason }),
  thawVPA: (id: string) =>
    apiPost(`/api/v1/vpa-pool/${encodeURIComponent(id)}/thaw`, {}),
  put: (path: string, body: any) => apiPut(path, body),
  del: (path: string) => apiDelete(path),
  getWebhookConfig: () => apiGet('/api/v1/webhooks/config'),
  testWebhook: (webhookUrl: string) =>
    apiPost('/api/v1/webhooks/test', { webhook_url: webhookUrl }),
  updateWebhookConfig: (data: { webhook_url: string }) =>
    apiPost('/api/v1/webhooks/config', data),
  getAuditLogs: (params?: { filter?: string; sourceFilter?: string }) =>
    apiGet('/api/v1/audit-logs', params),
  getReports: (range: string) => apiGet(`/api/v1/reports?range=${encodeURIComponent(range)}`),
  getQuarantinedOrders: () => apiGet('/api/v1/quarantine'),
  verifyQuarantinedOrder: (orderId: string) =>
    apiPost(`/api/v1/quarantine/${encodeURIComponent(orderId)}/verify`, {}),
  rejectQuarantinedOrder: (orderId: string) =>
    apiPost(`/api/v1/quarantine/${encodeURIComponent(orderId)}/reject`, {}),
  getTeamMembers: () => apiGet('/api/v1/team'),
  addTeamMember: (data: { name: string; email: string; role: string }) =>
    apiPost('/api/v1/team', data),
};
