'use client';

import { useState, type FormEvent } from 'react';
import { Modal } from '@/UI/Modals';
import { LoadingSpinner } from './LoadingSpinner';
import { PropertyPhotoInput } from './PropertyPhotoInput';

export function PropertyImageForm({ imageData, onClose, onSave }: { imageData?: string | null; onClose: () => void; onSave: (imageData: string | null) => Promise<void> }) {
  const [photo, setPhoto] = useState(imageData ?? null);
  const [preparing, setPreparing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const close = () => { if (!preparing && !saving) onClose(); };
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (preparing || saving || photo === (imageData ?? null)) return;
    setSaving(true); setError('');
    try { await onSave(photo); onClose(); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Unable to update property photo.'); }
    finally { setSaving(false); }
  }
  return <Modal open onClose={close} title="Update property photo" description="Replace or remove the photo. Your property information stays the same.">
    <form onSubmit={save} className="space-y-6">
      <PropertyPhotoInput value={photo} onChange={setPhoto} disabled={saving} preparing={preparing} onPreparingChange={setPreparing} onError={setError} />
      {!photo && imageData && <p>The current photo will be removed when you save.</p>}
      {error && <p role="alert" className="text-danger">{error}</p>}
      {saving && <LoadingSpinner compact label="Saving property photo" />}
      <div className="flex justify-end gap-3"><button type="button" className="button button-outline button-md" disabled={saving || preparing} onClick={close}>Cancel</button><button className="button button-primary button-md" disabled={saving || preparing || photo === (imageData ?? null)}>Save photo</button></div>
    </form>
  </Modal>;
}
