"use client";

import { useRef, useState, type FormEvent } from "react";
import type { Lease } from "@/Data/leaseData";

export type LeasePatch = {
  rentAmount?: string;
  paymentPeriod?: string;
  startDate?: string;
  expireDate?: string;
  gracePeriod?: number;
  terms?: string;
};
const inputClass = "input-base w-full";

export function UpdateLeaseForm({ lease, canEditSchedule, busy, onSave }: {
  lease: Lease;
  canEditSchedule: boolean;
  busy: boolean;
  onSave: (id: string, patch: LeasePatch) => Promise<void>;
}) {
  const [rent, setRent] = useState(String(lease.rent));
  const [cycle, setCycle] = useState(lease.billingCycle.toUpperCase());
  const [start, setStart] = useState(lease.startDate);
  const [end, setEnd] = useState(lease.endDate);
  const [grace, setGrace] = useState(String(lease.graceDays));
  const [terms, setTerms] = useState(lease.terms || "");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const saving = useRef(false);
  const changed = Number(rent) !== lease.rent || cycle !== lease.billingCycle.toUpperCase()
    || start !== lease.startDate || end !== lease.endDate || Number(grace) !== lease.graceDays || terms !== (lease.terms || "");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving.current || busy || !changed) return;
    setError("");
    if (end <= start) { setError("End date must follow start date."); return; }
    const patch: LeasePatch = {};
    if (canEditSchedule && Number(rent) !== lease.rent) patch.rentAmount = rent;
    if (canEditSchedule && cycle !== lease.billingCycle.toUpperCase()) patch.paymentPeriod = cycle;
    if (canEditSchedule && start !== lease.startDate) patch.startDate = start;
    if (end !== lease.endDate) patch.expireDate = end;
    if (Number(grace) !== lease.graceDays) patch.gracePeriod = Number(grace);
    if (terms !== (lease.terms || "")) patch.terms = terms;
    if (!Object.keys(patch).length) return;
    saving.current = true; setSubmitting(true);
    try { await onSave(lease.id, patch); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "Unable to update lease."); }
    finally { saving.current = false; setSubmitting(false); }
  }

  function extendYear() {
    const [year, month, day] = end.split("-").map(Number);
    const lastDay = new Date(Date.UTC(year + 1, month, 0)).getUTCDate();
    setEnd(`${year + 1}-${String(month).padStart(2, "0")}-${String(Math.min(day, lastDay)).padStart(2, "0")}`);
  }

  return <form onSubmit={submit} className="mt-8 space-y-4" aria-labelledby="lease-update-title">
    <h3 id="lease-update-title" className="text-section-title">Update lease</h3>
    {!canEditSchedule && <p id="lease-schedule-help" className="text-body-sm">Rent, billing frequency, and start date are locked once a lease starts or receives a payment. You can update terms, grace days, and extend the end date.</p>}
    <fieldset disabled={busy || submitting} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div>
        <label htmlFor="lease-update-rent" className="text-label block mb-1">Monthly rent (ETB)</label>
        <input id="lease-update-rent" name="rentAmount" type="number" value={rent} onChange={event => setRent(event.target.value)} min="0.01" max="1000000000000" step="0.01" required disabled={!canEditSchedule} className={inputClass} aria-describedby={!canEditSchedule ? "lease-schedule-help" : undefined} />
      </div>
      <div>
        <label htmlFor="lease-update-cycle" className="text-label block mb-1">Billing frequency</label>
        <select id="lease-update-cycle" name="paymentPeriod" value={cycle} onChange={event => setCycle(event.target.value)} disabled={!canEditSchedule} className={inputClass}>
          <option value="MONTHLY">Monthly</option><option value="QUARTERLY">Quarterly</option><option value="HALF_YEARLY">Half-yearly</option><option value="YEARLY">Yearly</option>
        </select>
      </div>
      <div>
        <label htmlFor="lease-update-start" className="text-label block mb-1">Start date</label>
        <input id="lease-update-start" name="startDate" type="date" value={start} onChange={event => setStart(event.target.value)} required disabled={!canEditSchedule} className={inputClass} />
      </div>
      <div>
        <label htmlFor="lease-update-end" className="text-label block mb-1">End date</label>
        <input id="lease-update-end" name="expireDate" type="date" value={end} onChange={event => setEnd(event.target.value)} min={canEditSchedule ? start : lease.endDate} required className={inputClass} />
      </div>
      <div>
        <label htmlFor="lease-update-grace" className="text-label block mb-1">Grace days</label>
        <input id="lease-update-grace" name="gracePeriod" type="number" value={grace} onChange={event => setGrace(event.target.value)} min={0} max={365} step={1} required className={inputClass} />
      </div>
      <div className="sm:col-span-2">
        <label htmlFor="lease-update-terms" className="text-label block mb-1">Lease terms</label>
        <textarea id="lease-update-terms" name="terms" value={terms} onChange={event => setTerms(event.target.value)} maxLength={10000} rows={4} className={inputClass} />
      </div>
      <div className="flex flex-wrap gap-3 sm:col-span-2">
        <button type="submit" disabled={!changed} className="button button-primary button-md disabled:opacity-50">{submitting ? "Saving..." : "Save lease changes"}</button>
        <button type="button" disabled={!end} onClick={extendYear} className="button button-md">Extend 12 months</button>
      </div>
    </fieldset>
    {error && <p className="text-red-600 text-body-sm" role="alert">{error}</p>}
  </form>;
}
