"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Modal } from "./Modals";

export type FormField = {
  name: string;
  label: string;
  type?: "text" | "number" | "date" | "select" | "textarea";
  options?: { label: string; value: string }[]; // for select
  placeholder?: string;
  required?: boolean;
  span?: 1 | 2; // 2 = full width in the 2-column grid
};

export type FormValues = Record<string, string>;

type FormModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  fields: FormField[];
  initialValues?: FormValues; // pass to use as an edit form
  submitLabel?: string;
  onSubmit: (values: FormValues) => void | Promise<void>;
};

const inputClass =
  "w-full border border-gray-200 rounded-lg px-3 py-2 text-body bg-white " +
  "focus:outline-none focus:border-[var(--color-primary)]";

export function FormModal({
  open,
  onClose,
  title,
  description,
  fields,
  initialValues = {},
  submitLabel = "Save",
  onSubmit,
}: FormModalProps) {
  const [values, setValues] = useState<FormValues>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  // Reset every time the modal opens
  useEffect(() => {
    // if (open) {
    //   setValues(initialValues);
    //   setErrors({});
    // }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const setValue = (name: string, value: string) => {
    setValues((v) => ({ ...v, [name]: value }));
    if (errors[name]) setErrors((e) => ({ ...e, [name]: "" }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    const nextErrors: Record<string, string> = {};
    fields.forEach((f) => {
      if (f.required && !values[f.name]?.trim()) nextErrors[f.name] = `${f.label} is required`;
    });
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    try {
      setSubmitting(true);
      await onSubmit(values);
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={title} description={description}>
      <form onSubmit={handleSubmit} noValidate>
        <div className="grid grid-cols-2 gap-4">
          {fields.map((f) => {
            const common = {
              id: f.name,
              name: f.name,
              value: values[f.name] ?? "",
              placeholder: f.placeholder,
              className: inputClass,
            };

            return (
              <div key={f.name} className={f.span === 2 ? "col-span-2" : "col-span-2 sm:col-span-1"}>
                <label htmlFor={f.name} className="text-label block mb-1">
                  {f.label}
                  {f.required && <span className="text-red-500"> *</span>}
                </label>

                {f.type === "select" ? (
                  <select {...common} onChange={(e) => setValue(f.name, e.target.value)}>
                    <option value="">Select…</option>
                    {f.options?.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                ) : f.type === "textarea" ? (
                  <textarea {...common} rows={3} onChange={(e) => setValue(f.name, e.target.value)} />
                ) : (
                  <input
                    {...common}
                    type={f.type ?? "text"}
                    onChange={(e) => setValue(f.name, e.target.value)}
                  />
                )}

                {errors[f.name] && <p className="text-label text-red-500 mt-1">{errors[f.name]}</p>}
              </div>
            );
          })}
        </div>

        <div className="flex justify-end gap-3 mt-8">
          <button
            type="button"
            onClick={onClose}
            className="text-label border border-gray-200 rounded-lg px-4 py-2 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="text-label text-white bg-[var(--color-primary)] rounded-lg px-4 py-2 disabled:opacity-60"
          >
            {submitting ? "Saving…" : submitLabel}
          </button>
        </div>
      </form>
    </Modal>
  );
}