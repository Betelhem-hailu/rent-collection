"use client";
import { ProgressBar } from "@/UI/ProgressBar";
import { DataTable } from "@/UI/DataTable";
import type { Column } from "@/UI/DataTable";
import { SegmentedTabs } from "@/UI/SegmentedTab";
import { useState } from "react";
import { dummyLeases, Lease } from "@/Data/leaseData";
import { LeaseDetails } from "@/components/LeaseDetails";
import { NewLeaseForm } from "@/components/NewLeaseForm";

// Replace with real data from your properties / tenants
const propertyOptions = [
  { label: "Riverside Apt 3B", value: "p1" },
  { label: "Maple Court 12", value: "p2" },
  { label: "Cedar Lane House", value: "p3" },
];
const tenantOptions = [
  { label: "Amara Bekele", value: "t1" },
  { label: "Daniel Carter", value: "t2" },
  { label: "Sara Tesfaye", value: "t3" },
];

export default function Page() {
  const [leases, setLeases] = useState<Lease[]>(dummyLeases);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const columns: Column<Lease>[] = [
    { key: "tenant", header: "Tenant" },
    { key: "property", header: "Property" },
    { key: "contact", header: "Contact" },
    {
      key: "onTimePayment",
      header: "On-time Payment",
      render: (row: Lease) => (
        <ProgressBar value={row.onTimePayment} label={`${row.onTimePayment} per 100`} />
      ),
    },
    {
      key: "rent",
      header: "Rent",
      render: (row: Lease) => `ETB ${row.rent.toLocaleString()}`,
    },
    {
      key: "status",
      header: "Status",
      render: (row: Lease) => {
        const statusStyles: Record<Lease["status"], string> = {
          Active: "bg-emerald-100 text-emerald-700",
          Ended: "bg-amber-100 text-amber-700",
          Terminated: "bg-red-100 text-red-700",
        };
        return (
          <span className={`rounded-lg px-3 py-1 text-sm ${statusStyles[row.status]}`}>
            {row.status}
          </span>
        );
      },
    },
    {
      key: "id",
      header: "",
      render: (row: Lease) => (
        <button
          type="button"
          onClick={() => setSelectedId(row.id)}
          className="text-label border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50"
        >
          View
        </button>
      ),
    },
  ];

  // Derive from the list so edits show up in the open drawer
  const selected = leases.find((l) => l.id === selectedId) ?? null;

  const update = (id: string, patch: Partial<Lease>) =>
    setLeases((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)));

  const handleCreateLease = (lease: Lease) => {
    // call your API / server action here
    setLeases((ls) => [lease, ...ls]);
  };

  const activeLeases = leases.filter((l) => l.status === "Active");

  return (
    <div className="pl-20">
      <div className="mb-10">
        <p className="page-title">Leases</p>
        <p className="text-subtitle mb-3">5 leases running, 1 expiring soon.</p>

        <div className="mt-6 w-full">
          <SegmentedTabs
            defaultValue="active"
            tabs={[
              {
                label: "Active Leases",
                value: "active",
                content: (
                  <DataTable
                    columns={columns}
                    data={activeLeases}
                    getRowKey={(lease: Lease) => lease.id}
                    emptyMessage="No leases to display."
                  />
                ),
              },
              {
                label: "New Lease",
                value: "new",
                content: (
                  <NewLeaseForm
                    properties={propertyOptions}
                    tenants={tenantOptions}
                    onCreate={handleCreateLease}
                  />
                ),
              },
            ]}
          />
        </div>

        <LeaseDetails
          lease={selected}
          onClose={() => setSelectedId(null)}
          onSaveTerms={(id, terms) => update(id, terms)}
          onRenew={(id) => console.log("renew", id)} // call your API here
          onTerminate={(id) => update(id, { status: "Terminated" })}
        />
      </div>
    </div>
  );
}