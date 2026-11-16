/* Property photos are bounded data URLs returned by the authenticated API. */
/* eslint-disable @next/next/no-img-element */
import { House } from 'lucide-react';

export function PropertyPhoto({ imageData, name, className = '' }: { imageData?: string | null; name: string; className?: string }) {
  return imageData
    ? <img src={imageData} alt={name} className={`property-photo ${className}`} />
    : <div className={`property-photo property-photo-empty ${className}`} role="img" aria-label={`No photo for ${name}`}><House size={44} strokeWidth={1.3} aria-hidden="true" /><span>No property photo</span></div>;
}
