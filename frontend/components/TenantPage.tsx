'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Landmark, CreditCard, Smartphone, Phone, ArrowUpRight, CheckCircle2 } from 'lucide-react';
import { useApi } from '@/lib/api';
import { useSession } from './AppSession';
import { DataTable } from '@/UI/DataTable';
import { FormModal } from '@/UI/FormModal';
import { LoadingSpinner } from './LoadingSpinner';
import { PropertyPhoto } from './PropertyPhoto';
import styles from './TenantPage.module.css';

type Lease = { id: string; propertyId: string; amount: string; paymentPeriod: string; status: string; startDate: string; expireDate: string; gracePeriod: number; terms: string };
type Bill = { id: string; leaseId: string; startPeriod: string; endPeriod: string; amount: string; paidAmount: string; urgencyStatus: string; paymentStatus: string };
type Overview = {
  businessDate: string;
  leases: Lease[];
  properties: { id: string; description: string; location: string; landlordId: string; rooms: number; propertyType: string; imageData?: string | null; utilities?: string | null; additionalUtilities?: string | null }[];
  landlords: { id: string; name: string; phone: string; email: string | null }[];
  billingPeriods: Bill[];
  payments: { id: string; leaseId: string; amount: string; transactionRef: string; paymentDate: string; paymentMethod: string }[];
  checkouts: { id: string; leaseId: string; amount: string; status: string; createdAt: string }[];
  notifications: { id: string; leaseId: string; subject: string; status: string; sentAt: string | null; createdAt: string }[];
  message?: string | null;
};
const datePart = (value: string) => value.slice(0, 10);
const date = (value: string) => new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${datePart(value)}T12:00:00Z`));
const money = (value: number) => `${value.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ETB`;
const outstanding = (bill: Bill) => Math.max(0, Number(bill.amount) - Number(bill.paidAmount));
const frequency: Record<string, string> = { MONTHLY: 'Monthly', QUARTERLY: 'Quarterly', HALF_YEARLY: 'Half-yearly', YEARLY: 'Yearly' };

export function TenantPage({ page }: { page: string }) {
  const api = useApi();
  const session = useSession();
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [selectedLeaseId, setSelectedLeaseId] = useState('');
  const [payLease, setPayLease] = useState<string | null>(null);
  const [checking, setChecking] = useState<string | null>(null);
  const overviewPath = page === 'dashboard' ? '/tenant/portal' : '/tenant/overview';
  const load = useCallback(async () => setData(await api<Overview>(overviewPath)), [api, overviewPath]);

  useEffect(() => {
    let cancelled = false;
    async function initialize() {
      const params = new URLSearchParams(window.location.search);
      if (params.get('lease')) setSelectedLeaseId(params.get('lease')!);
      try {
        const checkout = params.get('checkout');
        if (checkout) {
          const result = await api<{ status: string }>(`/checkout/${encodeURIComponent(checkout)}/verify`, { method: 'POST' });
          if (!cancelled) setMessage(result.status === 'PAID' ? 'Payment confirmed. Your rent balance has been updated.' : 'Payment is not confirmed yet. Check its status below.');
          params.delete('checkout');
          window.history.replaceState(null, '', `${window.location.pathname}${params.size ? `?${params}` : ''}`);
        }
      } catch (failure) { if (!cancelled) setError((failure as Error).message); }
      try { const overview = await api<Overview>(overviewPath); if (!cancelled) setData(overview); }
      catch (failure) { if (!cancelled) setError((failure as Error).message); }
    }
    void initialize();
    return () => { cancelled = true; };
  }, [api, overviewPath]);

  async function verify(id: string) {
    setChecking(id); setError(''); setMessage('');
    try {
      const result = await api<{ status: string }>(`/checkout/${encodeURIComponent(id)}/verify`, { method: 'POST' });
      setMessage(result.status === 'PAID' ? 'Payment confirmed. Your rent balance has been updated.' : 'Payment is not confirmed yet.');
      await load();
    } catch (failure) { setError((failure as Error).message); } finally { setChecking(null); }
  }

  if (!data) return error ? <div className={styles.empty} role="alert"><p>{error}</p><button className="button button-primary button-md" onClick={() => void load().catch(failure => setError(failure.message))}>Retry</button></div> : <LoadingSpinner label="Loading rental information" />;
  if (!data.leases.length) return <div className={styles.page}><h1 className={styles.greeting}>Hello, {session.user.name.split(' ')[0]}</h1><div className={styles.card}><p>{data.message || 'No rental agreements have been linked to your account yet.'}</p></div></div>;

  const lease = data.leases.find(item => item.id === selectedLeaseId)
    || data.leases.find(item => item.status === 'ACTIVE' && datePart(item.startDate) <= data.businessDate && datePart(item.expireDate) >= data.businessDate)
    || data.leases[0];
  const property = data.properties.find(item => item.id === lease.propertyId);
  const owner = data.landlords.find(item => item.id === property?.landlordId);
  const propertyName = property?.description || 'Rental property';
  const bills = data.billingPeriods.filter(bill => bill.leaseId === lease.id && Number(bill.amount) > 0).sort((a, b) => a.startPeriod.localeCompare(b.startPeriod));
  const payable = bills.find(bill => outstanding(bill) > 0);
  const current = bills.find(bill => bill.startPeriod <= data.businessDate && bill.endPeriod >= data.businessDate);
  const balance = (leaseId: string) => data.billingPeriods.filter(bill => bill.leaseId === leaseId).reduce((sum, bill) => sum + outstanding(bill), 0);
  const overdue = bills.filter(bill => bill.urgencyStatus === 'OVERDUE' && outstanding(bill) > 0);
  const overdueAmount = overdue.reduce((sum, bill) => sum + outstanding(bill), 0);
  const overduePaid = overdue.reduce((sum, bill) => sum + Number(bill.paidAmount), 0);
  const receipts = data.payments.filter(payment => payment.leaseId === lease.id).sort((a, b) => b.paymentDate.localeCompare(a.paymentDate));
  const credit = Math.max(0, receipts.reduce((sum, payment) => sum + Number(payment.amount), 0) - bills.reduce((sum, bill) => sum + Number(bill.paidAmount), 0));
  const rentalType = `${property?.propertyType || 'Property'}, ${property?.rooms || 1} ${(property?.rooms || 1) === 1 ? 'room' : 'rooms'}`;
  const activity = [
    ...receipts.map(payment => ({ id: payment.id, label: `Rent payment received · ${money(Number(payment.amount))}`, date: payment.paymentDate })),
    ...(data.notifications || []).filter(notification => notification.leaseId === lease.id && notification.status === 'SENT').map(notification => ({ id: notification.id, label: notification.subject, date: notification.sentAt || notification.createdAt })),
    { id: `lease-${lease.id}`, label: `Lease commencement · ${propertyName}`, date: lease.startDate },
  ].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8);
  const start = Date.parse(`${datePart(lease.startDate)}T00:00:00Z`);
  const end = Date.parse(`${datePart(lease.expireDate)}T00:00:00Z`);
  const progress = Math.max(0, Math.min(100, ((Date.parse(`${data.businessDate}T00:00:00Z`) - start) / Math.max(1, end - start)) * 100));
  const title = page === 'payments' ? 'Payments & Ledger' : 'Lease & Property';
  const leaseLink = `/leases?lease=${encodeURIComponent(lease.id)}`;
  const paymentsLink = `/payments?lease=${encodeURIComponent(lease.id)}`;

  return <div className={styles.page}>
    <div className={page !== 'dashboard' && data.leases.length === 1 ? styles.hiddenHeader : styles.pageHeader}><h1 className={page === 'dashboard' ? styles.greeting : 'sr-only'}>{page === 'dashboard' ? `Hello, ${session.user.name.split(' ')[0]}` : title}</h1>
      {data.leases.length > 1 && <label className={styles.leasePicker}><span className="sr-only">Rental agreement</span><select className="input-base" value={lease.id} onChange={event => setSelectedLeaseId(event.target.value)}>{data.leases.map(item => <option key={item.id} value={item.id}>{data.properties.find(home => home.id === item.propertyId)?.description || 'Property'} · {date(item.startDate)}{item.status !== 'ACTIVE' ? ` · ${item.status.toLowerCase()}` : ''}</option>)}</select></label>}
    </div>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {message && <p role="status" className={styles.notice}>{message}</p>}
    {checking && <LoadingSpinner overlay label="Checking payment status" />}

    {page === 'dashboard' && <>
      <section className={styles.homeCards} aria-label="Current rental">
        <article className={styles.card}><h2 className={styles.cardLabel}>Current Rent</h2><div className={styles.rentSummary}><strong>{propertyName}</strong><div><p className={styles.amount}>{money(Number(current?.amount || lease.amount))}</p><p className={styles.rentMonth}>{current ? `${date(current.startPeriod)} – ${date(current.endPeriod)}` : `${frequency[lease.paymentPeriod]} billing`}</p></div></div></article>
        <Link href={leaseLink} className={`${styles.card} ${styles.propertySummary}`}><PropertyPhoto imageData={property?.imageData} name={propertyName} className={styles.thumbnail} /><div><h2>{propertyName}</h2><p>{rentalType}</p><p className={styles.muted}>{property?.location}</p></div><ArrowUpRight size={18} className={styles.summaryArrow} aria-hidden="true" /></Link>
      </section>
      <section className={`${styles.card} ${styles.reminder}`} aria-label="Rent payment status">{overdueAmount > 0 ? <p>Overdue payment <strong className={styles.danger}>{money(overdueAmount)}</strong> remaining{overduePaid > 0 && <> · Paid <strong className={styles.success}>{money(overduePaid)}</strong></>} for <strong>{propertyName}</strong></p> : <p className={styles.allCaughtUp}><CheckCircle2 size={20} aria-hidden="true" />No overdue rent for <strong>{propertyName}</strong>.</p>}<Link className={styles.primaryButton} href={paymentsLink}>See Detail</Link></section>
      <section className={styles.section}><h2>Recent Activity</h2><DataTable data={activity} getRowKey={item => item.id} columns={[{ key: 'label', header: 'Activity Name' }, { key: 'date', header: 'Date', render: item => date(item.date) }]} emptyMessage="No recent activity." /></section>
    </>}

    {page !== 'dashboard' && page !== 'payments' && <>
      <section className={`${styles.card} ${styles.propertyHero}`} aria-label="Rental property"><PropertyPhoto imageData={property?.imageData} name={propertyName} className={styles.heroPhoto} /><div className={styles.heroDetails}><h2>{propertyName}</h2><p>{rentalType}</p><p className={styles.muted}>{property?.location}</p><dl className={styles.ownerDetails}><div><dt>Landlord Name:</dt><dd>{owner?.name || 'Contact unavailable'}</dd></div><div><dt>Landlord Phone Number:</dt><dd>{owner?.phone || 'Not available'}</dd></div></dl>{owner?.phone && <a className={styles.primaryButton} href={`tel:${owner.phone}`}><Phone size={18} aria-hidden="true" />Contact Landlord</a>}</div></section>
      <section className={`${styles.card} ${styles.leaseDetails}`}><h2>Lease Detail</h2><div className={styles.progressTrack} role="progressbar" aria-label="Lease term elapsed" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)}><div style={{ width: `${progress}%` }} /></div><div className={styles.termDates}><span>Start: {date(lease.startDate)}</span><span>End: {date(lease.expireDate)}</span></div><ul className={styles.leaseFacts}><li>Lease status: {lease.status.toLowerCase()}</li><li>Commencement Date: {date(lease.startDate)}</li><li>Base Rent: {money(Number(lease.amount))} per month</li><li>Billing Frequency: {frequency[lease.paymentPeriod] || lease.paymentPeriod}</li><li>Grace Period: {lease.gracePeriod} days</li>{lease.terms && <li className={styles.terms}>Lease Terms: {lease.terms}</li>}</ul></section>
      {(property?.utilities || property?.additionalUtilities) && <section className={`${styles.card} ${styles.amenities}`}><h2>Utilities & Amenities</h2>{property.utilities && <ul>{property.utilities.split('\n').filter(Boolean).map(utility => <li key={utility}><CheckCircle2 size={17} aria-hidden="true" />{utility}</li>)}</ul>}{property.additionalUtilities && <p className={styles.terms}>{property.additionalUtilities}</p>}</section>}
    </>}

    {page === 'payments' && <>
      <section className={`${styles.card} ${styles.checkout}`} aria-label="Pay rent"><p className={styles.amount}>{money(payable ? outstanding(payable) : 0)}</p><p>{payable ? `Due ${date(payable.startPeriod)}` : 'Your scheduled rent is paid'}</p>{payable && <>
        <p className={styles.payWith}>Pay with</p><div className={styles.paymentMethods}>{[{ label: 'Card', icon: CreditCard }, { label: 'Bank', icon: Landmark }, { label: 'Mobile', icon: Smartphone }].map(({ label, icon: Icon }) => <div key={label}><Icon size={36} strokeWidth={1.3} aria-hidden="true" /><span>{label}</span></div>)}</div><p className={styles.checkoutHelp}>Choose your payment method at secure Chapa checkout.</p><button type="button" className={`${styles.primaryButton} ${styles.payButton}`} disabled={!session.checkoutAvailable || !session.user.email} onClick={() => setPayLease(lease.id)}>Pay</button>
      </>}{!session.checkoutAvailable && <p className={styles.checkoutHelp}>Online payments are currently unavailable. Contact your landlord to arrange payment.</p>}{!session.user.email && <p className={styles.checkoutHelp}>Add your email in the account menu to pay online.</p>}</section>
      <div className={styles.balanceSummary}><p>Total scheduled balance <strong>{money(balance(lease.id))}</strong></p><p>Unallocated credit <strong>{money(credit)}</strong></p></div>
      <section className={styles.section}><h2>Payment History</h2><DataTable data={receipts} getRowKey={payment => payment.id} emptyMessage="No payments recorded yet." columns={[{ key: 'paymentDate', header: 'Date', render: payment => date(payment.paymentDate) }, { key: 'amount', header: 'Amount', render: payment => money(Number(payment.amount)) }, { key: 'paymentMethod', header: 'Payment Method', render: payment => payment.paymentMethod.replaceAll('_', ' ') }, { key: 'transactionRef', header: 'Reference' }, { key: 'id', header: 'Status', render: () => <span className={styles.paidBadge}>Paid</span> }]} /></section>
      {!!data.checkouts.filter(checkout => checkout.leaseId === lease.id && checkout.status !== 'PAID').length && <section className={styles.section}><h2>Online Checkouts</h2><DataTable data={data.checkouts.filter(checkout => checkout.leaseId === lease.id && checkout.status !== 'PAID')} getRowKey={checkout => checkout.id} columns={[{ key: 'createdAt', header: 'Started', render: checkout => date(checkout.createdAt) }, { key: 'amount', header: 'Amount', render: checkout => money(Number(checkout.amount)) }, { key: 'status', header: 'Status' }, { key: 'id', header: 'Action', render: checkout => <button className={styles.textButton} disabled={!!checking || !session.checkoutAvailable} onClick={() => void verify(checkout.id)}>Check payment status</button> }]} /></section>}
      <section className={styles.section}><details className={styles.ledger}><summary>Rent bills & ledger</summary><div className="mt-4"><DataTable data={bills} getRowKey={bill => bill.id} emptyMessage="No rent bills yet." columns={[{ key: 'startPeriod', header: 'Period', render: bill => `${date(bill.startPeriod)} – ${date(bill.endPeriod)}` }, { key: 'amount', header: 'Amount', render: bill => money(Number(bill.amount)) }, { key: 'paidAmount', header: 'Paid', render: bill => money(Number(bill.paidAmount)) }, { key: 'id', header: 'Balance', render: bill => money(outstanding(bill)) }, { key: 'paymentStatus', header: 'Status', render: bill => bill.paymentStatus === 'PAID' ? 'Paid' : `${bill.paymentStatus.replaceAll('_', ' ')} · ${bill.urgencyStatus}` }]} /></div></details></section>
    </>}
    <FormModal key={payLease} open={!!payLease} onClose={() => setPayLease(null)} title="Pay rent with Chapa" description={`Scheduled balance: ${money(balance(payLease || ''))}. You can make a partial payment.`} fields={[{ name: 'amount', label: 'Amount (ETB)', type: 'number', required: true, min: '0.01', max: String(balance(payLease || '')), step: '0.01' }]} submitLabel="Continue to Chapa" onSubmit={async values => {
      const result = await api<{ checkout: { checkoutUrl: string } }>('/checkout', { method: 'POST', body: JSON.stringify({ leaseId: payLease, amount: values.amount }) });
      window.location.assign(result.checkout.checkoutUrl);
    }} />
  </div>;
}
