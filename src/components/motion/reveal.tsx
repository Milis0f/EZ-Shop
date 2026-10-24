"use client";

import { createElement, type HTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { mk } from "./motion-classes";
import { cssVars } from "./motion-utils";
import { useDeferUntilVisible } from "./use-defer-until-visible";

type RevealGroupTag = "div" | "section" | "ul" | "ol" | "dl";
type RevealTag = "div" | "li" | "span" | "p" | "section" | "article";

interface RevealGroupProps extends HTMLAttributes<HTMLElement> {
  readonly as?: RevealGroupTag;
  /**
   * "mount": plays as soon as the group is inserted, from the server render on (above the fold,
   * the orchestrated moment). "visible": same when it is on screen at mount, otherwise waits until
   * it scrolls in.
   */
  readonly trigger?: "mount" | "visible";
  /** Gap between two items, in ms (default 60). */
  readonly step?: number;
  readonly children: ReactNode;
}

/**
 * A one-time, staggered rise and fade for its <Reveal> items. Plays once; re-renders never replay it.
 * Under reduced motion everything is shown at once.
 */
export function RevealGroup({ as = "div", trigger = "visible", step, className, style, children, ...rest }: RevealGroupProps) {
  const deferRef = useDeferUntilVisible<HTMLElement>(trigger === "visible");
  return createElement(
    as,
    {
      ...rest,
      ref: deferRef,
      className: cn(mk.revealGroup, className),
      style: step === undefined ? style : { ...style, ...cssVars({ "--reveal-step": `${step}ms` }) },
    },
    children,
  );
}

interface RevealProps extends HTMLAttributes<HTMLElement> {
  readonly as?: RevealTag;
  /** Place in the sequence: the item starts index × step after the first one. */
  readonly index?: number;
}

/** One item of a RevealGroup. Alone, it rises once on mount. */
export function Reveal({ as = "div", index = 0, className, style, ...rest }: RevealProps) {
  return createElement(as, {
    ...rest,
    className: cn(mk.revealItem, className),
    style: { ...style, ...cssVars({ "--i": index }) },
  });
}
