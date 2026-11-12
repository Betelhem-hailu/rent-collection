import type { ReactNode } from "react";
import { Header } from "@/components/Header";
import { SideBar } from "@/components/SideBar";
import { AppSession } from "@/components/AppSession";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <AppSession><div className="min-h-screen">
      <SideBar />
      <div className="ml-[157px]">
        <Header />
        <main className="p-6">{children}</main>
      </div>
    </div></AppSession>
  );
}
