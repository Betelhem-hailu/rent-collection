import { Drawer } from "@/UI/Drawer";

export type Property = {
  id: string;
  name: string;
  status: "Occupied" | "Vacant";
  location: string;
  type: string;
  utilities: string;
  tenant: string;
  leaseTerms: string;
  nextPayment: string;
  outstanding: string;
  price: string;
  leases: { tenant: string; term: string; status: "Active" | "Ended" }[];
};

const Badge = ({ children }: { children: React.ReactNode }) => (
  <span className="inline-flex bg-[var(--color-primary-soft)] text-[var(--color-primary)] text-label px-3 py-1 rounded-lg">
    {children}
  </span>
);

export function PropertyDetails({
  property,
  onClose,
}: {
  property: Property | null;
  onClose: () => void;
}) {
  const rows = property && [
    ["Location", property.location],
    ["Type", property.type],
    ["Utilities", property.utilities],
    ["Current tenant", property.tenant],
    ["Lease terms", property.leaseTerms],
    ["Next payment", property.nextPayment],
    ["Outstanding", property.outstanding],
  ];

  return (
    <Drawer
      open={!!property}
      onClose={onClose}
      title={property?.name ?? ""}
      badge={property && <Badge>{property.status}</Badge>}
    >
      {property && (
        <>
          <dl className="grid grid-cols-[160px_1fr] gap-y-3">
            {rows!.map(([label, value]) => (
              <div key={label} className="contents">
                <dt className="text-body opacity-60">{label}</dt>
                <dd className="text-subtitle text-[var(--color-text)]">{value}</dd>
              </div>
            ))}
          </dl>

          <p className="text-section-title mt-10 mb-3">Lease history</p>
          <table className="w-full text-body text-left">
            <thead>
              <tr className="opacity-60 border-b border-gray-200">
                <th className="py-2 font-medium">Tenant</th>
                <th className="py-2 font-medium">Term</th>
                <th className="py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {property.leases.map((l, i) => (
                <tr key={i} className="border-b border-gray-100">
                  <td className="py-3">{l.tenant}</td>
                  <td className="py-3">{l.term}</td>
                  <td className="py-3">
                    <Badge>{l.status}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </Drawer>
  );
}