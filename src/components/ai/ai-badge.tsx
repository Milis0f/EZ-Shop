import { cn } from "@/lib/utils";
import type { AiAuraState } from "./ai-aura";
import "./ai-aura.css";

/** Small pill (« IA locale », "Local AI") with a pearl dot that glows, and pulses only while the AI is writing. */
export function AiBadge({ label, state = "ready", className }: { label: string; state?: AiAuraState; className?: string }) {
  return (
    <span data-state={state} className={cn("ai-badge", className)}>
      <span aria-hidden className="ai-badge-dot" />
      {label}
    </span>
  );
}
