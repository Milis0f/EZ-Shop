import { TermPrompt } from "@/components/marketing/term";
import type { Metadata } from "next";
import { Suspense } from "react";
import { CompetitorCheck } from "@/components/web/competitor-check";
import { getMessages } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const m = await getMessages("web");
  return { title: m.competitor.metadataTitle };
}

type Params = Promise<Record<string, string | string[] | undefined>>;

/** `?url=` comes from the history's "check it again": it only fills the form. */
async function CheckFromAddress({ params }: { readonly params: Params }) {
  const url = (await params).url;
  const initialUrl = typeof url === "string" && url.length <= 2000 ? url : undefined;
  return <CompetitorCheck initialUrl={initialUrl} />;
}

export default async function CompetitorPage({ searchParams }: { readonly searchParams: Params }) {
  const m = (await getMessages("web")).competitor;
  return (
    <div className="mx-auto max-w-4xl pt-[3vh]">
      <header className="animate-enter mb-10 max-w-2xl">
        <TermPrompt command="ez-shop concurrent" className="mb-5" />
        <h1 className="page-title">{m.title}</h1>
        <p className="mt-4 leading-relaxed text-muted-foreground">{m.intro}</p>
      </header>
      <Suspense fallback={<CompetitorCheck />}>
        <CheckFromAddress params={searchParams} />
      </Suspense>
    </div>
  );
}
