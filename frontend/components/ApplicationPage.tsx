"use client";
import { useSession } from './AppSession';
import { LandlordPage } from './LandlordPage';
import { TenantPage } from './TenantPage';
import { AccountsPage } from './AccountsPage';

export type PageName = 'dashboard' | 'properties' | 'leases' | 'tenants' | 'payments' | 'accounts';
export function ApplicationPage({ page }: { page: PageName }) {
  const { user } = useSession();
  if (user.businessRole === 'ADMIN') return <AccountsPage />;
  if (user.businessRole === 'TENANT') return <TenantPage page={page} />;
  if (user.businessRole === 'LANDLORD' && page !== 'accounts') return <LandlordPage page={page} />;
  return <p role="alert">This page is unavailable for your account. Please contact support if your account role is missing.</p>;
}
