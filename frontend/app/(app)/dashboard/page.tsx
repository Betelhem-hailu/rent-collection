import { Button } from "@/UI/Button";
import { Card } from "@/UI/Card";
import { ProgressBar } from "@/UI/ProgressBar";
import { DataTable } from "@/UI/DataTable";
import type { Column } from "@/UI/DataTable";

type BillRow = {
  id: string;
  property: string;
  tenantName: string;
  amount: number;
  billingPeriod: string;
  billReference: string;
  status: "Paid" | "Pending" | "Overdue";
};

const bills: BillRow[] = [
  {
    id: "bill-1",
    property: "Bole Apartment",
    tenantName: "Abebe Kebede",
    amount: 10000,
    billingPeriod: "October 2026",
    billReference: "BILL-001",
    status: "Paid",
  },
  {
    id: "bill-2",
    property: "Lideta Building",
    tenantName: "Sara Bekele",
    amount: 12000,
    billingPeriod: "October 2026",
    billReference: "BILL-002",
    status: "Pending",
  },
];

const columns: Column<BillRow>[] = [
  { key: "property", header: "Property" },
  { key: "tenantName", header: "Tenant Name" },
  {
    key: "amount",
    header: "Amount",
    render: (row: BillRow) => `ETB ${row.amount.toLocaleString()}`,
  },
  { key: "billingPeriod", header: "Billing Period" },
  { key: "billReference", header: "Bill Reference" },
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
    const dashboardData = [{
        title: "Collected",
        value: "5,000 ETB"
    },{title: "Outstanding", value: "3,000 ETB"},
{title: "Overdue", value: "2,000 ETB"},
{title: "Tenants", value: "10"}];
  return (
    <div className="pl-20">
        <p className="page-title mb-10">Hello, Betty</p>
        <div className="flex gap-10">
        <Card width={800} height={211} className="flex flex-col gap-5">
            <p className="text-card-title">Rent Expected</p>
            <div className="flex items-center justify-between">
                <p className="text-metric">10,000 ETB</p>
                <p className="text-sm">sept 10, 2026</p>
            </div>
            <div>
             <p className=".text-body-sm">5 of 10 paid</p>
             <ProgressBar value={50} label="Monthly rent collected" />
            </div>
        </Card>
        <div className="flex flex-wrap gap-[16px]">
            {dashboardData.map((item, index) => (
                <Card key={index} width={300} height={100}>
                    <p className="text-card-title">{item.title}</p>
                    <p className="text-metric">{item.value}</p>
                </Card>
            ))}
        </div>
        </div>

        <Card width={1150} height={80} className="mt-10 flex justify-between items-center px-10">
            <p className="text-body">Mr.Jhon  has  overdue <span className="text-reminder"> 10,000 ETB</span></p>
            <Button>Send Reminder</Button>
        </Card>

      <section className="space-y-4">
        <h3 className="text-card-title font-semibold mt-10 mb-5">Recent Transactions</h3>
      <DataTable
        columns={columns}
        data={bills}
        getRowKey={(bill: BillRow) => bill.id}
        emptyMessage="No bills to display."
      />
    </section>
        {/* <Button>
  <Plus size={18} />
  Add Property
</Button>

<Button variant="secondary">Cancel</Button>


<Button variant="outline">View Details</Button>

<Button variant="ghost" size="sm">Edit</Button>

<Button variant="danger">
  Delete
</Button>

<Button type="submit" fullWidth>
  Save Changes
</Button>

<Button disabled>Saving...</Button> */}
    </div>
  );
}
