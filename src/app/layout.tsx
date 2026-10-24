import type { Metadata, Viewport } from "next";
import { Figtree, Unbounded } from "next/font/google";
import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { MODE_INIT_SCRIPT } from "@/components/layout/mode";
import { TooltipProvider } from "@/components/ui/tooltip";
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

export const metadata: Metadata = {
  title: { default: "EZ-Shop", template: "%s | EZ-Shop" },
  description:
    "Estimer le potentiel commercial d'un produit avant lancement, pays par pays, à partir de données externes traçables.",
};

/** Dark only: the browser chrome and form controls match the true black base before the CSS loads. */
export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "#000000",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // data-mode is set by the inline script before paint, hence the hydration exception.
    <html lang="fr" className={`${sans.variable} ${display.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: MODE_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full">
        <TooltipProvider delayDuration={150}>
          <AppShell>{children}</AppShell>
        </TooltipProvider>
      </body>
    </html>
  );
}
