"use client";

import { useCallback, useEffect, useState } from 'react';
import { useApi } from '@/lib/api';
import { useSession } from './AppSession';
import { DataTable } from '@/UI/DataTable';
import { FormModal } from '@/UI/FormModal';

type Overview = {
  leases: { id: string; propertyId: string; amount: string; paymentPeriod: string; status: string; startDate: string; expireDate: string }[];
  properties: { id: string; description: string; location: string; landlordId: string }[];
  landlords: { id: string; name: string; phone: string; email: string | null }[];
  billingPeriods: { id: string; leaseId: string; startPeriod: string; endPeriod: string; amount: string; paidAmount: string; urgencyStatus: string; paymentStatus: string }[];
  payments: { id: string; leaseId: string; amount: string; transactionRef: string; paymentDate: string; paymentMethod: string }[];
  checkouts: { id: string; leaseId: string; amount: string; status: string; createdAt: string }[];
};
const money = (amount: number) => `ETB ${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const date = (value: string) => value.slice(0, 10);

export function TenantPage({ page }: { page: string }) {
  const api = useApi();
  const session = useSession();
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [payLease, setPayLease] = useState<string | null>(null);
  const [checking, setChecking] = useState<string | null>(null);
  const load = useCallback(async () => setData(await api<Overview>('/tenant/overview')), [api]);

  useEffect(() => {
    let cancelled = false;
    async function initialize() {
      try {
        const checkout = new URLSearchParams(window.location.search).get('checkout');
        if (checkout) {
          const result = await api<{ status: string }>(`/checkout/${encodeURIComponent(checkout)}/verify`, { method: 'POST' });
          if (!cancelled) setMessage(result.status === 'PAID' ? 'Payment confirmed. Your rent balance has been updated.' : 'Payment is not confirmed yet. Check its status again below.');
          window.history.replaceState(null, '', window.location.pathname);
        }
      } catch (e) { if (!cancelled) setError((e as Error).message); }
      try {
        const overview = await api<Overview>('/tenant/overview');
        if (!cancelled) setData(overview);
      } catch (e) { if (!cancelled) setError((e as Error).message); }
    }
    void initialize();
    return () => { cancelled = true; };
  }, [api]);

  async function verify(id: string) {
    setChecking(id); setError(''); setMessage('');
    try {
      const result = await api<{ status: string }>(`/checkout/${encodeURIComponent(id)}/verify`, { method: 'POST' });
      setMessage(result.status === 'PAID' ? 'Payment confirmed. Your rent balance has been updated.' : 'Payment is not confirmed yet.');
      await load();
    } catch (e) { setError((e as Error).message); } finally { setChecking(null); }
  }

  if (!data) return <div className="px-6" role="status">{error || 'Loading rental information…'}{error && <button onClick={() => void load().catch(e => setError(e.message))}>Retry</button>}</div>;
  const property = (leaseId: string) => data.properties.find(p => p.id === data.leases.find(l => l.id === leaseId)?.propertyId);
  const balance = (leaseId?: string) => data.billingPeriods.filter(b => !leaseId || b.leaseId === leaseId).reduce((sum, b) => sum + Math.max(0, Number(b.amount) - Number(b.paidAmount)), 0);
  const totalPaid = data.payments.reduce((sum, p) => sum + Number(p.amount), 0);
  const allocated = data.billingPeriods.reduce((sum, b) => sum + Number(b.paidAmount), 0);
  const payable = data.leases.filter(l => balance(l.id) > 0);
  return <div className="px-6 lg:px-12 space-y-6">
    <h1 className="page-title">{page === 'payments' ? 'Payments' : page === 'leases' ? 'Rental information' : 'My rent'}</h1>
    {error && <p role="alert" className="text-red-600">{error}</p>}
    {message && <p role="status">{message}</p>}
    <div className="grid gap-4 sm:grid-cols-3">{[
      ['Outstanding', money(balance())],
      ['Overdue', money(data.billingPeriods.filter(b => b.urgencyStatus === 'OVERDUE').reduce((sum, b) => sum + Math.max(0, Number(b.amount) - Number(b.paidAmount)), 0))],
      ['Unallocated credit', money(Math.max(0, totalPaid - allocated))],
    ].map(([label, value]) => <div className="card-base p-5" key={label}><p>{label}</p><strong>{value}</strong></div>)}</div>
    {(page === 'leases' || page === 'dashboard') && <><h2 className="text-section-title">My leases</h2><DataTable data={data.leases} getRowKey={l => l.id} emptyMessage="No leases have been linked to your account." columns={[
      { key: 'propertyId', header: 'Property', render: l => <>{property(l.id)?.description}<p>{property(l.id)?.location}</p></> },
      { key: 'id', header: 'Landlord', render: l => { const owner = data.landlords.find(o => o.id === property(l.id)?.landlordId); return owner ? <>{owner.name}<p>{owner.phone}</p>{owner.email && <p>{owner.email}</p>}</> : 'Contact unavailable'; } },
      { key: 'startDate', header: 'Term', render: l => `${date(l.startDate)} to ${date(l.expireDate)}` },
      { key: 'amount', header: 'Monthly rent', render: l => money(Number(l.amount)) },
      { key: 'paymentPeriod', header: 'Billing cycle', render: l => l.paymentPeriod.replace('_', ' ') },
      { key: 'status', header: 'Status' },
    ]}/></>}
    <h2 className="text-section-title">Rent bills</h2>
    <DataTable data={data.billingPeriods.filter(b => Number(b.amount) > 0)} getRowKey={b => b.id} emptyMessage="No rent bills yet." columns={[
      { key: 'leaseId', header: 'Property', render: b => property(b.leaseId)?.description || b.leaseId },
      { key: 'startPeriod', header: 'Period', render: b => `${date(b.startPeriod)} to ${date(b.endPeriod)}` },
      { key: 'amount', header: 'Amount', render: b => money(Number(b.amount)) },
      { key: 'paidAmount', header: 'Paid', render: b => money(Number(b.paidAmount)) },
      { key: 'id', header: 'Balance', render: b => money(Math.max(0, Number(b.amount) - Number(b.paidAmount))) },
      { key: 'paymentStatus', header: 'Status', render: b => b.paymentStatus === 'PAID' ? 'PAID' : `${b.paymentStatus.replaceAll('_', ' ')} · ${b.urgencyStatus}` },
    ]}/>
    {(page === 'payments' || page === 'dashboard') && <>
      {!session.checkoutAvailable && <p>Online payment is unavailable until Chapa is configured. Contact your landlord to arrange payment.</p>}
      {!session.user.email && <p>Add your email in the account menu to pay online or receive overdue reminders.</p>}
      <div className="flex flex-wrap gap-3">{payable.map(l => <button key={l.id} disabled={!session.checkoutAvailable || !session.user.email} onClick={() => setPayLease(l.id)} className="rounded-lg border px-4 py-2 disabled:opacity-50">Pay rent · {property(l.id)?.description}</button>)}</div>
      <FormModal key={payLease} open={!!payLease} onClose={() => setPayLease(null)} title="Pay rent with Chapa" description={`Outstanding: ${money(balance(payLease || ''))}. Chapa processes your ETB payment.`} fields={[{ name: 'amount', label: 'Amount (ETB)', type: 'number', required: true, min: '0.01', max: String(balance(payLease || '')), step: '0.01' }]} submitLabel="Continue to Chapa" onSubmit={async values => {
        const result = await api<{ checkout: { checkoutUrl: string } }>('/checkout', { method: 'POST', body: JSON.stringify({ leaseId: payLease, amount: values.amount }) });
        window.location.assign(result.checkout.checkoutUrl);
      }}/>
      <h2 className="text-section-title">Payment history</h2><DataTable data={data.payments} getRowKey={p => p.id} emptyMessage="No payments recorded yet." columns={[
        { key: 'transactionRef', header: 'Reference' },
        { key: 'leaseId', header: 'Property', render: p => property(p.leaseId)?.description || p.leaseId },
        { key: 'amount', header: 'Amount', render: p => money(Number(p.amount)) },
        { key: 'paymentDate', header: 'Date', render: p => date(p.paymentDate) },
        { key: 'paymentMethod', header: 'Method', render: p => p.paymentMethod.replace('_', ' ') },
      ]}/>
      <h2 className="text-section-title">Online checkouts</h2><DataTable data={data.checkouts} getRowKey={c => c.id} emptyMessage="No online checkouts yet." columns={[
        { key: 'createdAt', header: 'Started', render: c => date(c.createdAt) },
        { key: 'amount', header: 'Amount', render: c => money(Number(c.amount)) },
        { key: 'status', header: 'Status' },
        { key: 'id', header: '', render: c => c.status !== 'PAID' && <button disabled={!!checking || !session.checkoutAvailable} onClick={() => void verify(c.id)}>{checking === c.id ? 'Checking…' : 'Check payment status'}</button> },
      ]}/>
    </>}
  </div>;
}
