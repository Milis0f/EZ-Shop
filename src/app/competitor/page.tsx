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
    <div className="mx-auto max-w-3xl">
      <header className="animate-enter mb-10">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{m.title}</h1>
        <p className="mt-4 leading-relaxed text-muted-foreground">{m.intro}</p>
      </header>
      <CompetitorCheck />
    </div>
  );
}
