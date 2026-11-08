import type { ReactNode } from "react";

export type Column<T> = {
  key: keyof T;
  header: string;
  render?: (row: T) => ReactNode;
};

type DataTableProps<T> = {
  columns: Column<T>[];
  data: T[];
  getRowKey: (row: T) => string | number;
  emptyMessage?: string;
};

export function DataTable<T>({
  columns,
  data,
  getRowKey,
  emptyMessage = "No records found.",
}: DataTableProps<T>) {
  return (
    <div className="w-full overflow-x-auto rounded-xl border border-slate-400">
      <table className="w-full min-w-[700px] border-collapse text-left">
        <thead>
          <tr className="bg-[var(--color-primary-soft)]">
            {columns.map((column) => (
              <th
                key={String(column.key)}
                className="border-b border-[var(--color-border-strong)] px-6 py-3 text-base font-normal text-black"
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {data.length > 0 ? (
            data.map((row) => (
              <tr key={getRowKey(row)} className="bg-gray-50">
                {columns.map((column) => (
                  <td
                    key={String(column.key)}
                    className="border-b border-slate-300 px-6 py-4 text-base text-slate-500"
                  >
                    {column.render
                      ? column.render(row)
                      : String(row[column.key] ?? "—")}
                  </td>
                ))}
              </tr>
            ))
          ) : (
            <tr>
              <td
                colSpan={columns.length}
                className="px-6 py-8 text-center text-slate-500"
              >
                {emptyMessage}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}