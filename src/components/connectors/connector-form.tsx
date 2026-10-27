"use client";

import { ArrowUpRight, Check, CircleCheck, Copy, Eye, EyeOff, Lock } from "lucide-react";
import { startTransition, useActionState, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { saveConnectorConfig } from "@/app/connectors/actions";
import { INITIAL_CONNECTOR_FORM_STATE } from "@/app/connectors/form-state";
import { ENV_FIELDS, type EnvEditorAccess, type FieldState } from "@/config/connector-fields";
import type { GuideStep } from "@/config/connector-guides";
import type { ProviderId } from "@/domain/provenance";
import { cn } from "@/lib/utils";
import { PendingButton } from "@/components/motion/pending-button";
import { ConnectionTest } from "./connection-test";

interface ConnectorFormProps {
  readonly providerId: ProviderId;
  readonly fields: readonly FieldState[];
  readonly editor: EnvEditorAccess;
  /** Shows the live connection test; the form then stays open after saving so it can be run. */
  readonly testable: boolean;
  /** Setup steps; fields not placed in a step are gathered in a last one. */
  readonly steps?: readonly GuideStep[];
  readonly onDone: () => void;
  readonly onCancel: () => void;
}

const inputClass =
  "h-11 w-full rounded-pill border border-line bg-background px-4 text-sm text-foreground transition-colors duration-[var(--dur-fast)] placeholder:text-muted-foreground/70 hover:border-foreground/20 focus-visible:border-foreground/30 focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50 aria-invalid:border-dashed aria-invalid:border-foreground/50";

/** Every variable of one connector. Submitted by hand so a failed save never wipes what was typed. */
/** Guide steps with every field placed once: leftovers go to a final "values" step. */
function placeFields(steps: readonly GuideStep[], fields: readonly FieldState[]): GuideStep[] {
  const placed = new Set(steps.flatMap((s) => s.fields ?? []));
  const leftover = fields.map((f) => f.name).filter((n) => !placed.has(n));
  return leftover.length > 0 ? [...steps, { title: "Saisir les valeurs", body: "Copie chaque valeur depuis la plateforme.", fields: leftover }] : [...steps];
}

function StepItem({ index, step, done, last, children }: { index: number; step: GuideStep; done: boolean; last: boolean; children?: ReactNode }) {
  return (
    <li className="relative grid grid-cols-[1.75rem_1fr] gap-x-4">
      {!last && <span aria-hidden className="absolute top-8 bottom-[-1.25rem] left-[0.8125rem] w-px bg-line" />}
      <span
        aria-hidden
        className={cn(
          "relative z-10 flex size-7 items-center justify-center rounded-full border text-xs font-semibold transition-colors duration-[var(--dur-base)]",
          done ? "border-foreground/30 bg-foreground text-background" : "border-line bg-surface text-muted-foreground",
        )}
      >
        {done ? <Check className="animate-check size-3.5" strokeWidth={3} /> : index}
      </span>
      <div className="min-w-0 pb-1">
        <h3 className="pt-1 text-sm font-medium">
          <span className="sr-only">Étape {index} : </span>
          {step.title}
        </h3>
        {step.body && <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{step.body}</p>}
        {step.link && (
          <a
            href={step.link.url}
            target="_blank"
            rel="noreferrer"
            className="interactive mt-2.5 inline-flex items-center gap-1 rounded-pill border border-line px-2.5 py-1 text-xs font-medium hover:bg-surface-2"
          >
            {step.link.label}
            <ArrowUpRight className="size-3" aria-hidden />
          </a>
        )}
        {children && <div className="mt-4 space-y-5">{children}</div>}
      </div>
    </li>
  );
}

export function ConnectorForm({ providerId, fields, editor, testable, steps = [], onDone, onCancel }: ConnectorFormProps) {
  const [state, dispatch, pending] = useActionState(saveConnectorConfig, INITIAL_CONNECTOR_FORM_STATE);

  useEffect(() => {
    if (state.status !== "saved" || !state.complete || testable) return;
    const timer = window.setTimeout(onDone, 1200);
    return () => window.clearTimeout(timer);
  }, [state, onDone, testable]);

  if (!editor.enabled) return <ManualInstructions fields={fields} reason={editor.reason} onClose={onCancel} />;

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    startTransition(() => dispatch(data));
  };

  return (
    <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col" aria-busy={pending} noValidate>
      <input type="hidden" name="providerId" value={providerId} />
      {/* Remounted after each save: inputs and "remove" toggles start from the new state. */}
      <div key={state.savedAt ?? 0} className="modal-scroll min-h-0 flex-1 overflow-y-auto px-6 py-6">
        <ol className="space-y-5">
          {placeFields(steps, fields).map((step, i, all) => {
            const own = (step.fields ?? []).flatMap((name) => fields.filter((f) => f.name === name));
            const done = own.length > 0 && own.every((f) => f.set || f.optional);
            return (
              <StepItem key={step.title} index={i + 1} step={step} done={done} last={!testable && i === all.length - 1}>
                {own.length > 0 &&
                  own.map((f) => <Field key={f.name} state={f} error={state.fieldErrors?.[f.name]} autoFocus={f.name === fields.find((x) => !x.set && !x.optional)?.name} />)}
              </StepItem>
            );
          })}
          {testable && (
            <StepItem
              index={placeFields(steps, fields).length + 1}
              step={{ title: "Tester la connexion", body: "Enregistre d'abord, puis vérifie les valeurs auprès de la plateforme." }}
              done={false}
              last
            >
              <ConnectionTest providerId={providerId} />
            </StepItem>
          )}
        </ol>
      </div>

      <footer className="border-t border-line px-6 py-4">
        <div aria-live="polite" className="min-h-0">
          {state.message && (
            <p
              key={state.savedAt ?? state.message}
              className={cn(
                "animate-slide-down mb-4 flex items-start gap-2 text-sm",
                state.status === "saved" ? "text-kind-observed" : "text-foreground",
              )}
            >
              {state.status === "saved" && <CircleCheck className="animate-check mt-0.5 size-4 shrink-0" aria-hidden />}
              {state.message}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Lock className="size-3.5 shrink-0" aria-hidden />
            Écrit dans .env.local, jamais renvoyé au navigateur.
          </p>
          <div className="ml-auto flex gap-2">
            <button type="button" onClick={onCancel} className="interactive rounded-pill px-3.5 py-2 text-sm text-muted-foreground hover:bg-surface-2 hover:text-foreground">
              {state.status === "saved" ? "Fermer" : "Annuler"}
            </button>
            <PendingButton pending={pending} pendingLabel="Enregistrement" className="min-h-10 px-5 text-sm">
              Enregistrer
            </PendingButton>
          </div>
        </div>
      </footer>
    </form>
  );
}

function FieldStatus({ state, removing }: { state: FieldState; removing: boolean }) {
  const [label, tone] = removing
    ? ["Sera retirée", "text-foreground"]
    : state.set
      ? ["Définie", "text-kind-observed"]
      : state.optional
        ? ["Facultative", "text-muted-foreground"]
        : ["À renseigner", "text-foreground"];
  return (
    <span className={cn("flex items-center gap-1.5 text-[11px] whitespace-nowrap", tone)}>
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {label}
    </span>
  );
}

function Field({ state, error, autoFocus }: { state: FieldState; error?: string; autoFocus: boolean }) {
  const spec = ENV_FIELDS[state.name];
  const [revealed, setRevealed] = useState(false);
  const [removing, setRemoving] = useState(false);
  if (!spec) return null;

  const id = `env-${state.name}`;
  const hintId = `${id}-hint`;
  const placeholder = state.set && spec.secret ? "Déjà définie : laisser vide pour la conserver" : (spec.placeholder ?? "Coller la valeur");

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-sm font-medium">
          {spec.label}
        </label>
        <FieldStatus state={state} removing={removing} />
      </div>
      <code className="mt-0.5 block text-[11px] text-muted-foreground">{state.name}</code>

      <div className="relative mt-2">
        <input
          id={id}
          name={state.name}
          type={spec.secret && !revealed ? "password" : "text"}
          defaultValue={spec.secret ? undefined : state.value}
          placeholder={placeholder}
          disabled={removing}
          autoFocus={autoFocus}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          data-1p-ignore
          data-lpignore="true"
          aria-invalid={Boolean(error)}
          aria-describedby={hintId}
          className={cn(inputClass, spec.secret && "pr-12 font-mono text-[13px] placeholder:font-sans placeholder:text-sm")}
        />
        {spec.secret && (
          <button
            type="button"
            onClick={() => setRevealed((v) => !v)}
            aria-label={revealed ? "Masquer la valeur" : "Afficher la valeur"}
            aria-pressed={revealed}
            disabled={removing}
            className="interactive absolute inset-y-1.5 right-1.5 flex w-8 items-center justify-center rounded-pill text-muted-foreground hover:bg-surface-2 hover:text-foreground"
          >
            {revealed ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
          </button>
        )}
      </div>
      {removing && <input type="hidden" name="clear" value={state.name} />}

      <div id={hintId} className="mt-1.5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="max-w-[60ch] leading-relaxed">
          {error ? <span className="text-foreground">{error}</span> : spec.help}
          {spec.helpUrl && !error && (
            <>
              {" "}
              <a href={spec.helpUrl} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-foreground">
                Voir
              </a>
            </>
          )}
        </span>
        {state.set && (
          <button type="button" onClick={() => setRemoving((v) => !v)} className="shrink-0 underline-offset-2 hover:text-foreground hover:underline">
            {removing ? "Conserver" : "Retirer"}
          </button>
        )}
      </div>
    </div>
  );
}

/** Production or remote access: nothing is written, the exact lines to add are shown instead. */
function ManualInstructions({ fields, reason, onClose }: { fields: readonly FieldState[]; reason: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const template = fields.map((f) => `${f.name}=`).join("\n");
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(template);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  return (
    <div className="space-y-4 px-6 py-6 text-sm">
      <p className="text-muted-foreground">{reason}</p>
      <div className="relative overflow-hidden rounded-tile border border-line bg-background">
        <pre className="overflow-x-auto px-4 py-3 text-xs leading-relaxed">{template}</pre>
        <button
          type="button"
          onClick={copy}
          className="interactive absolute top-2 right-2 inline-flex items-center gap-1 rounded-pill bg-surface-2 px-2.5 py-1 text-[11px] text-muted-foreground hover:text-foreground"
        >
          <Copy className="size-3" aria-hidden />
          {copied ? "Copié" : "Copier"}
        </button>
      </div>
      <div className="flex justify-end">
        <button type="button" onClick={onClose} className="interactive rounded-pill px-3.5 py-2 text-sm text-muted-foreground hover:bg-surface-2 hover:text-foreground">
          Fermer
        </button>
      </div>
    </div>
  );
}
