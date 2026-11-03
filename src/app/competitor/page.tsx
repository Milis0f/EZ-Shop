import { TermPrompt } from "@/components/marketing/term";
import type { Metadata } from "next";
import { CompetitorCheck } from "@/components/web/competitor-check";
import { getMessages } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const m = await getMessages("web");
  return { title: m.competitor.metadataTitle };
}

export default async function CompetitorPage() {
  const m = (await getMessages("web")).competitor;
  return (
    <div className="mx-auto max-w-4xl pt-[3vh]">
      <header className="animate-enter mb-10 max-w-2xl">
        <TermPrompt command="ez-shop concurrent" className="mb-5" />
        <h1 className="page-title">{m.title}</h1>
        <p className="mt-4 leading-relaxed text-muted-foreground">{m.intro}</p>
      </header>
      <CompetitorCheck />
    </div>
  );
}
