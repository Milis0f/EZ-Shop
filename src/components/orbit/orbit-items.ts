import { Compass, Cpu, Database, ScanSearch, Store, type LucideIcon } from "lucide-react";
import type { Messages } from "@/i18n/messages";

/**
 * The five places of the app, set around the planet like the owner's sketch: Analyse at the top, My shop on
 * the right, Settings bottom right, Data sources bottom left, Competitor on the left. The angle is measured
 * clockwise from the top. Each one opens a short choice; the first choice is where its button leads.
 */

type Orbit = Messages<"shell">["orbit"];

export interface OrbitOption {
  readonly href: string;
  readonly label: string;
  readonly hint: string;
}

export interface OrbitItem {
  readonly key: "analyse" | "shop" | "settings" | "sources" | "competitor";
  readonly title: string;
  readonly icon: LucideIcon;
  /** Degrees, clockwise from the top. */
  readonly angle: number;
  /** Which way its choices open, away from the planet. */
  readonly side: "below" | "right" | "left" | "above-right" | "above-left";
  readonly options: readonly OrbitOption[];
  readonly isActive: (pathname: string) => boolean;
}

export function orbitItems(m: Orbit): readonly OrbitItem[] {
  return [
    {
      key: "analyse",
      title: m.analyse.title,
      icon: ScanSearch,
      angle: 0,
      side: "below",
      options: [
        { href: "/analyse", label: m.analyse.simple, hint: m.analyse.simpleHint },
        { href: "/analyse/approfondie", label: m.analyse.deep, hint: m.analyse.deepHint },
        { href: "/analyse/ia", label: m.analyse.ai, hint: m.analyse.aiHint },
        { href: "/analyses", label: m.analyse.recent, hint: m.analyse.recentHint },
      ],
      isActive: (p) => p.startsWith("/analyse"),
    },
    {
      key: "shop",
      title: m.shop.title,
      icon: Store,
      angle: 66,
      side: "right",
      options: [
        { href: "/store", label: m.shop.overview, hint: m.shop.overviewHint },
        { href: "/store?tab=traffic", label: m.shop.traffic, hint: m.shop.trafficHint },
        { href: "/store?tab=advice", label: m.shop.advice, hint: m.shop.adviceHint },
        { href: "/store?tab=products", label: m.shop.products, hint: m.shop.productsHint },
        { href: "/store?tab=ads", label: m.shop.ads, hint: m.shop.adsHint },
        { href: "/store?tab=connect", label: m.shop.connect, hint: m.shop.connectHint },
      ],
      isActive: (p) => p.startsWith("/store"),
    },
    {
      key: "settings",
      title: m.settings.title,
      icon: Cpu,
      angle: 136,
      side: "above-right",
      options: [
        { href: "/settings", label: m.settings.general, hint: m.settings.generalHint },
        { href: "/settings#ai", label: m.settings.ai, hint: m.settings.aiHint },
      ],
      isActive: (p) => p.startsWith("/settings"),
    },
    {
      key: "sources",
      title: m.sources.title,
      icon: Database,
      angle: 224,
      side: "above-left",
      options: [
        { href: "/connectors", label: m.sources.list, hint: m.sources.listHint },
        { href: "/methodology", label: m.sources.method, hint: m.sources.methodHint },
      ],
      isActive: (p) => p.startsWith("/connectors") || p.startsWith("/methodology"),
    },
    {
      key: "competitor",
      title: m.competitor.title,
      icon: Compass,
      angle: 294,
      side: "left",
      options: [
        { href: "/competitor", label: m.competitor.check, hint: m.competitor.checkHint },
        { href: "/competitor#free-search-title", label: m.competitor.search, hint: m.competitor.searchHint },
      ],
      isActive: (p) => p.startsWith("/competitor"),
    },
  ];
}
