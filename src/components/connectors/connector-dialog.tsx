"use client";

import { ArrowUpRight, KeyRound, X } from "lucide-react";
import { useCallback, useId, useRef, useState, type ReactNode } from "react";
import type { ProviderId } from "@/domain/provenance";
import type { VerificationLevel } from "@/providers/contracts";
import { TESTABLE_PROVIDERS, type EnvEditorAccess, type FieldState } from "@/config/connector-fields";
import { CONNECTOR_GUIDES } from "@/config/connector-guides";
import { cn } from "@/lib/utils";
import { ConnectorForm } from "./connector-form";
import "./connectors.css";

interface ConnectorDialogProps {
  readonly providerId: ProviderId;
  readonly name: string;
  readonly docsUrl: string;
  readonly accessLabel: string;
  readonly verification: VerificationLevel;
  readonly fields: readonly FieldState[];
  readonly editor: EnvEditorAccess;
  /** Server-rendered state pill, shown next to the title. */
  readonly pill: ReactNode;
}

const NOTICES: Partial<Record<VerificationLevel, string>> = {
  not_implemented:
    "Ce connecteur n'est pas encore codé : les valeurs sont enregistrées pour plus tard, mais aucune donnée ne sera collectée.",
  documented_unverified:
    "Connecteur écrit d'après la documentation officielle, jamais testé avec de vraies clés : le premier appel réel peut révéler un écart.",
};

/**
 * "Configurer" button and its modal. The panel opens centred over a dimmed, blurred page
 * (native <dialog>: focus trap, Escape and top layer come with it); a click on the backdrop closes it.
 */
export function ConnectorDialog({ providerId, name, docsUrl, accessLabel, verification, fields, editor, pill }: ConnectorDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const pressedOnBackdrop = useRef(false);
  // A new key per opening: the form starts clean every time.
  const [session, setSession] = useState(0);
  const titleId = useId();
  const missing = fields.filter((f) => !f.optional && !f.set).length;
  const configured = missing === 0 && fields.some((f) => f.set);

  const open = () => {
    setSession((n) => n + 1);
    ref.current?.showModal();
  };
  const close = useCallback(() => ref.current?.close(), []);

  return (
    <>
      <button
        type="button"
        onClick={open}
        aria-haspopup="dialog"
        className={cn(
          "interactive inline-flex h-9 shrink-0 items-center gap-1.5 rounded-pill border px-4 text-[13px] font-medium whitespace-nowrap",
          missing > 0 ? "border-foreground/20 bg-foreground text-background hover:bg-foreground/85" : "border-line hover:bg-surface-2",
        )}
      >
        <KeyRound className="size-3.5" strokeWidth={1.5} aria-hidden />
        {configured ? "Modifier" : "Configurer"}
      </button>

      <dialog
        ref={ref}
        aria-labelledby={titleId}
        className="modal cx-sheet"
        onPointerDown={(e) => {
          pressedOnBackdrop.current = e.target === e.currentTarget;
        }}
        onClick={(e) => {
          // Close only when the press started and ended outside the panel (not after a text selection drag).
          if (e.target === e.currentTarget && pressedOnBackdrop.current) close();
        }}
      >
        <div className="flex max-h-[inherit] flex-col">
          <span aria-hidden className="cx-sheet-handle" />
          <header className="flex items-start justify-between gap-4 border-b border-line px-6 pt-5 pb-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2.5">
                <h2 id={titleId} className="text-base font-semibold tracking-tight">
                  {name}
                </h2>
                {pill}
              </div>
              <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                {accessLabel}
                <a href={docsUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 underline-offset-4 hover:text-foreground hover:underline">
                  Documentation officielle
                  <ArrowUpRight className="size-3" aria-hidden />
                </a>
              </p>
            </div>
            <button
              type="button"
              onClick={close}
              aria-label="Fermer"
              className="interactive -mr-2 rounded-pill p-1.5 text-muted-foreground hover:bg-surface-2 hover:text-foreground"
            >
              <X className="size-4" aria-hidden />
            </button>
          </header>

          {CONNECTOR_GUIDES[providerId] && (
            <div className="flex flex-col gap-1 border-b border-line px-6 py-3 text-xs min-[900px]:flex-row min-[900px]:items-baseline min-[900px]:gap-4">
              <p className="min-w-0 flex-1 text-foreground">{CONNECTOR_GUIDES[providerId].brings}</p>
              <p className="text-muted-foreground">
                {CONNECTOR_GUIDES[providerId].cost}
                {CONNECTOR_GUIDES[providerId].setupTime && <>, {CONNECTOR_GUIDES[providerId].setupTime}</>}
              </p>
            </div>
          )}

          {NOTICES[verification] && (
            <p className="border-b border-line px-6 py-3 text-xs leading-relaxed text-verdict-surveiller">{NOTICES[verification]}</p>
          )}

          <ConnectorForm
            key={session}
            providerId={providerId}
            fields={fields}
            editor={editor}
            testable={editor.enabled && TESTABLE_PROVIDERS.has(providerId)}
            steps={CONNECTOR_GUIDES[providerId]?.steps}
            onDone={close}
            onCancel={close}
          />
        </div>
      </dialog>
    </>
  );
}
