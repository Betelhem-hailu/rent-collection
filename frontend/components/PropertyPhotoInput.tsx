'use client';

import { useEffect, useRef } from 'react';
import { ImagePlus, X } from 'lucide-react';
import { PropertyPhoto } from './PropertyPhoto';
import { LoadingSpinner } from './LoadingSpinner';

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

export function PropertyPhotoInput({ value, onChange, disabled, preparing, onPreparingChange, onError }: {
  value?: string | null; onChange: (value: string | null) => void; disabled: boolean; preparing: boolean;
  onPreparingChange: (preparing: boolean) => void; onError: (message: string) => void;
}) {
  const version = useRef(0);
  useEffect(() => () => { version.current++; }, []);
  return <div className="property-upload">
    {value ? <><PropertyPhoto imageData={value} name="Property photo preview" /><button type="button" className="property-photo-remove" disabled={disabled || preparing} onClick={() => { version.current++; onChange(null); }} aria-label="Remove photo"><X size={18} /></button></> : <ImagePlus size={32} className="text-primary" aria-hidden="true" />}
    <label htmlFor="property-photo" className="font-semibold">{value ? 'Change property photo' : 'Add a property photo'} <span className="text-muted font-normal">(optional)</span></label>
    <input id="property-photo" type="file" accept="image/jpeg,image/png,image/webp" disabled={preparing || disabled} onChange={async event => {
      const input = event.target;
      const file = input.files?.[0]; if (!file) return;
      const request = ++version.current; onPreparingChange(true); onError('');
      try { const result = await preparePhoto(file); if (version.current === request) onChange(result); }
      catch (failure) { if (version.current === request) onError(failure instanceof Error ? failure.message : 'Unable to read photo.'); }
      finally { if (version.current === request) { onPreparingChange(false); input.value = ''; } }
    }} />
    <p className="text-body-sm">JPEG, PNG or WebP, up to 10 MB. Photos are resized before saving.</p>
    {preparing && <LoadingSpinner compact label="Preparing property photo" />}
  </div>;
}
