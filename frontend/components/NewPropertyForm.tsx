'use client';

import { useState, type FormEvent } from 'react';
import { Modal } from '@/UI/Modals';
import { PropertyPhotoInput } from './PropertyPhotoInput';
import { LoadingSpinner } from './LoadingSpinner';

const utilityOptions = ['Parking', 'Water tank', 'Power saver', 'Security cameras', 'Backup generator', 'Wi-Fi', 'Elevator', 'Security guard', 'Garden', 'Laundry'];
export type NewProperty = { description: string; location: string; rooms: string; size: string; propertyTypeId: string; imageData?: string; utilities: string[]; additionalUtilities: string };

export function NewPropertyForm({ onClose, propertyTypes, onCreate, initialValues }: {
  onClose: () => void; propertyTypes: { id: number; name: string }[]; onCreate: (property: NewProperty) => Promise<void>;
  initialValues?: Omit<NewProperty, 'imageData'>;
}) {
  const [photo, setPhoto] = useState<string | null>(null);
  const [utilities, setUtilities] = useState<string[]>(initialValues?.utilities || []);
  const [error, setError] = useState('');
  const [preparing, setPreparing] = useState(false);
  const [saving, setSaving] = useState(false);
  const close = () => { if (!saving && !preparing) onClose(); };
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || preparing) return;
    const fields = new FormData(event.currentTarget);
    setSaving(true); setError('');
    try {
      await onCreate({ description: String(fields.get('description')), location: String(fields.get('location')), rooms: String(fields.get('rooms')), size: String(fields.get('size')), propertyTypeId: String(fields.get('propertyTypeId')), ...(!initialValues && photo ? { imageData: photo } : {}), utilities, additionalUtilities: String(fields.get('additionalUtilities') || '') });
      onClose();
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Unable to save property.'); }
    finally { setSaving(false); }
  }
  return <Modal open onClose={close} title={initialValues ? 'Update property information' : 'Add property'} description={initialValues ? 'Update the details your tenants see.' : 'Add the details your tenants will see.'} width={680}>
    <form onSubmit={submit} className="space-y-6">
      <fieldset disabled={saving} className="space-y-6 border-0 p-0 m-0 min-w-0">
        {!initialValues && <PropertyPhotoInput value={photo} onChange={setPhoto} disabled={saving} preparing={preparing} onPreparingChange={setPreparing} onError={setError} />}
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="sm:col-span-2 space-y-1"><span className="text-label">Property name *</span><input name="description" className="input-base" required maxLength={1000} placeholder="e.g. Riverside Apt 3B" defaultValue={initialValues?.description} /></label>
          <label className="sm:col-span-2 space-y-1"><span className="text-label">Location *</span><input name="location" className="input-base" required maxLength={500} defaultValue={initialValues?.location} /></label>
          <label className="space-y-1"><span className="text-label">Rooms *</span><input name="rooms" type="number" className="input-base" required min="1" step="1" defaultValue={initialValues?.rooms} /></label>
          <label className="space-y-1"><span className="text-label">Size (square feet) *</span><input name="size" type="number" className="input-base" required min="0.01" step="0.01" defaultValue={initialValues?.size} /></label>
          <label className="sm:col-span-2 space-y-1"><span className="text-label">Property type *</span><select name="propertyTypeId" className="input-base" required defaultValue={initialValues?.propertyTypeId || ''}><option value="" disabled>Select property type</option>{propertyTypes.map(type => <option value={type.id} key={type.id}>{type.name}</option>)}</select></label>
        </div>
        <fieldset className="border-0 p-0 min-w-0"><legend className="font-semibold mb-3">Utilities & amenities <span className="text-muted font-normal">(optional)</span></legend>
          <div className="utility-options">{[...new Set([...utilityOptions, ...(initialValues?.utilities || [])])].map(utility => <label key={utility} className={`utility-option ${utilities.includes(utility) ? 'utility-selected' : ''}`}><input type="checkbox" checked={utilities.includes(utility)} onChange={event => setUtilities(current => event.target.checked ? [...current, utility] : current.filter(item => item !== utility))} />{utility}</label>)}</div>
        </fieldset>
        <label className="block space-y-1"><span className="text-label">Additional utilities <span className="font-normal">(optional)</span></span><textarea className="input-base" name="additionalUtilities" rows={3} maxLength={1000} placeholder="Add anything else, e.g. solar hot water or a shared rooftop." defaultValue={initialValues?.additionalUtilities} /></label>
      </fieldset>
      {error && <p role="alert" className="text-danger">{error}</p>}
      {saving && <LoadingSpinner compact label="Saving property" />}
      <div className="flex justify-end gap-3"><button type="button" className="button button-outline button-md" disabled={saving || preparing} onClick={close}>Cancel</button><button className="button button-primary button-md" disabled={saving || preparing || !propertyTypes.length}>{initialValues ? 'Save information' : 'Add property'}</button></div>
      {!propertyTypes.length && <p role="alert">Property types are unavailable. Reload the page or contact your administrator.</p>}
    </form>
  </Modal>;
}
