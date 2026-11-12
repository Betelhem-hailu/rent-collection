import { ThemeToggle } from "@/components/theme-toggle";
import { AccountMenu } from './AccountMenu';

export function Header() {
  return (
    <header className="sticky top-0 z-50 flex w-full px-10 h-16 items-center justify-end gap-3 bg-white/80 dark:bg-slate-900/80 shadow-bottom-[0px_4px_24px_rgba(0,0,0,0.06)] dark:shadow-bottom-[0px_4px_24px_rgba(0,0,0,0.1)] backdrop-blur-[6px]">
      <ThemeToggle />
      <AccountMenu />
    </header>
  );
}
