import type { Metadata } from "next";
import { Suspense } from "react";
import { TermPrompt } from "@/components/marketing/term";
import { RecentAnalyses } from "@/components/search/recent-analyses";
import { Skeleton } from "@/components/ui/skeleton";
import { getMessages } from "@/i18n/server";

/** How many of the latest analyses the list shows. */
const LISTED = 40;

export async function generateMetadata(): Promise<Metadata> {
  const m = await getMessages("home");
  return { title: m.recent.title };
}

export default async function AnalysesPage() {
  const m = await getMessages("home");
  return (
    <div className="mx-auto max-w-4xl pt-[3vh]">
      <header className="animate-enter mb-10">
        <TermPrompt command="ez-shop analyses --ls" className="mb-5" />
        <h1 className="page-title">{m.recent.title}</h1>
      </header>
      <Suspense fallback={<Skeleton className="h-96 w-full rounded-tile" />}>
        <RecentAnalyses limit={LISTED} />
      </Suspense>
    </div>
  );
}
