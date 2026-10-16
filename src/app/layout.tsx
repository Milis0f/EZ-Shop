import type { Metadata } from "next";
import { Schibsted_Grotesk } from "next/font/google";
import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { MODE_INIT_SCRIPT } from "@/components/layout/mode";
import { THEME_INIT_SCRIPT } from "@/components/layout/theme";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const sans = Schibsted_Grotesk({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: { default: "EZ-Shop", template: "%s | EZ-Shop" },
  description:
    "Estimer le potentiel commercial d'un produit avant lancement, pays par pays, à partir de données externes traçables.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // The theme class and data-mode are set by the inline script before paint, hence the hydration exception.
    <html lang="fr" className={`${sans.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT + MODE_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full">
        <TooltipProvider delayDuration={150}>
          <AppShell>{children}</AppShell>
        </TooltipProvider>
      </body>
    </html>
  );
}
