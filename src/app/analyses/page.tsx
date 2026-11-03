import type { Metadata } from "next";
import { Suspense } from "react";
import { HistoryList } from "@/components/history/history-list";
import { TermPrompt } from "@/components/marketing/term";
import { Skeleton } from "@/components/ui/skeleton";
import { getMessages } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const m = await getMessages("history");
  return { title: m.title };
}

/** Every research kept on this computer: filter by kind, search by name, newest or oldest first. */
export default async function AnalysesPage({ searchParams }: { readonly searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const m = await getMessages("history");
  return (
    <div className="mx-auto max-w-4xl pt-[3vh]">
      <header className="animate-enter mb-10 max-w-2xl">
        <TermPrompt command="ez-shop analyses --ls" className="mb-5" />
        <h1 className="page-title">{m.title}</h1>
        <p className="mt-4 leading-relaxed text-muted-foreground">{m.intro}</p>
      </header>
      <Suspense fallback={<Skeleton className="h-96 w-full rounded-tile" />}>
        <HistoryList params={searchParams} />
      </Suspense>
    </div>
  );
}
