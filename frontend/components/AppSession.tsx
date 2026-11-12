"use client";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useApi } from '@/lib/api';

export type Session = { user: { id: string; name: string; phone: string; email: string | null; businessRole: 'LANDLORD' | 'TENANT' | 'ADMIN' | null }; checkoutAvailable: boolean; emailNotificationsAvailable: boolean };
const Context = createContext<(Session & { refresh: () => Promise<void> }) | null>(null);
export function useSession() {
  const session = useContext(Context);
  if (!session) throw new Error('Account session is unavailable');
  return session;
}
export function AppSession({ children }: { children: ReactNode }) {
  const api = useApi();
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState('');
  const refresh = useCallback(async () => {
    const result = await api<Session>('/auth/me');
    setSession(result);
    setError('');
  }, [api]);
  useEffect(() => { let active = true; api<Session>('/auth/me').then(result => { if (active) setSession(result); }).catch(e => { if (active) setError(e.message); }); return () => { active = false; }; }, [api]);
  if (!session) return <main className="p-8" role="status">{error || 'Loading your account…'}{error && <button className="button button-primary" onClick={() => void refresh().catch(e => setError(e.message))}>Retry</button>}</main>;
  return <Context.Provider value={{ ...session, refresh }}>{children}</Context.Provider>;
}
