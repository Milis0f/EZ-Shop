import type { Metadata, Viewport } from "next";
import { Figtree, Unbounded } from "next/font/google";
import { Suspense, type ReactNode } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { MODE_INIT_SCRIPT } from "@/components/layout/mode";
import { TooltipProvider } from "@/components/ui/tooltip";
import { LocaleProvider } from "@/i18n/client";
import { DEFAULT_LOCALE, INTL_LOCALES } from "@/i18n/config";
import { LOCALE_INIT_SCRIPT } from "@/i18n/locale-script";
import { getLocale, getMessages } from "@/i18n/server";
import "./globals.css";

/** Everything except the display moments: body text, UI, numbers. */
const sans = Figtree({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

/** Display face, only for the logo, the product name and the verdict word (`font-display`). */
const display = Unbounded({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "700"],
});

/** Request-bound like the rest of the tree (the locale comes from the cookie): streams with it. */
export async function generateMetadata(): Promise<Metadata> {
  const m = await getMessages("shell");
  return {
    title: { default: "EZ-Shop", template: "%s | EZ-Shop" },
    description: m.metadata.description,
  };
}

/** Dark only: the browser chrome and form controls match the true black base before the CSS loads. */
export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "#000000",
};

/**
 * Reads the locale (cookie, then Accept-Language) and hands it to the shell and to Client Components.
 * Request data under Cache Components: it renders inside the root <Suspense> below.
 */
async function LocalizedShell({ children }: { children: ReactNode }) {
  const locale = await getLocale();
  return (
    <LocaleProvider locale={locale}>
      {/* The server HTML states the language of the content too: crawlers and clients without
          JavaScript never see the <html lang> fixed by the inline script. */}
      <div lang={INTL_LOCALES[locale]} className="contents">
        <AppShell>{children}</AppShell>
      </div>
    </LocaleProvider>
  );
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // data-mode and lang are set by the inline scripts before paint, hence the hydration exception.
    // The layout itself stays static: reading the cookie here would leave no child to suspend
    // (Next 16 Cache Components guidance for <html> attributes).
    <html lang={INTL_LOCALES[DEFAULT_LOCALE]} className={`${sans.variable} ${display.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: MODE_INIT_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: LOCALE_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full">
        <TooltipProvider delayDuration={150}>
          <Suspense fallback={<div className="min-h-dvh" />}>
            <LocalizedShell>{children}</LocalizedShell>
          </Suspense>
        </TooltipProvider>
      </body>
    </html>
  );
}
