"use client";
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from './AppSession';
import { useApi } from '@/lib/api';

export function AccountMenu() {
  const { user, refresh } = useSession();
  const api = useApi();
  const router = useRouter();
  const [email, setEmail] = useState(user.email || '');
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState(false);
  return <details className="relative"><summary className="cursor-pointer">{user.name}</summary><div className="absolute right-0 z-50 w-80 rounded-lg border bg-background p-4 shadow-lg">
    <p>{user.phone}</p><form className="space-y-3" onSubmit={async e => { e.preventDefault(); if (pending) return; setPending(true); setMessage(''); try { await api('/auth/me', { method: 'PATCH', body: JSON.stringify({ email: email.trim() }) }); await refresh(); setMessage('Email saved.'); } catch (e) { setMessage(e instanceof Error ? e.message : 'Unable to save'); } finally { setPending(false); } }}>
      <label className="block">Email for rent reminders<input className="input-base w-full" aria-label="Account email" type="email" required value={email} onChange={e => setEmail(e.target.value)} /></label>
      <button className="button button-primary" disabled={pending}>{pending ? 'Saving…' : 'Save email'}</button><p role="status">{message}</p>
    </form><button className="button button-outline mt-3" onClick={() => { sessionStorage.removeItem('digirent_token'); router.replace('/login'); }}>Sign out</button>
  </div></details>;
}
