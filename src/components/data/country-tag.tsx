import type { CountryCode } from "@/domain/country";
import { cn } from "@/lib/utils";

/** ISO code tag — renders identically on every OS (flag emoji do not on Windows). */
export function CountryTag({ code, className }: { code: CountryCode; className?: string }) {
  return (
    <span aria-hidden className={cn("inline-block w-6 shrink-0 text-[10px] font-semibold tracking-wide text-muted-foreground", className)}>
      {code}
    </span>
  );
}
