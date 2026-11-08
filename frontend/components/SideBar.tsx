
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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
    
  return (
    <aside className="fixed left-0 top-0 h-screen w-[180px] rounded-r-2xl bg-white/[0.75] dark:bg-slate-900/80 p-5 shadow-[0px_4px_24px_rgba(0,0,0,0.06)] backdrop-blur-[6px]">
      {/* Logo */}
      <div className="mb-[60px] px-[5px] pt-0">
        <Link href="/dashboard">
        <h1 className="text-[28px] font-bold leading-[39px] text-[#2563EB]">
          DIGIRENT
        </h1>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex flex-col gap-3">
        {navItems.map(({ label, href, icon: Icon }) => {
          const isActive =
            pathname === href || (pathname?.startsWith(`${href}/`) ?? false);

          return (
            <Link
              key={href}
              href={href}
              aria-current={isActive ? "page" : undefined}
              className={`flex h-8 items-center gap-3 rounded-[4px] border px-1 transition-colors duration-200 border-transparent hover:bg-[#2563EB]/[0.08] hover:text-[#2563EB]`}
            >
              <Icon
                size={24}
                strokeWidth={2}
                className={isActive ? "text-[#2563EB]" : "text-black"}
              />

              <span
                className={`font-['Source_Sans_3'] text-sm leading-5 ${
                  isActive ? "font-semibold text-[#2563EB]" : "text-black"
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
