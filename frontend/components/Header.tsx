import { Sidebar, Search } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";

export function Header() {
  return (
    // <header className="flex h-16 w-full items-center justify-between shadow-lg bg-background px-4 dark:border-slate-800">
    <header className= "sticky top-0 z-50 flex w-full px-10 h-16 items-center justify-between bg-white/80 dark:bg-slate-900/80 shadow-bottom-[0px_4px_24px_rgba(0,0,0,0.06)] dark:shadow-bottom-[0px_4px_24px_rgba(0,0,0,0.1)] backdrop-blur-[6px]">
      {/* Search: 1/4 of the header width */}
      <div className="flex w-full items-center gap-10">
        <Sidebar className="h-6 w-6 cursor-pointer text-slate-600" />
      <div className="relative w-1/4 min-w-[180px]">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="search"
          placeholder="Search..."
          aria-label="Search"
          className="w-full rounded-md border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm outline-none placeholder:text-slate-400 focus:border-slate-400 focus:ring-2 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:focus:border-slate-500 dark:focus:ring-slate-800"
        />
      </div>
      </div>

      {/* Theme toggle: far right */}
      <ThemeToggle />
    </header>
  );
}