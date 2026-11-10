"use client";
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { DataTable, type Column } from '@/UI/DataTable';
import { FormModal, type FormField } from '@/UI/FormModal';
import { NewLeaseForm } from '@/components/NewLeaseForm';
import { PropertyDetails, type Property as PropertyView } from '@/components/PropertyDetails';
import { LeaseDetails } from '@/components/LeaseDetails';
import type { Lease } from '@/Data/leaseData';
type Property = {
    id: string;
    description: string;
    location: string;
    rooms: number;
    size: string;
    propertyTypeId: number;
};
type RawLease = {
    id: string;
    propertyId: string;
    tenantId: string;
    amount: string;
    status: string;
    paymentPeriod: string;
    startDate: string;
    expireDate: string;
    gracePeriod: number;
};
type Tenant = {
    id: string;
    name: string;
    phone: string;
};
type Bill = {
    id: string;
    leaseId: string;
    startPeriod: string;
    endPeriod: string;
    amount: string;
    paidAmount: string;
    urgencyStatus: string;
    paymentStatus: string;
};
type Payment = {
    id: string;
    leaseId: string;
    amount: string;
    transactionRef: string;
    paymentDate: string;
    paymentMethod: string;
};
type Overview = {
    name: string;
    properties: Property[];
    leases: RawLease[];
    tenants: Tenant[];
    billingPeriods: Bill[];
    payments: Payment[];
    propertyTypes: {
        id: number;
        name: string;
    }[];
};
const money = (n: number) => `ETB ${n.toLocaleString()}`;
const date = (s: string) => s.slice(0, 10);
export function LandlordPage({ page }: {
    page: 'dashboard' | 'properties' | 'leases' | 'tenants' | 'payments';
}) {
    const [data, setData] = useState<Overview | null>(null);
    const [error, setError] = useState('');
    const [open, setOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    const [selectedProperty, setSelectedProperty] = useState<string | null>(null);
    const [selected, setSelected] = useState<string | null>(null);
    const [extraTenants, setExtraTenants] = useState<Tenant[]>([]);
    const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
    const load = useCallback(async () => { try {
        setData(await api<Overview>('/landlord/overview'));
        setError('');
    }
    catch (e) {
        setError((e as Error).message);
    } }, []);
    useEffect(() => {
        let cancelled = false;
        api<Overview>('/landlord/overview').then(result => {
            if (!cancelled) setData(result);
        }).catch(error => {
            if (!cancelled) setError(error instanceof Error ? error.message : 'Unable to load landlord data');
        });
        return () => { cancelled = true; };
    }, []);
    async function mutate(path: string, body: unknown, method = 'POST') {
        setBusy(true);
        setError('');
        try {
            await api(path, { method, body: JSON.stringify(body) });
            await load();
        }
        catch (e) {
            setError((e as Error).message);
            throw e;
        }
        finally {
            setBusy(false);
        }
    }
    if (!data)
        return <div className="pl-20" role="status">{error || 'Loading?'}{error && <button onClick={() => void load()}>Retry</button>}</div>;
    const tenantName = (id: string) => data.tenants.find(t => t.id === id)?.name || id;
    const propertyName = (id: string) => data.properties.find(p => p.id === id)?.description || id;
    const balance = (leaseId: string) => data.billingPeriods.filter(b => b.leaseId === leaseId).reduce((n, b) => n + Math.max(0, Number(b.amount) - Number(b.paidAmount)), 0);
    const leases: Lease[] = data.leases.map(l => ({ id: l.id, propertyId: l.propertyId, tenantId: l.tenantId, property: propertyName(l.propertyId), tenant: tenantName(l.tenantId), contact: data.tenants.find(t => t.id === l.tenantId)?.phone || '', status: l.status === 'ACTIVE' ? 'Active' : l.status === 'TERMINATED' ? 'Terminated' : 'Ended', rent: Number(l.amount), billingCycle: l.paymentPeriod.toLowerCase() as Lease['billingCycle'], startDate: date(l.startDate), endDate: date(l.expireDate), graceDays: l.gracePeriod, lateFeePercent: 0, onTimePayment: 0, billingPeriods: data.billingPeriods.filter(b => b.leaseId === l.id).map(b => { const grace = new Date(b.startPeriod); grace.setUTCDate(grace.getUTCDate() + l.gracePeriod); return { id: b.id, periodStart: date(b.startPeriod), periodEnd: date(b.endPeriod), due: date(b.startPeriod), graceEnds: grace.toISOString().slice(0, 10), amount: Number(b.amount) }; }) }));
    const leaseColumns: Column<Lease>[] = [{ key: 'tenant', header: 'Tenant' }, { key: 'property', header: 'Property' }, { key: 'contact', header: 'Contact' }, { key: 'rent', header: 'Rent', render: l => money(l.rent) }, { key: 'status', header: 'Status' }, { key: 'id', header: '', render: l => <button onClick={() => setSelected(l.id)}>View</button> }];
    const paymentColumns: Column<Payment>[] = [{ key: 'transactionRef', header: 'Reference' }, { key: 'leaseId', header: 'Tenant / Property', render: p => { const l = data.leases.find(l => l.id === p.leaseId); return l ? `${tenantName(l.tenantId)} / ${propertyName(l.propertyId)}` : p.leaseId; } }, { key: 'amount', header: 'Amount', render: p => money(Number(p.amount)) }, { key: 'paymentDate', header: 'Date', render: p => date(p.paymentDate) }, { key: 'paymentMethod', header: 'Method' }];
    const fields: FormField[] = [{ name: 'description', label: 'Property description', required: true }, { name: 'location', label: 'Location', required: true }, { name: 'rooms', label: 'Rooms', type: 'number', required: true }, { name: 'size', label: 'Size (square feet)', type: 'number', required: true }, { name: 'propertyTypeId', label: 'Property type', type: 'select', required: true, options: data.propertyTypes.map(t => ({ label: t.name, value: String(t.id) })) }];
    const property = data.properties.find(p => p.id === selectedProperty);
    const propertyLeases = leases.filter(l => l.propertyId === selectedProperty);
    const activeLease = propertyLeases.find(l => l.status === 'Active');
    const propertyView: PropertyView | null = property ? { id: property.id, name: property.description, location: property.location, type: `${data.propertyTypes.find(t => t.id === property.propertyTypeId)?.name || ''}, ${property.rooms} rooms`, status: activeLease ? 'Occupied' : 'Vacant', utilities: 'Not specified', tenant: activeLease?.tenant || 'Vacant', leaseTerms: activeLease ? `${activeLease.startDate} to ${activeLease.endDate}` : 'No active lease', nextPayment: activeLease?.billingPeriods.find(b => b.due >= new Date().toISOString().slice(0, 10))?.due || 'No upcoming bill', outstanding: money(propertyLeases.reduce((n, l) => n + balance(l.id), 0)), price: activeLease ? money(activeLease.rent) : 'No active rent', leases: propertyLeases.map(l => ({ tenant: l.tenant, term: `${l.startDate} to ${l.endDate}`, status: l.status === 'Active' ? 'Active' : 'Ended' })) } : null;
    const tenantOptions = [...new Map([...data.tenants, ...extraTenants].map(t => [t.id, t])).values()];
    async function patch(id: string, body: unknown) { try {
        await mutate(`/landlord/leases/${id}`, body, 'PATCH');
    }
    catch { } }
    return <div className="pl-20 pr-10 space-y-6">
    <PropertyDetails property={propertyView} onClose={() => setSelectedProperty(null)}/><h1 className="page-title capitalize">{page}</h1>
    {error && <p role="alert" className="text-red-600">{error}</p>}
    {busy && <p role="status">Saving?</p>}
    {page === 'dashboard' && <><p>Hello, {data.name}</p><div className="grid grid-cols-4 gap-4">{[
                ['Collected', money(data.payments.reduce((n, p) => n + Number(p.amount), 0))],
                ['Outstanding', money(data.leases.reduce((n, l) => n + balance(l.id), 0))],
                ['Overdue', money(data.billingPeriods.filter(b => b.urgencyStatus === 'OVERDUE').reduce((n, b) => n + Math.max(0, Number(b.amount) - Number(b.paidAmount)), 0))],
                ['Tenants', String(data.tenants.length)]
            ].map(([label, value]) => <div className="card-base p-5" key={label}><p>{label}</p><strong>{value}</strong></div>)}</div><h2>Recent transactions</h2><DataTable columns={paymentColumns} data={[...data.payments].sort((a, b) => b.paymentDate.localeCompare(a.paymentDate)).slice(0, 10)} getRowKey={p => p.id} emptyMessage="No transactions yet."/></>}
    {page === 'properties' && <><p>{data.properties.length} properties</p><button onClick={() => setOpen(true)}>Add property</button><FormModal open={open} onClose={() => setOpen(false)} title="Add property" fields={fields} onSubmit={async (values) => { await mutate('/landlord/properties', values); }}/><DataTable columns={[{ key: 'description', header: 'Property', render: p => <button onClick={() => setSelectedProperty(p.id)}>{p.description}</button> }, { key: 'location', header: 'Location' }, { key: 'rooms', header: 'Rooms' }, { key: 'size', header: 'Size (sq ft)' }, { key: 'id', header: 'Occupancy', render: p => data.leases.some(l => l.propertyId === p.id && l.status === 'ACTIVE') ? 'Occupied' : 'Vacant' }]} data={data.properties} getRowKey={p => p.id} emptyMessage="No properties yet."/></>}
    {page === 'tenants' && <DataTable columns={[{ key: 'name', header: 'Tenant' }, { key: 'phone', header: 'Contact' }, { key: 'id', header: 'Properties', render: t => data.leases.filter(l => l.tenantId === t.id).map(l => propertyName(l.propertyId)).join(', ') }, { key: 'id', header: 'Balance', render: t => money(data.leases.filter(l => l.tenantId === t.id).reduce((n, l) => n + balance(l.id), 0)) }]} data={data.tenants} getRowKey={t => t.id} emptyMessage="No tenants linked to your leases yet."/>}
    {page === 'payments' && <><p className="text-subtitle">Receipts are recorded separately from billing allocations. Recording a receipt does not reduce bill balances.</p><button onClick={() => setOpen(true)}>Record payment</button><FormModal open={open} onClose={() => setOpen(false)} title="Record payment" fields={[{ name: 'leaseId', label: 'Lease', type: 'select', required: true, options: leases.map(l => ({ label: `${l.tenant} / ${l.property}`, value: l.id })) }, { name: 'amount', label: 'Amount (ETB)', type: 'number', required: true }, { name: 'transactionRef', label: 'Transaction reference', required: true }, { name: 'paymentMethod', label: 'Method', type: 'select', required: true, options: ['CASH', 'MOBILE_MONEY', 'BANK'].map(value => ({ label: value.replace('_', ' '), value })) }]} onSubmit={async (values) => { await mutate('/payments', values); }}/><div className="flex gap-4"><label>Month <input type="month" value={month} onChange={e => setMonth(e.target.value)}/></label></div><DataTable columns={paymentColumns} data={data.payments.filter(p => p.paymentDate.startsWith(month))} getRowKey={p => p.id} emptyMessage="No payments this month."/></>}
    {page === 'leases' && <><DataTable columns={leaseColumns} data={leases} getRowKey={l => l.id} emptyMessage="No leases yet."/><form onSubmit={async (e) => { e.preventDefault(); const form = e.currentTarget; const phone = String(new FormData(form).get('phone')); try {
        const result = await api<{
            tenant: Tenant;
        }>('/landlord/tenants', { method: 'POST', body: JSON.stringify({ phone }) });
        setExtraTenants(ts => [...ts, result.tenant]);
        setError('');
        form.reset();
    }
    catch (e) {
        setError((e as Error).message);
    } }}><label>Find registered tenant by phone <input name="phone" type="tel" required/></label><button>Find tenant</button></form><NewLeaseForm properties={data.properties.map(p => ({ label: p.description, value: p.id }))} tenants={tenantOptions.map(t => ({ label: t.name, value: t.id }))} onCreate={async (l) => { await mutate('/landlord/leases', { propertyId: l.propertyId, tenantId: l.tenantId, rentAmount: l.rent, paymentPeriod: l.billingCycle.toUpperCase(), startDate: l.startDate, expireDate: l.endDate, gracePeriod: l.graceDays, terms: '' }); }}/><LeaseDetails key={selected} lease={leases.find(l => l.id === selected) || null} onClose={() => setSelected(null)} onSaveTerms={(id, t) => void patch(id, { gracePeriod: t.graceDays })} onTerminate={id => void patch(id, { status: 'TERMINATED' })} onRenew={id => { const l = leases.find(l => l.id === id)!; const end = new Date(l.endDate); end.setUTCFullYear(end.getUTCFullYear() + 1); void patch(id, { expireDate: end.toISOString().slice(0, 10) }); }}/></>}
  </div>;
}
