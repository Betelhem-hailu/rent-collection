"use client";

import { useEffect, useState } from "react";
import { Drawer } from "@/UI/Drawer";
import { BillingPeriod, Lease } from "@/Data/leaseData";
import { Column, DataTable } from "@/UI/DataTable";

const formatDate = (iso: string) =>
  new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });

const formatMoney = (n: number) => `${n.toLocaleString("en-US")} ETB`;

const statusStyles: Record<Lease["status"], string> = {
  Active: "bg-[var(--color-primary-soft)] text-[var(--color-primary)]",
  Ended: "bg-gray-100 text-gray-600",
  Terminated: "bg-red-50 text-red-600",
};

const inputClass =
  "w-24 border border-gray-200 rounded-lg px-3 py-2 text-body bg-white " +
  "focus:outline-none focus:border-[var(--color-primary)]";

type LeaseDetailsProps = {
  lease: Lease | null;
  onClose: () => void;
  onSaveTerms?: (id: string, terms: { graceDays: number;}) => void;
  onRenew?: (id: string) => void;
  onTerminate?: (id: string) => void;
};

export function LeaseDetails({
  lease,
  onClose,
  onSaveTerms,
  onRenew,
  onTerminate,
}: LeaseDetailsProps) {
  const [graceDays, setGraceDays] = useState("");
//   const [lateFee, setLateFee] = useState("");

  const billingColumns: Column<BillingPeriod>[] = [
  {
    key: "periodStart",
    header: "Period",
    render: (p: BillingPeriod) => `${formatDate(p.periodStart)} to ${formatDate(p.periodEnd)}`,
  },
  {
    key: "due",
    header: "Due",
    render: (p: BillingPeriod) => formatDate(p.due),
  },
  {
    key: "graceEnds",
    header: "Grace ends",
    render: (p: BillingPeriod) => formatDate(p.graceEnds),
  },
  {
    key: "amount",
    header: "Amount",
    render: (p: BillingPeriod) => (
      <span className="text-subtitle text-[var(--color-text)]">{formatMoney(p.amount)}</span>
    ),
  },
];
  // Sync the inputs whenever a different lease is opened
  useEffect(() => {
    if (lease) {
     // setGraceDays(String(lease.graceDays));
      //setLateFee(String(lease.lateFeePercent));
    }
  }, [lease]);

  const isActive = lease?.status === "Active";

  const rows =
    lease && [
      ["Tenant", lease.tenant],
      ["Rent", `${formatMoney(lease.rent)} per month, billed ${lease.billingCycle}`],
      ["Term", `${formatDate(lease.startDate)} to ${formatDate(lease.endDate)}`],
    ];

  return (
    <Drawer
      open={!!lease}
      onClose={onClose}
      title={lease?.property ?? ""}
      width={620}
      badge={
        lease && (
          <span
            className={`inline-flex text-label px-3 py-1 rounded-lg ${statusStyles[lease.status]}`}
          >
            {lease.status}
          </span>
        )
      }
    >
      {lease && (
        <>
          {/* Summary */}
          <dl className="grid grid-cols-[120px_1fr] gap-y-3">
            {rows!.map(([label, value]) => (
              <div key={label} className="contents">
                <dt className="text-body opacity-60">{label}</dt>
                <dd className="text-subtitle text-[var(--color-text)]">{value}</dd>
              </div>
            ))}
          </dl>

          {/* Edit terms */}
          <p className="text-subtitle text-[var(--color-text)] mt-8 mb-3">Edit terms</p>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-body">
              Grace days
              <input
                type="number"
                min={0}
                value={graceDays}
                onChange={(e) => setGraceDays(e.target.value)}
                disabled={!isActive}
                className={inputClass}
              />
            </label>
            {/* <label className="flex items-center gap-2 text-body">
              Late fee %
              <input
                type="number"
                min={0}
                step="0.1"
                value={lateFee}
                onChange={(e) => setLateFee(e.target.value)}
                disabled={!isActive}
                className={inputClass}
              />
            </label> */}
          </div>
          <button
            type="button"
            disabled={!isActive}
            onClick={() =>
              onSaveTerms?.(lease.id, {
                graceDays: Number(graceDays),
                // lateFeePercent: Number(lateFee),
              })
            }
            className="text-label border border-gray-200 rounded-lg px-4 py-2 mt-3 hover:bg-gray-50 disabled:opacity-50"
          >
            Save terms
          </button>

          {/* Actions */}
          {isActive && (
            <div className="flex gap-3 mt-6">
              <button
                type="button"
                onClick={() => onRenew?.(lease.id)}
                className="text-label text-white bg-[var(--color-primary)] rounded-lg px-4 py-2.5"
              >
                Renew 12 months
              </button>
              <button
                type="button"
                onClick={() => {
                  if (window.confirm("Terminate this lease? This cannot be undone.")) {
                    onTerminate?.(lease.id);
                  }
                }}
                className="text-label text-red-600 border border-gray-200 rounded-lg px-4 py-2.5 hover:bg-red-50"
              >
                Terminate lease
              </button>
            </div>
          )}

          {/* Billing periods */}
          <p className="text-section-title mt-10 mb-3">Billing periods</p>
<DataTable
  columns={billingColumns}
  data={lease.billingPeriods}
  getRowKey={(p: BillingPeriod) => p.id}
  emptyMessage="No billing periods yet."
/>
        </>
      )}
    </Drawer>
  );
}