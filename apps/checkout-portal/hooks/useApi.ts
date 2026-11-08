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
    ...options.headers,
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
