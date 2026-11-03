import type { ReactNode } from "react";
import type { Formatters } from "@/i18n/format";
import { cn } from "@/lib/utils";

/** The small figures of the web features: plain markup, readable without colour and at phone width. */

/**
 * A price as the shop states it: 59,90 € must not read as 60 €. A currency the page wrote in its own
 * way (not an ISO code) is shown as written.
 */
export function exactPrice(f: Formatters, value: number, currency: string | null): string {
  const digits = Number.isInteger(value) ? 0 : 2;
  const plain = f.number(value, { minimumFractionDigits: digits, maximumFractionDigits: 2 });
  if (!currency) return plain;
  try {
    return f.number(value, { style: "currency", currency, minimumFractionDigits: digits, maximumFractionDigits: 2 });
  } catch {
    return `${plain} ${currency}`;
  }
}

export function StatGrid({ children, className }: { readonly children: ReactNode; readonly className?: string }) {
  return <dl className={cn("grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4", className)}>{children}</dl>;
}

export function StatTile({ label, value, note }: { readonly label: string; readonly value: ReactNode; readonly note?: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="tabular text-xl font-semibold tracking-tight break-words">{value}</dd>
      {note && <dd className="text-xs text-muted-foreground">{note}</dd>}
    </div>
  );
}

export interface Bar {
  readonly key: string;
  readonly label: ReactNode;
  readonly value: number;
  readonly display: string;
  /** Shown on hover: where the number comes from. */
  readonly hint?: string;
}

/**
 * Horizontal bars from zero: long labels stay readable, and each value is written, so nothing depends
 * on reading the length alone. One series only: the title says what is measured.
 */
export function BarList({ title, bars }: { readonly title?: string; readonly bars: readonly Bar[] }) {
  const highest = Math.max(0, ...bars.map((bar) => bar.value));
  return (
    <figure className="flex flex-col gap-3">
      {title && <figcaption className="text-sm font-medium">{title}</figcaption>}
      <ol className="flex flex-col gap-2.5">
        {bars.map((bar) => (
          <li key={bar.key} title={bar.hint} className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between gap-4 text-xs">
              <span className="min-w-0 break-words text-muted-foreground">{bar.label}</span>
              <span className="tabular shrink-0 font-medium">{bar.display}</span>
            </div>
            <div className="web-bar-track" aria-hidden>
              <div className="web-bar-fill" style={{ width: `${highest > 0 ? (bar.value / highest) * 100 : 0}%` }} />
            </div>
          </li>
        ))}
      </ol>
    </figure>
  );
}

export function SimpleTable({ title, columns, rows }: { readonly title?: string; readonly columns: readonly string[]; readonly rows: ReadonlyArray<{ readonly key: string; readonly cells: readonly ReactNode[] }> }) {
  return (
    <div className="flex flex-col gap-2">
      {title && <h4 className="text-sm font-medium">{title}</h4>}
      {/* Scrolls by itself on a phone rather than widening the page. */}
      <div className="overflow-x-auto" tabIndex={0} role="region" aria-label={title ?? columns.join(", ")}>
        <table className="w-full min-w-max text-left text-sm">
          <thead>
            <tr className="border-b border-line text-xs text-muted-foreground">
              {columns.map((column, i) => (
                <th key={i} scope="col" className="py-2 pr-4 font-normal last:pr-0">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((row) => (
              <tr key={row.key}>
                {row.cells.map((cell, i) => (
                  <td key={i} className="tabular py-2 pr-4 last:pr-0">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
