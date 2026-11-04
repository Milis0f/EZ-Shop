import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { StoreSample } from "./store-sample";

export const metadata: Metadata = { title: "Store charts — sample data", robots: { index: false, follow: false } };

/**
 * Development only: the charts of "My store" drawn with made-up figures, to check how they look with
 * data before a real store has any. Labelled as sample data on the page; absent from production builds.
 */
export default function StoreSamplePage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <div className="mx-auto max-w-6xl">
      <p className="mb-6 rounded-tile border border-[var(--verdict-surveiller)] px-4 py-3 font-mono text-xs text-[var(--verdict-surveiller)]">
        SAMPLE DATA — made-up figures for a visual check of the charts. Never shown in the app.
      </p>
      <StoreSample />
    </div>
  );
}
