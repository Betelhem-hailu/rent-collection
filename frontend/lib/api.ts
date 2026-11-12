"use client";

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';

export function useApi() {
  const router = useRouter();

  return useCallback(async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
    const token = sessionStorage.getItem('digirent_token');
    if (!token) {
      router.replace('/login');
      throw new Error('Please sign in');
    }
    const response = await fetch(`/api/v1${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...options.headers },
      cache: 'no-store',
    });
    if (response.status === 401) {
      sessionStorage.removeItem('digirent_token');
      router.replace('/login');
      throw new Error('Please sign in');
    }
    const result = await response.json().catch(() => null);
    if (!response.ok) throw new Error(result?.error || result?.message || 'Request failed');
    return result as T;
  }, [router]);
}
