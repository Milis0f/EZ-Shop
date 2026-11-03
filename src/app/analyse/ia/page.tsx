import type { Metadata } from "next";
import { ModeSetter } from "@/components/layout/mode-setter";
import { TermPrompt } from "@/components/marketing/term";
import { DeepResearch } from "@/components/research/deep-research";
import { getMessages } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const m = await getMessages("deepResearch");
  return { title: m.metadataTitle };
}

/** Deep AI analysis: the app gathers, the local AI digs with its tools, the report cites its sources. */
export default async function DeepAiAnalysisPage() {
  const m = await getMessages("deepResearch");
  return (
    <div className="mx-auto max-w-5xl pt-[3vh]">
      <ModeSetter mode="simple" />
      <header className="animate-enter mb-10 max-w-2xl">
        <TermPrompt command="ez-shop analyse --ia" className="mb-5" />
        <h1 className="page-title">{m.title}</h1>
        <p className="mt-4 leading-relaxed text-muted-foreground">{m.intro}</p>
      </header>
      <DeepResearch />
    </div>
  );
}
