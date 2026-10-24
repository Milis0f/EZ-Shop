"use client";

import type { ComponentPropsWithRef, ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { cn } from "@/lib/utils";
import { mk } from "./motion-classes";
import { RingLoader } from "./ring-loader";

interface PendingButtonProps extends Omit<ComponentPropsWithRef<"button">, "children"> {
  /** The idle label, e.g. « Analyser ». */
  readonly children: ReactNode;
  /** Shown next to the ring while pending, e.g. « Analyse en cours ». */
  readonly pendingLabel: ReactNode;
  /** Explicit state. Left out, the button follows its parent form's submission (useFormStatus). */
  readonly pending?: boolean;
}

/**
 * Craie pill button whose label crossfades to a ring loader and a pending label. Both labels share
 * one grid cell, so the width never changes and the text never wraps. While pending it is disabled
 * and aria-busy; a press sinks it slightly and springs back.
 */
export function PendingButton({
  children,
  pendingLabel,
  pending: pendingProp,
  disabled,
  className,
  type = "submit",
  ...rest
}: PendingButtonProps) {
  const { pending: formPending } = useFormStatus();
  const pending = pendingProp ?? formPending;

  return (
    <button
      {...rest}
      type={type}
      disabled={disabled || pending}
      aria-busy={pending || undefined}
      className={cn(mk.pendingButton, className)}
    >
      <span className={cn(mk.pendingLayer, mk.pendingIdle)} aria-hidden={pending || undefined}>
        {children}
      </span>
      <span className={cn(mk.pendingLayer, mk.pendingBusy)} aria-hidden={!pending || undefined}>
        <RingLoader size="sm" />
        <span>{pendingLabel}</span>
      </span>
    </button>
  );
}
