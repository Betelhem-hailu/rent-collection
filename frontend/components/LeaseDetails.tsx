"use client";

import { useRef, useState } from "react";
import { Drawer } from "@/UI/Drawer";
import type { BillingPeriod, Lease } from "@/Data/leaseData";
import { type Column, DataTable } from "@/UI/DataTable";
import { UpdateLeaseForm, type LeasePatch } from "./UpdateLeaseForm";

const formatDate = (iso: string) => new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const formatMoney = (amount: number) => `${amount.toLocaleString("en-US", { maximumFractionDigits: 2 })} ETB`;
const statusStyles: Record<Lease["status"], string> = {
  Active: "bg-[var(--color-primary-soft)] text-[var(--color-primary)]",
  Ended: "bg-gray-100 text-gray-600", Terminated: "bg-red-50 text-red-600",
};
const billingColumns: Column<BillingPeriod>[] = [
  { key: "periodStart", header: "Period", render: period => `${formatDate(period.periodStart)} to ${formatDate(period.periodEnd)}` },
  { key: "due", header: "Due", render: period => formatDate(period.due) },
  { key: "graceEnds", header: "Grace ends", render: period => formatDate(period.graceEnds) },
  { key: "amount", header: "Amount", render: period => formatMoney(period.amount) },
  { key: "paidAmount", header: "Paid", render: period => formatMoney(period.paidAmount || 0) },
  { key: "id", header: "Balance", render: period => formatMoney(Math.max(0, period.amount - (period.paidAmount || 0))) },
  { key: "paymentStatus", header: "Status", render: period => (period.paymentStatus || "UNPAID").replaceAll("_", " ") },
];

export function LeaseDetails({ lease, onClose, onUpdate, onTerminate, canEditSchedule = false, busy = false }: {
  lease: Lease | null;
  onClose: () => void;
  onUpdate?: (id: string, patch: LeasePatch) => Promise<void>;
  onTerminate?: (id: string) => Promise<void>;
  canEditSchedule?: boolean;
  busy?: boolean;
}) {
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const terminating = useRef(false);
  async function terminate() {
    if (!lease || !onTerminate || busy || terminating.current) return;
    if (!window.confirm("Terminate this lease? This cannot be undone.")) return;
    terminating.current = true; setMessage(""); setError("");
    try { await onTerminate(lease.id); setMessage("Lease terminated."); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "Unable to terminate lease."); }
    finally { terminating.current = false; }
  }
  return <Drawer open={!!lease} onClose={onClose} title={lease?.property || ""} width={680}
    badge={lease && <span className={`inline-flex text-label px-3 py-1 rounded-lg ${statusStyles[lease.status]}`}>{lease.status}</span>}>
    {lease && <>
      <dl className="grid grid-cols-[100px_1fr] gap-y-3">
        {[["Tenant", lease.tenant], ["Rent", `${formatMoney(lease.rent)} per month, billed ${lease.billingCycle.replaceAll("_", " ")}`], ["Term", `${formatDate(lease.startDate)} to ${formatDate(lease.endDate)}`]].map(([label, value]) => <div className="contents" key={label}><dt className="text-body opacity-60">{label}</dt><dd className="text-subtitle text-[var(--color-text)]">{value}</dd></div>)}
      </dl>
      {message && <p className="mt-4 text-body-sm" role="status">{message}</p>}
      {error && <p className="mt-4 text-red-600 text-body-sm" role="alert">{error}</p>}
      {lease.status === "Active" && onUpdate ? <UpdateLeaseForm
        key={JSON.stringify([lease.id, lease.rent, lease.billingCycle, lease.startDate, lease.endDate, lease.graceDays, lease.terms])}
        lease={lease} canEditSchedule={canEditSchedule} busy={busy}
        onSave={async (id, patch) => { setMessage(""); setError(""); await onUpdate(id, patch); setMessage("Lease updated."); }}
      /> : <div className="mt-6 space-y-2"><p className="text-body-sm">Grace days: {lease.graceDays}</p><p className="text-body-sm whitespace-pre-wrap">{lease.terms || "No additional lease terms."}</p></div>}
      {lease.status === "Active" && onTerminate && <button type="button" disabled={busy} onClick={() => void terminate()} className="text-label text-red-600 border border-[var(--color-border)] rounded-lg px-4 py-2.5 mt-6 disabled:opacity-50">Terminate lease</button>}
      <h3 className="text-section-title mt-10 mb-3">Billing periods</h3>
      <DataTable columns={billingColumns} data={lease.billingPeriods.filter(period => period.amount > 0)} getRowKey={period => period.id} emptyMessage="No billing periods yet." />
    </>}
  </Drawer>;
}
