import type { ReactNode } from "react";
import { Header } from "@/components/Header";
import { SideBar } from "@/components/SideBar";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen">
      <SideBar />
      <div className="ml-[157px]">
        <Header />
        <main className="p-6">{children}</main>
      </div>
    </div>
  );
}
