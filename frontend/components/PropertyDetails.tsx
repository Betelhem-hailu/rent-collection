import { Drawer } from "@/UI/Drawer";
import { PropertyPhoto } from './PropertyPhoto';

export type Property = {
  id: string;
  name: string;
  status: "Occupied" | "Vacant";
  location: string;
  type: string;
  size: string;
  utilities: string;
  imageData?: string | null;
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
  onUpdateInfo,
  onUpdateImage,
}: {
  property: Property | null;
  onClose: () => void;
  onUpdateInfo: () => void;
  onUpdateImage: () => void;
}) {
  const rows = property && [
    ["Location", property.location],
    ["Type", property.type],
    ["Size", property.size],
    ["Monthly rent", property.price],
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
          <div className="mb-6 flex flex-wrap gap-3">
            <button type="button" className="button button-primary button-md" onClick={onUpdateInfo}>Update information</button>
            <button type="button" className="button button-outline button-md" onClick={onUpdateImage}>Update photo</button>
          </div>
          {property.imageData && <PropertyPhoto imageData={property.imageData} name={property.name} className="mb-6 h-56 w-full rounded-xl" />}
          <dl className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-[140px_minmax(0,1fr)] sm:gap-y-3">
            {rows!.map(([label, value]) => (
              <div key={label} className="contents">
                <dt className="text-body opacity-60">{label}</dt>
                <dd className="mb-3 break-words text-subtitle text-[var(--color-text)] sm:mb-0">{value}</dd>
              </div>
            ))}
          </dl>

          <h3 className="text-section-title mt-10 mb-3">Lease history</h3>
          <div className="overflow-x-auto">
          <table className="w-full text-body text-left">
            <thead>
              <tr className="opacity-60 border-b border-gray-200">
                <th className="py-2 font-medium">Tenant</th>
                <th className="py-2 font-medium">Term</th>
                <th className="py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {property.leases.length === 0 && <tr><td colSpan={3} className="py-4 text-muted">No lease history yet.</td></tr>}
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
          </div>
        </>
      )}
    </Drawer>
  );
}
