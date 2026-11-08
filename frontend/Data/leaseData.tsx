export type BillingPeriod = {
  id: string;
  periodStart: string; // ISO date, e.g. "2026-01-01"
  periodEnd: string;
  due: string;
  graceEnds: string;
  amount: number;
};

export type Lease = {
  id: string;
  property: string;
  status: "Active" | "Ended" | "Terminated";
  contact: "+251902478529",
  tenant: string;
  rent: number;
  onTimePayment: number;
  billingCycle: "monthly";
  startDate: string;
  endDate: string;
  graceDays: number;
  lateFeePercent: number;
  billingPeriods: BillingPeriod[];
};

const iso = (d: Date) => d.toISOString().slice(0, 10);

// Builds one billing period per month, starting from startDate
function generateBillingPeriods(
  startDate: string,
  months: number,
  rent: number,
  graceDays: number
): BillingPeriod[] {
  const start = new Date(startDate + "T00:00:00Z");
  return Array.from({ length: months }, (_, i) => {
    const y = start.getUTCFullYear();
    const m = start.getUTCMonth() + i;
    const periodStart = new Date(Date.UTC(y, m, 1));
    const periodEnd = new Date(Date.UTC(y, m + 1, 0)); // last day of month
    const graceEnds = new Date(periodStart);
    graceEnds.setUTCDate(graceEnds.getUTCDate() + graceDays);

    return {
      id: `bp-${startDate}-${i}`,
      periodStart: iso(periodStart),
      periodEnd: iso(periodEnd),
      due: iso(periodStart),
      graceEnds: iso(graceEnds),
      amount: rent,
    };
  });
}

export const dummyLeases: Lease[] = [
  {
    id: "lease-1",
    property: "Riverside Apt 3B",
    status: "Active",
    tenant: "Amara Bekele",
    contact: "+251902478529",
    rent: 5000,
    billingCycle: "monthly",
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    onTimePayment: 50,
    graceDays: 5,
    lateFeePercent: 5,
    billingPeriods: generateBillingPeriods("2026-01-01", 12, 5000, 5),
  },
  {
    id: "lease-2",
    property: "Maple Court 12",
    status: "Active",
    tenant: "Daniel Carter",
    contact: "+251902478529",
    rent: 7500,
    billingCycle: "monthly",
    startDate: "2026-03-01",
    endDate: "2027-02-28",
    onTimePayment: 80,
    graceDays: 3,
    lateFeePercent: 2,
    billingPeriods: generateBillingPeriods("2026-03-01", 12, 7500, 3),
  },
  {
    id: "lease-3",
    property: "Bole Studio 2A",
    status: "Ended",
    tenant: "Sara Tesfaye",
    contact: "+251902478529",
    rent: 3200,
    billingCycle: "monthly",
    startDate: "2025-01-01",
    endDate: "2025-12-31",
    onTimePayment: 90,
    graceDays: 5,
    lateFeePercent: 5,
    billingPeriods: generateBillingPeriods("2025-01-01", 12, 3200, 5),
  },
];