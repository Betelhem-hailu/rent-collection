"use client";

import { useEffect, type ReactNode } from "react";

type DrawerProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  badge?: ReactNode;
  width?: number;
  children: ReactNode;
};

export function Drawer({ open, onClose, title, badge, width = 520, children }: DrawerProps) {
  // Close on Escape + lock page scroll while open
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  return (
    <div
      className={`fixed inset-0 z-50 ${open ? "" : "pointer-events-none"}`}
      aria-hidden={!open}
    >
      {/* Overlay */}
      <div
        onClick={onClose}
        className={`absolute inset-0 bg-black/30 transition-opacity duration-300 ${
          open ? "opacity-100" : "opacity-0"
        }`}
      />

      {/* Panel */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{ width }}
        className={`absolute right-0 top-0 h-full max-w-full bg-white shadow-xl
          p-8 overflow-y-auto transition-transform duration-300 ease-out
          ${open ? "translate-x-0" : "translate-x-full"}`}
      >
        <div className="flex items-start justify-between mb-6">
          <div>
            <p className="page-title">{title}</p>
            {badge && <div className="mt-2">{badge}</div>}
          </div>
          <button
            onClick={onClose}
            className="text-label border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50"
          >
            Close
          </button>
        </div>

        {children}
      </aside>
    </div>
  );
}