import type { Metadata } from "next";
import { ModeSetter } from "@/components/layout/mode-setter";
import { HeroTitle } from "@/components/marketing/hero-title";
import { TermBar, TermPrompt } from "@/components/marketing/term";
import { SimpleSearch } from "@/components/search/simple-search";
import { getMessages } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const m = await getMessages("shell");
  return { title: m.orbit.analyse.simple };
}

/** Simple analysis: one field, the verdict country by country. The planet waits beside it. */
export default async function SimpleAnalysisPage() {
  const m = await getMessages("home");
  return (
    <section className="relative mx-auto max-w-6xl pt-[3vh] pb-10">
      <ModeSetter mode="simple" />
      <div className="max-w-[46rem]">
        <TermPrompt command="ez-shop analyse" className="mb-6" />
        <HeroTitle text={m.landing.headline} className="text-[clamp(2.25rem,5.4vw,4.5rem)]" />
        <p className="hero-fade mt-7 max-w-[34rem] text-[clamp(1rem,1.6vw,1.1875rem)] leading-relaxed text-pretty text-muted-foreground">{m.landing.subhead}</p>
        <div className="term hero-fade mt-9" style={{ "--stagger": 1 } as React.CSSProperties}>
          <TermBar title="ez-shop — analyse" />
          <div className="p-5 sm:p-6">
            <SimpleSearch />
          </div>
        </div>
      </div>
    </section>
  );
}
