"use client";

import { AiAura } from "@/components/ai/ai-aura";
import { AiBadge } from "@/components/ai/ai-badge";
import { AiInstallButton } from "@/components/ai/ai-install-button";
import { KindMarker } from "@/components/data/kind-marker";
import type { WebReading, WebSource } from "@/domain/web";
import { useMessages } from "@/i18n/client";

/** Only http(s) links are ever rendered: addresses come from the web. */
export const safeHref = (url: string): string | undefined => (/^https?:\/\//i.test(url) ? url : undefined);

export function ExternalLink({ href, children }: { readonly href: string; readonly children: React.ReactNode }) {
  const m = useMessages("web").results;
  const safe = safeHref(href);
  if (!safe) return <span>{children}</span>;
  return (
    <a href={safe} target="_blank" rel="noopener noreferrer nofollow" title={m.openLink} className="underline decoration-line underline-offset-4 transition-colors duration-(--dur-fast) hover:decoration-foreground">
      {children}
    </a>
  );
}

/** What the AI wrote from web material, inside the aura; when there is nothing, it says why. */
export function WebReadingBlock({ reading, badge }: { readonly reading: WebReading; readonly badge: string }) {
  const m = useMessages("web").results;
  if (!reading.summary) {
    if (!reading.note) return null;
    return (
      <div className="flex flex-col items-center gap-4">
        <p className="text-sm text-muted-foreground">{m.aiNotes[reading.note]}</p>
        {reading.note === "ai_missing" && <AiInstallButton />}
      </div>
    );
  }
  return (
    <AiAura state="ready" surfaceClassName="p-5 sm:p-6">
      <AiBadge label={badge} state="ready" />
      <p className="mt-4 text-sm leading-relaxed">{reading.summary.summary}</p>
      {reading.summary.keyPoints.length > 0 && (
        <>
          <h4 className="mt-5 text-sm font-medium">{m.keyPoints}</h4>
          <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-5 text-sm leading-relaxed">
            {reading.summary.keyPoints.map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>
        </>
      )}
    </AiAura>
  );
}

export function WebSourceList({ sources }: { readonly sources: readonly WebSource[] }) {
  const m = useMessages("web").results;
  return (
    <ul className="divide-y divide-line">
      {sources.map((source) => (
        <li key={source.url} className="py-3">
          <p className="text-sm font-medium break-words">
            <ExternalLink href={source.url}>{source.title || source.url}</ExternalLink>
          </p>
          {source.snippet && <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{source.snippet}</p>}
          <p className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground">
            <KindMarker kind={source.read ? "observed" : "assumption"} />
            {source.read ? m.pageRead : m.snippetOnly}
          </p>
        </li>
      ))}
    </ul>
  );
}
