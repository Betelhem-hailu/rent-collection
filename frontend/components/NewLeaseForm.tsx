"use client";

import { useMemo, useState } from "react";
import { DataTable, type Column } from "@/UI/DataTable";
import type { BillingPeriod, Lease } from "@/Data/leaseData";

type Option = { label: string; value: string };
type Frequency = "monthly" | "quarterly" | "yearly";

const MONTHS_PER: Record<Frequency, number> = { monthly: 1, quarterly: 3, yearly: 12 };

const formatDate = (iso: string) =>
  new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });

const formatMoney = (n: number) => `ETB ${n.toLocaleString("en-US")}`;
const toISO = (d: Date) => d.toISOString().slice(0, 10);

function buildSchedule(
  startDate: string,
  endDate: string,
  rent: number,
  frequency: Frequency,
  graceDays: number
): BillingPeriod[] {
  if (!startDate || !endDate || !rent || endDate < startDate) return [];

  const step = MONTHS_PER[frequency];
  const start = new Date(startDate + "T00:00:00Z");
  const end = new Date(endDate + "T00:00:00Z");
  const periods: BillingPeriod[] = [];

  for (let i = 0; i < 120; i++) {
    const pStart = new Date(
      Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i * step, start.getUTCDate())
    );
    if (pStart > end) break;

    const next = new Date(
      Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + (i + 1) * step, start.getUTCDate())
    );
    const pEnd = new Date(next);
    pEnd.setUTCDate(pEnd.getUTCDate() - 1);
    if (pEnd > end) pEnd.setTime(end.getTime());

    const grace = new Date(pStart);
    grace.setUTCDate(grace.getUTCDate() + graceDays);

    periods.push({
      id: `new-${i}`,
      periodStart: toISO(pStart),
      periodEnd: toISO(pEnd),
      due: toISO(pStart),
      graceEnds: toISO(grace),
      amount: rent * step,
    });
  }
  return periods;
}

const previewColumns: Column<BillingPeriod>[] = [
  {
    key: "periodStart",
    header: "Period",
    render: (p: BillingPeriod) => `${formatDate(p.periodStart)} to ${formatDate(p.periodEnd)}`,
  },
  { key: "due", header: "Due", render: (p: BillingPeriod) => formatDate(p.due) },
  { key: "graceEnds", header: "Grace ends", render: (p: BillingPeriod) => formatDate(p.graceEnds) },
  {
    key: "amount",
    header: "Amount",
    render: (p: BillingPeriod) => <span className="text-section-title">{formatMoney(p.amount)}</span>,
  },
];

const inputClass =
  "w-full border border-gray-200 rounded-lg px-3 py-2 text-body bg-white " +
  "focus:outline-none focus:border-[var(--color-primary)]";

type Props = {
  properties: Option[];
  tenants: Option[];
  onCreate: (lease: Lease) => void;
};

export function NewLeaseForm({ properties, tenants, onCreate }: Props) {
  const [propertyId, setPropertyId] = useState("");
  const [tenantId, setTenantId] = useState("");
  const [rent, setRent] = useState("");
  const [frequency, setFrequency] = useState<Frequency>("monthly");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [graceDays, setGraceDays] = useState("5");
  const [lateFee, setLateFee] = useState("5");
  const [error, setError] = useState("");

  const schedule = useMemo(
    () => buildSchedule(startDate, endDate, Number(rent), frequency, Number(graceDays) || 0),
    [startDate, endDate, rent, frequency, graceDays]
  );

  const reset = () => {
    setPropertyId("");
    setTenantId("");
    setRent("");
    setFrequency("monthly");
    setStartDate("");
    setEndDate("");
    setGraceDays("5");
    setLateFee("5");
    setError("");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!propertyId || !tenantId || !rent || !startDate || !endDate) {
      setError("Please fill in all required fields.");
      return;
    }
    if (endDate <= startDate) {
      setError("End date must be after the start date.");
      return;
    }

    onCreate({
      id: `lease-${Date.now()}`,
      property: properties.find((p) => p.value === propertyId)?.label ?? propertyId,
      tenant: tenants.find((t) => t.value === tenantId)?.label ?? tenantId,
      status: "Active",
      rent: Number(rent),
      billingCycle: frequency,
      startDate,
      endDate,
      graceDays: Number(graceDays) || 0,
      lateFeePercent: Number(lateFee) || 0,
      billingPeriods: schedule,
    } as Lease);

    reset();
  };

  return (
    <div>
      <div className="mb-6">
        <p className="page-title">Create a lease</p>
        <p className="text-subtitle">The billing schedule updates as you type.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] items-start">
        {/* Form */}
        <form
          onSubmit={handleSubmit}
          noValidate
          className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6"
        >
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-label block mb-1">Property</label>
              <select className={inputClass} value={propertyId} onChange={(e) => setPropertyId(e.target.value)}>
                <option value="">Select…</option>
                {properties.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-label block mb-1">Tenant</label>
              <select className={inputClass} value={tenantId} onChange={(e) => setTenantId(e.target.value)}>
                <option value="">Select…</option>
                {tenants.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-label block mb-1">Monthly rent (ETB)</label>
              <input type="number" min={0} className={inputClass} value={rent} onChange={(e) => setRent(e.target.value)} />
            </div>

            <div>
              <label className="text-label block mb-1">Billing frequency</label>
              <select className={inputClass} value={frequency} onChange={(e) => setFrequency(e.target.value as Frequency)}>
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="yearly">Yearly</option>
              </select>
            </div>

            <div>
              <label className="text-label block mb-1">Start date</label>
              <input type="date" className={inputClass} value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>

            <div>
              <label className="text-label block mb-1">End date</label>
              <input type="date" className={inputClass} value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>

            <div>
              <label className="text-label block mb-1">Grace period (days)</label>
              <input type="number" min={0} className={inputClass} value={graceDays} onChange={(e) => setGraceDays(e.target.value)} />
            </div>

            <div>
              <label className="text-label block mb-1">Late fee (% of rent)</label>
              <input type="number" min={0} step="0.1" className={inputClass} value={lateFee} onChange={(e) => setLateFee(e.target.value)} />
            </div>
          </div>

          {error && <p className="text-label text-red-500 mt-4">{error}</p>}

          <button
            type="submit"
            className="text-label text-white bg-[var(--color-primary)] rounded-lg px-4 py-2.5 mt-6"
          >
            Create lease
          </button>
        </form>

        {/* Preview */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 min-w-0">
          <p className="text-section-title mb-3">Billing schedule preview</p>
          <DataTable
            columns={previewColumns}
            data={schedule}
            getRowKey={(p: BillingPeriod) => p.id}
            emptyMessage="Enter rent, start and end dates to see the schedule."
          />
        </div>
      </div>
    </div>
  );
}