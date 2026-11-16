'use client';

import { useRef, useState, type FormEvent } from 'react';
import { ImagePlus, X } from 'lucide-react';
import { Modal } from '@/UI/Modals';
import { PropertyPhoto } from './PropertyPhoto';
import { LoadingSpinner } from './LoadingSpinner';

const utilityOptions = ['Parking', 'Water tank', 'Power saver', 'Security cameras', 'Backup generator', 'Wi-Fi', 'Elevator', 'Security guard', 'Garden', 'Laundry'];
export type NewProperty = { description: string; location: string; rooms: string; size: string; propertyTypeId: string; imageData?: string; utilities: string[]; additionalUtilities: string };

async function preparePhoto(file: File): Promise<string> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Choose a JPEG, PNG or WebP photo.');
  if (file.size > 10 * 1024 * 1024) throw new Error('Choose a photo smaller than 10 MB.');
  const bitmap = await createImageBitmap(file);
  try {
    if (bitmap.width * bitmap.height > 60000000) throw new Error('This photo is too large. Choose a smaller image.');
    const scale = Math.min(1, 1200 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Unable to prepare the photo. Please try another image.');
    context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.82, 0.65, 0.45]) {
      const result = canvas.toDataURL('image/jpeg', quality);
      if (result.length <= 660000) return result;
    }
    throw new Error('This photo is too detailed. Choose a smaller image.');
  } finally { bitmap.close(); }
}

export function NewPropertyForm({ onClose, propertyTypes, onCreate }: {
  onClose: () => void; propertyTypes: { id: number; name: string }[]; onCreate: (property: NewProperty) => Promise<void>;
}) {
  const [photo, setPhoto] = useState<string>();
  const [utilities, setUtilities] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [preparing, setPreparing] = useState(false);
  const [saving, setSaving] = useState(false);
  const photoVersion = useRef(0);
  const close = () => { if (!saving && !preparing) onClose(); };
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || preparing) return;
    const fields = new FormData(event.currentTarget);
    setSaving(true); setError('');
    try {
      await onCreate({ description: String(fields.get('description')), location: String(fields.get('location')), rooms: String(fields.get('rooms')), size: String(fields.get('size')), propertyTypeId: String(fields.get('propertyTypeId')), imageData: photo, utilities, additionalUtilities: String(fields.get('additionalUtilities') || '') });
      onClose();
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Unable to add property.'); }
    finally { setSaving(false); }
  }
  return <Modal open onClose={close} title="Add property" description="Add the details your tenants will see." width={680}>
    <form onSubmit={submit} className="space-y-6">
      <fieldset disabled={saving} className="space-y-6 border-0 p-0 m-0 min-w-0">
        <div className="property-upload">
          {photo ? <><PropertyPhoto imageData={photo} name="Property photo preview" /><button type="button" className="property-photo-remove" onClick={() => { photoVersion.current++; setPhoto(undefined); }} aria-label="Remove photo"><X size={18} /></button></> : <ImagePlus size={32} className="text-primary" aria-hidden="true" />}
          <label htmlFor="property-photo" className="font-semibold">{photo ? 'Change property photo' : 'Add a property photo'} <span className="text-muted font-normal">(optional)</span></label>
          <input id="property-photo" type="file" accept="image/jpeg,image/png,image/webp" disabled={preparing || saving} onChange={async event => {
            const file = event.target.files?.[0]; if (!file) return;
            const version = ++photoVersion.current; setPreparing(true); setError('');
            try { const result = await preparePhoto(file); if (photoVersion.current === version) setPhoto(result); }
            catch (failure) { setError(failure instanceof Error ? failure.message : 'Unable to read photo.'); }
            finally { setPreparing(false); event.target.value = ''; }
          }} />
          <p className="text-body-sm">JPEG, PNG or WebP, up to 10 MB. Photos are resized before saving.</p>
          {preparing && <LoadingSpinner compact label="Preparing property photo" />}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="sm:col-span-2 space-y-1"><span className="text-label">Property name *</span><input name="description" className="input-base" required maxLength={1000} placeholder="e.g. Riverside Apt 3B" /></label>
          <label className="sm:col-span-2 space-y-1"><span className="text-label">Location *</span><input name="location" className="input-base" required maxLength={500} /></label>
          <label className="space-y-1"><span className="text-label">Rooms *</span><input name="rooms" type="number" className="input-base" required min="1" step="1" /></label>
          <label className="space-y-1"><span className="text-label">Size (square feet) *</span><input name="size" type="number" className="input-base" required min="0.01" step="0.01" /></label>
          <label className="sm:col-span-2 space-y-1"><span className="text-label">Property type *</span><select name="propertyTypeId" className="input-base" required defaultValue=""><option value="" disabled>Select property type</option>{propertyTypes.map(type => <option value={type.id} key={type.id}>{type.name}</option>)}</select></label>
        </div>
        <fieldset className="border-0 p-0 min-w-0"><legend className="font-semibold mb-3">Utilities & amenities <span className="text-muted font-normal">(optional)</span></legend>
          <div className="utility-options">{utilityOptions.map(utility => <label key={utility} className={`utility-option ${utilities.includes(utility) ? 'utility-selected' : ''}`}><input type="checkbox" checked={utilities.includes(utility)} onChange={event => setUtilities(current => event.target.checked ? [...current, utility] : current.filter(item => item !== utility))} />{utility}</label>)}</div>
        </fieldset>
        <label className="block space-y-1"><span className="text-label">Additional utilities <span className="font-normal">(optional)</span></span><textarea className="input-base" name="additionalUtilities" rows={3} maxLength={1000} placeholder="Add anything else, e.g. solar hot water or a shared rooftop." /></label>
      </fieldset>
      {error && <p role="alert" className="text-danger">{error}</p>}
      {saving && <LoadingSpinner compact label="Saving property" />}
      <div className="flex justify-end gap-3"><button type="button" className="button button-outline button-md" disabled={saving || preparing} onClick={close}>Cancel</button><button className="button button-primary button-md" disabled={saving || preparing || !propertyTypes.length}>Add property</button></div>
      {!propertyTypes.length && <p role="alert">Property types are unavailable. Reload the page or contact your administrator.</p>}
    </form>
  </Modal>;
}
