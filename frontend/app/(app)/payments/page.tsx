import { ProgressBar } from "@/UI/ProgressBar";
import { DataTable } from "@/UI/DataTable";
import type { Column } from "@/UI/DataTable";
import { SegmentedTabs } from "@/UI/SegmentedTab";

type BillRow = {
  id: string;
  tenant: string;
  unit: string;
  contact: string;
  onTimePayment: number;
  balance: number;
  status: "Paid" | "Pending" | "Overdue";
};

const bills: BillRow[] = [
  {
    id: "bill-1",
    unit: "Bole Apartment",
    tenant: "Abebe Kebede",
    contact: "+251902478529",
    balance: 10000,
    onTimePayment: 50,
    status: "Paid",
  },
  {
    id: "bill-2",
    unit: "Lideta Building",
    tenant: "Sara Bekele",
    contact: "+251940528967",
    balance: 12000,
    onTimePayment: 20,
    status: "Pending",
  },
];

const columns: Column<BillRow>[] = [
  { key: "tenant", header: "Tenant" },
  { key: "unit", header: "Unit" },
  { key: "contact", header: "Contact" },
  { key: "onTimePayment", header: "One-time Payment",
    render: (row: BillRow) => {
      return (
        <ProgressBar value={50} label={`${row.onTimePayment} per 100 `} />
      )
    }
  },
  {
    key: "balance",
    header: "Balance",
    render: (row: BillRow) => `ETB ${row.balance.toLocaleString()}`,
  },
  {
    key: "status",
    header: "Status",
    render: (row: BillRow) => {
      const statusStyles: Record<BillRow["status"], string> = {
        Paid: "bg-emerald-100 text-emerald-700",
        Pending: "bg-amber-100 text-amber-700",
        Overdue: "bg-red-100 text-red-700",
      };

      return (
        <span
          className={`rounded-lg px-3 py-1 text-sm ${statusStyles[row.status as BillRow["status"]]}`}
        >
          {row.status}
        </span>
      );
    },
  },
];
export default function Page() {
  return (
    <div className="pl-20">
        <div className="mb-10">
            <p className="page-title">Payments</p>
            <p className="text-subtitle">Summary of transactions</p>
            <div className="mt-6 w-full">
             <div className="flex justify-between">
              <button
                          type="button"
                          role="tab"
                          //onClick={() => setActiveTab(tab.value)}
                          className={`w-[200px] px-3 py-3 text-sm transition-colors rounded-lg
                            bg-slate-400 cursor-pointer text-white hover:bg-slate-500`}
                        >
                          Last Month
                        </button>
              <button
            type="button"
            role="tab"
            //onClick={() => setActiveTab(tab.value)}
            className={`w-[200px] cursor-pointer px-3 py-3 text-sm transition-colors rounded-lg bg-slate-400 text-white hover:bg-slate-500`}
          >
            Next Month
          </button>
             </div>
              </div>
            </div>
    </div>
  );
}
