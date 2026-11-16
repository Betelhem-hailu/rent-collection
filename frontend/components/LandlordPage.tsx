"use client";
import { useCallback, useEffect, useState } from 'react';
import { useApi } from '@/lib/api';
import { DataTable, type Column } from '@/UI/DataTable';
import { FormModal } from '@/UI/FormModal';
import { NewPropertyForm } from './NewPropertyForm';
import { LoadingSpinner } from './LoadingSpinner';
import { NewLeaseForm } from '@/components/NewLeaseForm';
import { PropertyDetails, type Property as PropertyView } from '@/components/PropertyDetails';
import { LeaseDetails } from '@/components/LeaseDetails';
import type { Lease } from '@/Data/leaseData';
import { useSession } from './AppSession';
import { Button } from '@/UI/Button';
import { ProgressBar } from '@/UI/ProgressBar';
import styles from './LandlordDashboard.module.css';
import { PropertiesGrid } from './PropertiesGrid';
import propertyStyles from './PropertiesGrid.module.css';
type Property = {
    id: string;
    description: string;
    location: string;
    rooms: number;
    size: string;
    propertyTypeId: number;
    imageData?: string | null;
    utilities?: string | null;
    additionalUtilities?: string | null;
};
type RawLease = {
    id: string;
    propertyId: string;
    tenantUserId: string;
    amount: string;
    status: string;
    paymentPeriod: string;
    startDate: string;
    expireDate: string;
    gracePeriod: number;
    terms: string;
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
    businessDate: string;
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

function LandlordDashboard({ data, busy, remindersAvailable, onRemind }: {
    data: Overview;
    busy: boolean;
    remindersAvailable: boolean;
    onRemind: (leaseId: string) => void;
}) {
    const now = new Date();
    const monthParts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Africa/Nairobi', year: 'numeric', month: '2-digit',
    }).formatToParts(now);
    const billingMonth = `${monthParts.find(p => p.type === 'year')!.value}-${monthParts.find(p => p.type === 'month')!.value}`;
    const monthLabel = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Africa/Nairobi', month: 'short', year: 'numeric',
    }).format(now);
    const monthlyBills = data.billingPeriods.filter(b => b.startPeriod.startsWith(billingMonth));
    const expected = monthlyBills.reduce((total, bill) => total + Number(bill.amount), 0);
    const paidBills = monthlyBills.filter(b => Number(b.paidAmount) >= Number(b.amount)).length;
    const unpaid = (bill: Bill) => Math.max(0, Number(bill.amount) - Number(bill.paidAmount));
    const overdueBills = data.billingPeriods.filter(b => b.urgencyStatus === 'OVERDUE' && unpaid(b) > 0);
    const overdueByLease = new Map<string, number>();
    overdueBills.forEach(bill => overdueByLease.set(bill.leaseId, (overdueByLease.get(bill.leaseId) || 0) + unpaid(bill)));
    const reminder = [...overdueByLease].sort((a, b) => b[1] - a[1])
        .map(([leaseId, amount]) => ({ lease: data.leases.find(l => l.id === leaseId), amount }))
        .find(item => item.lease);
    const tenantName = (leaseId: string) => {
        const lease = data.leases.find(l => l.id === leaseId);
        return data.tenants.find(t => t.id === lease?.tenantUserId)?.name || 'Unknown tenant';
    };
    const dashboardMoney = (amount: number) => `${amount.toLocaleString('en-US', { maximumFractionDigits: 2 })} ETB`;
    const metrics = [
        { label: 'Collected', value: dashboardMoney(data.payments.reduce((total, payment) => total + Number(payment.amount), 0)), detail: 'All payments' },
        { label: 'Outstanding', value: dashboardMoney(data.billingPeriods.reduce((total, bill) => total + unpaid(bill), 0)), detail: 'All unpaid rent' },
        { label: 'Overdue', value: dashboardMoney(overdueBills.reduce((total, bill) => total + unpaid(bill), 0)), detail: 'Past-due rent' },
        { label: 'Tenants', value: String(data.tenants.length), detail: 'Across your properties' },
    ];
    const columns: Column<Payment>[] = [
        { key: 'leaseId', header: 'Property', render: payment => {
            const lease = data.leases.find(l => l.id === payment.leaseId);
            return data.properties.find(p => p.id === lease?.propertyId)?.description || 'Unknown property';
        } },
        { key: 'leaseId', header: 'Tenant Name', render: payment => tenantName(payment.leaseId) },
        { key: 'amount', header: 'Amount', render: payment => dashboardMoney(Number(payment.amount)) },
        { key: 'paymentDate', header: 'Payment Date', render: payment => date(payment.paymentDate) },
        { key: 'transactionRef', header: 'Reference' },
        { key: 'id', header: 'Status', render: () => <span className={styles.paidBadge}>Paid</span> },
    ];

    return <>
        <h1 className={styles.greeting}>Hello, {data.name}</h1>
        <section className={styles.summary} aria-label="Rent overview">
            <article className={`${styles.metricCard} ${styles.expectedCard}`}>
                <h2 className={styles.cardTitle}>Rent Expected</h2>
                <div className={styles.expectedAmount}>
                    <p className={styles.metricValue}>{dashboardMoney(expected)}</p>
                    <time dateTime={billingMonth}>{monthLabel}</time>
                </div>
                <div className={styles.collectionProgress}>
                    <p>{monthlyBills.length ? `${paidBills} of ${monthlyBills.length} bills paid` : 'No rent due this month'}</p>
                    <ProgressBar value={paidBills} max={monthlyBills.length || 1} label={`Rent bills paid for ${monthLabel}`} />
                </div>
            </article>
            {metrics.map(metric => <article className={styles.metricCard} key={metric.label}>
                <h2 className={styles.cardTitle} title={metric.detail}>{metric.label}<span className="sr-only"> ({metric.detail})</span></h2>
                <p className={styles.metricValue}>{metric.value}</p>
            </article>)}
        </section>
        <section className={styles.reminder} aria-label="Overdue rent reminder">
            {reminder?.lease ? <>
                <div>
                    <p>{tenantName(reminder.lease.id)} has overdue rent <strong>{dashboardMoney(reminder.amount)}</strong></p>
                    {!remindersAvailable && <p className={styles.reminderHelp}>Email reminders are currently unavailable.</p>}
                </div>
                <Button disabled={busy || !remindersAvailable} onClick={() => onRemind(reminder.lease!.id)}>
                    {busy ? 'Sending…' : 'Send Reminder'}
                </Button>
            </> : <p>No overdue rent. You’re all caught up.</p>}
        </section>
        <section className={styles.transactions} aria-labelledby="recent-transactions">
            <h2 id="recent-transactions">Recent Transactions</h2>
            <DataTable columns={columns} data={[...data.payments].sort((a, b) => b.paymentDate.localeCompare(a.paymentDate)).slice(0, 10)} getRowKey={payment => payment.id} emptyMessage="No transactions yet." />
        </section>
    </>;
}

