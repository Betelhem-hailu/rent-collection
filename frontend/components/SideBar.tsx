
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from './AppSession';
import {
  LayoutDashboard,
  House,
  Users,
  FileText,
  CreditCard,
} from "lucide-react";

const navItems = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Properties", href: "/properties", icon: House },
  { label: "Tenants", href: "/tenants", icon: Users },
  { label: "Leases", href: "/leases", icon: FileText },
  { label: "Payments", href: "/payments", icon: CreditCard },
];

export function SideBar() {
    const pathname = usePathname();
    const { user } = useSession();
    const items = user.businessRole === 'ADMIN' ? [{ label: 'Accounts', href: '/accounts', icon: Users }] : user.businessRole === 'TENANT' ? [
      { label: 'Home', href: '/dashboard', icon: House },
      { label: 'Lease & Property', href: '/leases', icon: FileText },
      { label: 'Payments & Ledger', href: '/payments', icon: CreditCard },
    ] : navItems;
    
  return (
    <aside className="fixed left-0 top-0 z-50 h-screen w-[72px] overflow-y-auto rounded-r-2xl bg-white/[0.75] p-3 shadow-[0px_4px_24px_rgba(0,0,0,0.06)] backdrop-blur-[6px] md:w-[200px] md:p-5 xl:w-[260px] dark:bg-slate-900/80">
      {/* Logo */}
      <div className="mb-[60px] px-[5px] pt-0">
        <Link href="/dashboard" aria-label="DIGIRENT home" className="text-[28px] font-bold leading-[39px] text-[#2563EB] xl:text-[32px]">
          <span className="md:hidden" aria-hidden="true">D</span>
          <span className="hidden md:inline" aria-hidden="true">DIGIRENT</span>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex flex-col gap-3">
        {items.map(({ label, href, icon: Icon }) => {
          const isActive =
            pathname === href || (pathname?.startsWith(`${href}/`) ?? false);

          return (
            <Link
              key={href}
              href={href}
              aria-label={label}
              title={label}
              aria-current={isActive ? "page" : undefined}
              className={`flex h-8 items-center gap-3 rounded-[4px] border px-1 transition-colors duration-200 border-transparent hover:bg-[#2563EB]/[0.08] hover:text-[#2563EB]`}
            >
              <Icon
                size={24}
                aria-hidden="true"
                strokeWidth={2}
                className={`shrink-0 ${isActive ? "text-[#2563EB]" : "text-[var(--color-text-secondary)]"}`}
              />

              <span
                className={`hidden font-sans text-sm leading-5 md:inline ${
                  isActive ? "font-semibold text-[#2563EB]" : "text-[var(--color-text-secondary)]"
                }`}
              >
                {label}
              </span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
