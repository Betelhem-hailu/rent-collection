import { Button } from '@/UI/Button';
import type { Property } from './PropertyDetails';
import styles from './PropertiesGrid.module.css';
import { PropertyPhoto } from './PropertyPhoto';

export function PropertiesGrid({ properties, selectedId, onSelect, onAdd }: {
  properties: Property[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAdd: () => void;
}) {
  const occupied = properties.filter(property => property.status === 'Occupied').length;

  return <>
    <header className={styles.header}>
      <div>
        <h1 className="page-title">Properties</h1>
        <p>{occupied} of {properties.length} units occupied.</p>
      </div>
      <Button onClick={onAdd}>Add Property</Button>
    </header>
    {properties.length ? <ul className={styles.grid} aria-label="Properties">
      {properties.map(property => <li key={property.id}>
        <button
          type="button"
          className={styles.card}
          aria-label={`View details for ${property.name}`}
          aria-haspopup="dialog"
          aria-expanded={selectedId === property.id}
          onClick={() => onSelect(property.id)}
        >
          {property.imageData && <PropertyPhoto imageData={property.imageData} name={property.name} className="mb-4 h-40 w-full rounded-lg" />}
          <span className={styles.cardHeader}>
            <span className={styles.name}>{property.name}</span>
            <span className={`${styles.badge} ${property.status === 'Vacant' ? styles.vacant : ''}`}>{property.status}</span>
          </span>
          <span className={styles.type}>{property.type}</span>
          <span className={styles.rent}>
            <strong>{property.price}</strong>{property.status === 'Occupied' && <span> per month</span>}
          </span>
          <span className={styles.tenant}>{property.status === 'Occupied' ? property.tenant : 'No current tenant'}</span>
        </button>
      </li>)}
    </ul> : <p className={styles.empty}>No properties yet. Add your first property to get started.</p>}
  </>;
}
