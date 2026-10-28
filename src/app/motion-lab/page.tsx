import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getMessages } from "@/i18n/server";
import { MotionLab } from "./motion-lab";

export async function generateMetadata(): Promise<Metadata> {
  const m = await getMessages("methodology");
  return { title: m.motionLab.metadataTitle, robots: { index: false, follow: false } };
}

/** Development only: every motion primitive, with demo controls. Absent from production builds. */
export default async function MotionLabPage() {
  if (process.env.NODE_ENV === "production") notFound();
  const m = (await getMessages("methodology")).motionLab;

  return (
    <div className="mx-auto max-w-5xl">
      <header className="max-w-2xl">
        <h1 className="text-3xl font-semibold tracking-tight">{m.title}</h1>
        <p className="mt-4 leading-relaxed text-muted-foreground">{m.intro}</p>
      </header>
      <MotionLab />
    </div>
  );
}
