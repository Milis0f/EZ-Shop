"use client";

import { ChevronDown } from "lucide-react";
import { useRouter } from "next/navigation";
import { startTransition, useEffect, useRef, useState } from "react";
import { viewTransition } from "@/components/motion/view-transition";
import { SegmentedControl, type SegmentedOption } from "@/components/motion/segmented-control";
import { useLocale, useMessages } from "@/i18n/client";
import { INTL_LOCALES, isLocale, LOCALE_LABELS, LOCALE_SHORT_LABELS, LOCALES, type Locale } from "@/i18n/config";
import { localeCookie } from "@/i18n/locale-script";
import { cn } from "@/lib/utils";

/** A refresh that never lands must not hold the page frozen in a View Transition. */
const REFRESH_TIMEOUT_MS = 2500;

const OPTIONS: readonly SegmentedOption<Locale>[] = LOCALES.map((locale) => ({
  value: locale,
  label: (
    <span lang={INTL_LOCALES[locale]} title={LOCALE_LABELS[locale]}>
      <span aria-hidden>{LOCALE_SHORT_LABELS[locale]}</span>
      <span className="sr-only">{LOCALE_LABELS[locale]}</span>
    </span>
  ),
}));

/**
 * Writes the choice to the ez-locale cookie and re-renders the server tree in the new language
 * (router.refresh), inside a View Transition that resolves once the new locale has arrived.
 */
function useSwitchLocale() {
  const router = useRouter();
  const locale = useLocale();
  const [choice, setChoice] = useState<Locale | null>(null);
  const settle = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (locale === choice) {
      settle.current?.();
      settle.current = null;
    }
  }, [locale, choice]);

  const switchTo = (next: Locale) => {
    if (next === (choice ?? locale)) return;
    setChoice(next);
    document.cookie = localeCookie(next);
    document.documentElement.lang = INTL_LOCALES[next];
    const update = () =>
      new Promise<void>((resolve) => {
        const timer = window.setTimeout(resolve, REFRESH_TIMEOUT_MS);
        settle.current = () => {
          window.clearTimeout(timer);
          resolve();
        };
        startTransition(() => router.refresh());
      });
    void viewTransition(update).catch(() => undefined);
  };

  return { value: choice ?? locale, switchTo };
}

/**
 * EN / FR / ES. A segmented pill from the small breakpoint up; a compact native menu on phones,
 * where the top bar also holds the logo and the mode toggle within 390px.
 */
export function LanguageSwitcher({ className }: { className?: string }) {
  const m = useMessages("shell");
  const { value, switchTo } = useSwitchLocale();

  return (
    <div className={className}>
      <SegmentedControl
        options={OPTIONS}
        value={value}
        onChange={switchTo}
        aria-label={m.language.label}
        className="max-sm:hidden [&_.mk-segmented-option]:min-h-8 [&_.mk-segmented-option]:px-3 [&_.mk-segmented-option]:text-xs"
      />
      <label className="relative inline-flex sm:hidden">
        <span className="sr-only">{m.language.change}</span>
        <select
          value={value}
          onChange={(event) => {
            if (isLocale(event.target.value)) switchTo(event.target.value);
          }}
          className={cn(
            "interactive min-h-10 appearance-none rounded-pill border border-line bg-surface-2 py-2 pr-8 pl-3.5 text-sm font-medium",
            "hover:bg-line",
          )}
        >
          {LOCALES.map((locale) => (
            <option key={locale} value={locale} lang={INTL_LOCALES[locale]} aria-label={LOCALE_LABELS[locale]}>
              {LOCALE_SHORT_LABELS[locale]}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute top-1/2 right-3 size-3.5 -translate-y-1/2" aria-hidden />
      </label>
    </div>
  );
}
