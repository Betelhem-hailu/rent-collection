"use client";

import { Button } from "@/UI/Button";
import { Card } from "@/UI/Card";
import { FormField, FormModal } from "@/UI/FormModal";
import { PropertyDetails, type Property } from "@/components/PropertyDetails";
import { useState } from "react";

const propertyFields: FormField[] = [
  { name: "name", label: "Property name", required: true, span: 2, placeholder: "Riverside Apt 3B" },
  { name: "location", label: "Location", required: true },
  {
    name: "type",
    label: "Type",
    type: "select",
    required: true,
    options: [
      { label: "Apartment", value: "Apartment" },
      { label: "Townhouse", value: "Townhouse" },
      { label: "Office", value: "Office" },
    ],
  },
  { name: "rooms", label: "Rooms", type: "number", required: true },
  { name: "price", label: "Rent per month (ETB)", type: "number", required: true },
  { name: "utilities", label: "Utilities", span: 2, placeholder: "Water, electricity" },
];

const properties: Property[] = [
  {
    id: "1",
    name: "Riverside Apt 3B",
    status: "Occupied",
    location: "Riverside, Addis Ababa",
    type: "Apartment, 3 rooms",
    utilities: "Water",
    tenant: "Mr. John",
    leaseTerms: "Monthly, Mar 1, 2026 to Feb 28, 2027",
    nextPayment: "Oct 1, 2026, 5,000 ETB",
    outstanding: "0 ETB",
    price: "5,000 ETB",
    leases: [{ tenant: "Mr. John", term: "2026-03 to 2027-02", status: "Active" }],
  },
];

export default function Page() {
    const [selected, setSelected] = useState<Property | null>(null);
    const [addOpen, setAddOpen] = useState(false);

    const handleAddProperty = async (values: Record<string, string>) => {
      // call your API / server action here
      console.log(values);
    };
  return (
    <div className="pl-20">
        <div className="w-full flex justify-between items-center pr-10">
      <div className="mb-10">
        <p className="page-title">Properties</p>
        <p className="text-subtitle">5 of 6 units occupied.</p>
        </div>
        <Button onClick={() => setAddOpen(true)} className="mb-3">
          Add new property
        </Button>
        <FormModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Add new property"
        description="Fill in the details of the unit."
        fields={propertyFields}
        submitLabel="Add property"
        onSubmit={handleAddProperty}
      />
        </div>
        {properties.map((p) => (
        <button
          key={p.id}
          onClick={() => setSelected(p)}
          className="block text-left cursor-pointer"
        >
          <Card width={392} height={211}>
            <div className="grid grid-cols-2 gap-4">
              <p className="text-section-title">{p.name}</p>
              <div className="col-start-2 bg-[var(--color-primary-soft)] w-[100px] h-[20px] p-2 rounded-lg m-auto flex items-center justify-center mb-4">
                <p className="text-label text-[var(--color-primary)]">{p.status}</p>
              </div>
              <p className="text-body">{p.type}</p>
              <p className="text-body col-start-1 col-span-2">
                <span className="text-section-title">{p.price}</span> per month.
              </p>
              <p className="text-body mt-3 col-start-1">{p.tenant}</p>
            </div>
          </Card>
        </button>
      ))}

      <PropertyDetails property={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
