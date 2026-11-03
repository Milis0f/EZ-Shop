import { cn } from "@/lib/utils";
import "./marketing.css";

/** The heading line of a block, as a shell would name it: "── ~/analyses". Decoration only. */
export function TermBar({ title, className }: { readonly title: string; readonly className?: string }) {
  return (
    <div aria-hidden className={cn("term-bar", className)}>
      <span className="term-title">── {title}</span>
    </div>
  );
}

/** A command typing itself above a title, ending on the block cursor. Decoration too: the title says it all. */
export function TermPrompt({ command, className }: { readonly command: string; readonly className?: string }) {
  return (
    <p aria-hidden className={cn("term-prompt", className)}>
      <span className="term-path">~ %</span>
      <span className="term-typed" style={{ "--n": command.length } as React.CSSProperties}>
        {command}
      </span>
      <span className="term-cursor" />
    </p>
  );
}
