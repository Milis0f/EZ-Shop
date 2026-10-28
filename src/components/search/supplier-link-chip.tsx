import { Link2 } from "lucide-react";
import { Reveal } from "@/components/motion/reveal";
import { useMessages } from "@/i18n/client";
import { t } from "@/i18n/translate";
import { cn } from "@/lib/utils";
import type { SupplierInput } from "./supplier-input";

interface SupplierLinkChipProps {
  readonly input: SupplierInput;
  readonly id?: string;
  readonly className?: string;
}

/**
 * Live reading of a pasted supplier address, offline: a pill for a recognised product page, the localized
 * guidance for anything that cannot be used. Each new reading rises in once (the key replays it).
 */
export function SupplierLinkChip({ input, id, className }: SupplierLinkChipProps) {
  const m = useMessages("home").supplier;
  return (
    <div id={id} aria-live="polite" className={cn("flex min-h-9 justify-center", className)}>
      {input.kind === "product" && (
        <Reveal
          as="p"
          key={input.chipLabel}
          title={t(m.chipTitle, { id: input.productId })}
          className="inline-flex max-w-full items-center gap-2 rounded-pill border border-line bg-surface-2 px-4 py-2 text-sm font-medium"
        >
          <Link2 className="size-3.5 shrink-0 text-muted-foreground" strokeWidth={1.75} aria-hidden />
          <span className="truncate">{input.chipLabel}</span>
        </Reveal>
      )}
      {input.kind === "guidance" && (
        <Reveal as="p" key={input.message} className="max-w-md px-2 py-2 text-sm leading-snug text-muted-foreground">
          {input.message}
        </Reveal>
      )}
    </div>
  );
}
