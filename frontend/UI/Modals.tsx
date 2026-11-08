"use client";

import { useEffect, type ReactNode } from "react";

type ModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  width?: number;
  children: ReactNode;
};

export function Modal({ open, onClose, title, description, width = 560, children }: ModalProps) {
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

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div onClick={onClose} className="absolute inset-0 bg-black/30" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{ width }}
        className="relative max-w-full max-h-[90vh] overflow-y-auto bg-white rounded-2xl shadow-xl p-8"
      >
        <div className="flex items-start justify-between mb-6">
          <div>
            <p className="page-title">{title}</p>
            {description && <p className="text-subtitle mt-1">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-label border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50"
          >
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}