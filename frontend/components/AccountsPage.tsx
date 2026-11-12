"use client";
import { useCallback, useEffect, useState } from 'react';
import { useApi } from '@/lib/api';
import { DataTable } from '@/UI/DataTable';

type User = { id: string; name: string; phone: string; email: string | null; role: string; isActive: boolean };
export function AccountsPage() {
  const api = useApi();
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const load = useCallback(async () => { const data = await api<{ users: User[] }>('/admin/users'); setUsers(data.users); }, [api]);
  useEffect(() => { let active = true; api<{ users: User[] }>('/admin/users').then(data => { if (active) setUsers(data.users); }).catch(e => { if (active) setError(e.message); }); return () => { active = false; }; }, [api]);
  async function activate(user: User) {
    if (pending) return;
    setPending(true); setError('');
    try { await api(`/admin/users/${user.id}`, { method: 'PATCH', body: JSON.stringify({ isActive: !user.isActive }) }); await load(); } catch (e) { setError(e instanceof Error ? e.message : 'Unable to update account'); } finally { setPending(false); }
  }
  return <section className="space-y-5"><h1 className="page-title">Account activation</h1><p>Review registrations and activate accounts manually.</p>{error && <p role="alert">{error}</p>}
    <DataTable<User> columns={[{ key: 'name', header: 'Name' }, { key: 'phone', header: 'Phone' }, { key: 'email', header: 'Email' }, { key: 'role', header: 'Role' }, { key: 'isActive', header: 'Status', render: u => u.isActive ? 'Active' : 'Inactive' }, { key: 'id', header: 'Action', render: u => u.role === 'ADMIN' ? 'Administrator' : <button className="button button-outline" disabled={pending} onClick={() => void activate(u)}>{u.isActive ? 'Deactivate' : 'Activate'} {u.name}</button> }]} data={users} getRowKey={u => u.id} />
  </section>;
}