export function LandlordPage({ page }: {
    page: 'dashboard' | 'properties' | 'leases' | 'tenants' | 'payments';
}) {
    const api = useApi();
    const session = useSession();
    const [notice, setNotice] = useState('');
    const [data, setData] = useState<Overview | null>(null);
    const [error, setError] = useState('');
    const [open, setOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    const [selectedProperty, setSelectedProperty] = useState<string | null>(null);
    const [selected, setSelected] = useState<string | null>(null);
    const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
    async function remind(leaseId: string) {
        setBusy(true); setError(''); setNotice('');
        try {
            const result = await api<{ alreadySent?: boolean }>(`/landlord/leases/${leaseId}/remind`, { method: 'POST' });
            setNotice(result.alreadySent ? 'An overdue email was already sent today.' : 'Overdue email sent to the tenant.');
        } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
    }
    const load = useCallback(async () => { try {
        setData(await api<Overview>('/landlord/overview'));
        setError('');
    }
    catch (e) {
        setError((e as Error).message);
    } }, [api]);
    useEffect(() => {
        let cancelled = false;
        api<Overview>('/landlord/overview').then(result => {
            if (!cancelled) setData(result);
        }).catch(error => {
            if (!cancelled) setError(error instanceof Error ? error.message : 'Unable to load landlord data');
        });
        return () => { cancelled = true; };
    }, [api]);
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
        return error ? <div className="p-8" role="alert"><p>{error}</p><button className="button button-primary button-md" onClick={() => void load()}>Retry</button></div> : <LoadingSpinner label="Loading landlord information" />;
    const tenantName = (id: string) => data.tenants.find(t => t.id === id)?.name || id;
    const propertyName = (id: string) => data.properties.find(p => p.id === id)?.description || id;
    const balance = (leaseId: string) => data.billingPeriods.filter(b => b.leaseId === leaseId).reduce((n, b) => n + Math.max(0, Number(b.amount) - Number(b.paidAmount)), 0);
    const leases: Lease[] = data.leases.map(l => ({ id: l.id, propertyId: l.propertyId, tenantUserId: l.tenantUserId, property: propertyName(l.propertyId), tenant: tenantName(l.tenantUserId), contact: data.tenants.find(t => t.id === l.tenantUserId)?.phone || '', status: l.status === 'ACTIVE' ? 'Active' : l.status === 'TERMINATED' ? 'Terminated' : 'Ended', rent: Number(l.amount), billingCycle: l.paymentPeriod.toLowerCase() as Lease['billingCycle'], startDate: date(l.startDate), endDate: date(l.expireDate), graceDays: l.gracePeriod, terms: l.terms, lateFeePercent: 0, onTimePayment: 0, billingPeriods: data.billingPeriods.filter(b => b.leaseId === l.id).map(b => { const grace = new Date(b.startPeriod); grace.setUTCDate(grace.getUTCDate() + l.gracePeriod); return { id: b.id, periodStart: date(b.startPeriod), periodEnd: date(b.endPeriod), due: date(b.startPeriod), graceEnds: grace.toISOString().slice(0, 10), amount: Number(b.amount), paidAmount: Number(b.paidAmount), paymentStatus: b.paymentStatus }; }) }));
    const selectedLease = leases.find(lease => lease.id === selected) || null;
    const leaseColumns: Column<Lease>[] = [{ key: 'id', header: 'Overdue reminder', render: l => data.billingPeriods.some(b => b.leaseId === l.id && b.urgencyStatus === 'OVERDUE' && Number(b.amount) > Number(b.paidAmount)) ? <button disabled={busy || !session.emailNotificationsAvailable} onClick={() => void remind(l.id)}>Email tenant</button> : 'No overdue rent' }, { key: 'tenant', header: 'Tenant' }, { key: 'property', header: 'Property' }, { key: 'contact', header: 'Contact' }, { key: 'startDate', header: 'Term', render: l => `${l.startDate} to ${l.endDate}` }, { key: 'rent', header: 'Rent', render: l => money(l.rent) }, { key: 'status', header: 'Status' }, { key: 'id', header: 'Actions', render: l => <button onClick={() => setSelected(l.id)}>{l.status === 'Active' ? 'Update' : 'View'}</button> }];
    const paymentColumns: Column<Payment>[] = [{ key: 'transactionRef', header: 'Reference' }, { key: 'leaseId', header: 'Tenant / Property', render: p => { const l = data.leases.find(l => l.id === p.leaseId); return l ? `${tenantName(l.tenantUserId)} / ${propertyName(l.propertyId)}` : p.leaseId; } }, { key: 'amount', header: 'Amount', render: p => money(Number(p.amount)) }, { key: 'paymentDate', header: 'Date', render: p => date(p.paymentDate) }, { key: 'paymentMethod', header: 'Method' }];
    const propertyViews: PropertyView[] = data.properties.map(property => {
        const propertyLeases = leases.filter(lease => lease.propertyId === property.id);
        const activeLease = propertyLeases.find(lease => lease.status === 'Active');
        return {
            id: property.id,
            name: property.description,
            location: property.location,
            type: `${data.propertyTypes.find(type => type.id === property.propertyTypeId)?.name || 'Property'}, ${property.rooms} rooms`,
            size: `${property.size} sq ft`,
            status: activeLease ? 'Occupied' : 'Vacant',
            imageData: property.imageData,
            utilities: [property.utilities?.split('\n').join(', '), property.additionalUtilities].filter(Boolean).join(' · ') || 'Not specified',
            tenant: activeLease?.tenant || 'Vacant',
            leaseTerms: activeLease ? `${activeLease.startDate} to ${activeLease.endDate}` : 'No active lease',
            nextPayment: activeLease?.billingPeriods.filter(bill => bill.due >= new Date().toISOString().slice(0, 10)).sort((a, b) => a.due.localeCompare(b.due))[0]?.due || 'No upcoming bill',
            outstanding: money(propertyLeases.reduce((total, lease) => total + balance(lease.id), 0)),
            price: activeLease ? `${activeLease.rent.toLocaleString('en-US', { maximumFractionDigits: 2 })} ETB` : 'No active rent',
            leases: propertyLeases.map(lease => ({ tenant: lease.tenant, term: `${lease.startDate} to ${lease.endDate}`, status: lease.status === 'Active' ? 'Active' : 'Ended' })),
        };
    });
    const propertyView = propertyViews.find(property => property.id === selectedProperty) || null;
    async function patch(id: string, body: unknown) {
        if (busy) throw new Error('Please wait for the current request to finish.');
        setBusy(true); setError(''); setNotice('');
        let saved = false;
        try {
            await api(`/landlord/leases/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
            saved = true;
            setData(await api<Overview>('/landlord/overview'));
        } catch (failure) {
            const message = saved ? 'Lease saved, but the list could not be refreshed. Reload the page before editing again.'
                : failure instanceof Error ? failure.message : 'Unable to update lease.';
            setError(message); throw new Error(message);
        } finally { setBusy(false); }
    }
    return <div className={page === 'dashboard' ? styles.dashboard : page === 'properties' ? propertyStyles.page : 'pl-20 pr-10 space-y-6'}>
    <PropertyDetails property={propertyView} onClose={() => setSelectedProperty(null)}/>{page !== 'dashboard' && page !== 'properties' && <h1 className="page-title capitalize">{page}</h1>}
    {error && <p role="alert" className="text-red-600">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {busy && !open && <LoadingSpinner overlay label={page === 'dashboard' ? 'Sending reminder' : 'Saving'} />}
    {page === 'dashboard' && <LandlordDashboard data={data} busy={busy} remindersAvailable={session.emailNotificationsAvailable} onRemind={leaseId => void remind(leaseId)} />}
    {page === 'properties' && <>
        <PropertiesGrid properties={propertyViews} selectedId={selectedProperty} onSelect={setSelectedProperty} onAdd={() => setOpen(true)} />
        {open && <NewPropertyForm onClose={() => setOpen(false)} propertyTypes={data.propertyTypes} onCreate={async values => { await mutate('/landlord/properties', values); }} />}
    </>}
    {page === 'tenants' && <DataTable columns={[{ key: 'name', header: 'Tenant' }, { key: 'phone', header: 'Contact' }, { key: 'id', header: 'Properties', render: t => data.leases.filter(l => l.tenantUserId === t.id).map(l => propertyName(l.propertyId)).join(', ') }, { key: 'id', header: 'Balance', render: t => money(data.leases.filter(l => l.tenantUserId === t.id).reduce((n, l) => n + balance(l.id), 0)) }]} data={data.tenants} getRowKey={t => t.id} emptyMessage="No tenants linked to your leases yet."/>}
    {page === 'payments' && <><p className="text-subtitle">Receipts are allocated to the oldest bills first and update outstanding balances. Surplus payments remain as credit.</p><button onClick={() => setOpen(true)}>Record payment</button><FormModal open={open} onClose={() => setOpen(false)} title="Record payment" fields={[{ name: 'leaseId', label: 'Lease', type: 'select', required: true, options: leases.map(l => ({ label: `${l.tenant} / ${l.property}`, value: l.id })) }, { name: 'amount', label: 'Amount (ETB)', type: 'number', required: true, min: '0.01', step: '0.01' }, { name: 'transactionRef', label: 'Transaction reference', required: true }, { name: 'paymentMethod', label: 'Method', type: 'select', required: true, options: ['CASH', 'MOBILE_MONEY', 'BANK'].map(value => ({ label: value.replace('_', ' '), value })) }]} onSubmit={async (values) => { await mutate('/payments', values); }}/><div className="flex gap-4"><label>Month <input type="month" value={month} onChange={e => setMonth(e.target.value)}/></label></div><DataTable columns={paymentColumns} data={data.payments.filter(p => p.paymentDate.startsWith(month))} getRowKey={p => p.id} emptyMessage="No payments this month."/></>}
    {page === 'leases' && <>{!session.emailNotificationsAvailable && <p>Overdue email reminders are unavailable until SMTP is configured. Tenants must also add an email address to their account.</p>}<DataTable columns={leaseColumns} data={leases} getRowKey={l => l.id} emptyMessage="No leases yet."/>
    <NewLeaseForm properties={data.properties.map(p => ({ label: p.description, value: p.id }))} onCreate={async lease => { await mutate('/leases', { propertyId: lease.propertyId, tenantName: lease.tenantName, tenantPhone: lease.tenantPhone, rentAmount: lease.rent, paymentPeriod: lease.billingCycle.toUpperCase(), startDate: lease.startDate, expireDate: lease.endDate, gracePeriod: lease.graceDays, terms: '' }); }} />
    <LeaseDetails key={selected} lease={selectedLease} onClose={() => setSelected(null)} busy={busy}
      canEditSchedule={!!selectedLease && selectedLease.startDate > data.businessDate && !data.payments.some(payment => payment.leaseId === selectedLease.id)}
      onUpdate={patch} onTerminate={id => patch(id, { status: 'TERMINATED' })}/></>}
  </div>;
}
