"use client";

import { useRouter } from "next/navigation";
import { DeepReportView } from "@/components/research/deep-report";
import { CompetitorReport } from "@/components/web/competitor-report";
import { WebPrices, WebReadingBlock, WebSourceList } from "@/components/web/web-results";
import type { DeepReport } from "@/domain/deep-research";
import type { CompetitorResponse, WebResearchResponse } from "@/domain/web";
import { useMessages } from "@/i18n/client";

/** A kept report, drawn with the same views as when it was made. */
export type SavedReport =
  | { readonly kind: "deep_research"; readonly report: DeepReport }
  | { readonly kind: "competitor"; readonly report: Extract<CompetitorResponse, { status: "ready" }> }
  | { readonly kind: "web_research"; readonly report: Extract<WebResearchResponse, { status: "ready" }> };

export function SavedRunReport({ saved }: { readonly saved: SavedReport }) {
  const router = useRouter();
  const web = useMessages("web");
  if (saved.kind === "deep_research") return <DeepReportView report={saved.report} />;
  if (saved.kind === "competitor") {
    // Checking another product of the shop is a new check: the competitor page opens with its address.
    return <CompetitorReport result={saved.report} onCheck={(url) => router.push(`/competitor?url=${encodeURIComponent(url)}`)} />;
  }
  const { report } = saved;
  return (
    <div className="flex flex-col gap-6">
      <WebReadingBlock reading={report.reading} badge={web.results.badge} sources={report.sources} />
      <WebPrices prices={report.prices} summary={report.priceSummary} />
      <WebSourceList sources={report.sources} />
    </div>
  );
}
