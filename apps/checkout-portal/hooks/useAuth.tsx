/**
 * useAuth Hook — Phase 1: Auth + App Shell
 *
 * Manages authentication state for the merchant console.
 * Handles login, MFA verification, logout, and session persistence.
 */

import { createContext, useContext, useState, useCallback, useEffect } from 'react';

export interface User {
  id: string;
  email: string;
  name: string;
  role: 'ADMIN' | 'MERCHANT' | 'VIEWER';
  merchantId: string;
  mfaEnabled: boolean;
  mfaVerified: boolean;
  createdAt: string;
}

export interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<{ mfaRequired?: boolean }>;
  verifyMFA: (code: string) => Promise<void>;
  logout: () => Promise<void>;
  logoutAndRedirect: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check for existing session on mount
    const storedUser = localStorage.getItem('youpi_merchant_user');
    if (storedUser) {
      try {
        setUser(JSON.parse(storedUser));
      } catch {
        localStorage.removeItem('youpi_merchant_user');
      }
    }
    setLoading(false);
  }, []);

  const login = async (email: string, password: string) => {
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:6100'}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Login failed');
    }

    const data = await res.json();
    const user: User = {
      id: data.user.id,
      email: data.user.email,
      name: data.user.name,
      role: data.user.role,
      merchantId: data.user.merchantId,
      mfaEnabled: data.user.mfaEnabled,
      mfaVerified: data.user.mfaVerified,
      createdAt: data.user.createdAt,
    };

    setUser(user);
    localStorage.setItem('youpi_merchant_user', JSON.stringify(user));

    if (data.mfaRequired) {
      // MFA required, redirect to MFA challenge
      return { mfaRequired: true };
    }

    return { mfaRequired: false };
  };

  const verifyMFA = async (code: string) => {
    const user = localStorage.getItem('youpi_merchant_user');
    if (!user) throw new Error('No user session found');

    const parsedUser = JSON.parse(user);
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:6100'}/api/v1/auth/verify-mfa`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: parsedUser.id,
        code,
      }),
    });

    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Verification failed');
    }

    const data = await res.json();
    const updatedUser = { ...parsedUser, mfaVerified: true };
    setUser(updatedUser);
    localStorage.setItem('youpi_merchant_user', JSON.stringify(updatedUser));
  };

  const logout = async () => {
    try {
      await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:6100'}/api/v1/auth/logout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('youpi_merchant_token') || ''}`,
        },
      });
    } catch {
      // Ignore logout errors
    }
    setUser(null);
    localStorage.removeItem('youpi_merchant_user');
    localStorage.removeItem('youpi_merchant_token');
  };

  const logoutAndRedirect = () => {
    logout();
    window.location.href = '/login';
  };

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: !!user, isLoading: loading, login, verifyMFA, logout, logoutAndRedirect }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
