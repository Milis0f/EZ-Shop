"use client";

import { useLayoutEffect, useRef, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { mk } from "./motion-classes";
import { nextRadioIndex } from "./motion-utils";

export interface SegmentedOption<V extends string> {
  readonly value: V;
  readonly label: ReactNode;
}

interface SegmentedControlProps<V extends string> {
  readonly options: readonly SegmentedOption<V>[];
  readonly value: V;
  readonly onChange: (value: V) => void;
  /** Form field name: the chosen value is submitted with the enclosing form. */
  readonly name?: string;
  readonly "aria-label": string;
  readonly disabled?: boolean;
  readonly className?: string;
}

const RADIO = '[role="radio"]';
const CHECKED = '[role="radio"][aria-checked="true"]';

/** Moves the thumb onto the checked option. Layout offsets ignore ancestor transforms (page fades, dialogs). */
function writeThumb(track: HTMLElement): boolean {
  const checked = track.querySelector<HTMLElement>(CHECKED);
  if (!checked) {
    track.removeAttribute("data-thumb");
    return false;
  }
  track.style.setProperty("--thumb-x", `${checked.offsetLeft}px`);
  track.style.setProperty("--thumb-w", `${checked.offsetWidth}px`);
  return true;
}

/**
 * Pill radio group with a craie thumb that slides to the choice on the spring easing.
 * - Semantics: role="radiogroup", roving tabindex, arrows move and select, Home and End jump.
 * - Server render: the checked option paints the craie itself; once measured, the thumb takes over
 *   at the same place, so the first paint never jumps. Resizes (font swap, viewport) snap the thumb;
 *   only a choice animates it.
 */
export function SegmentedControl<V extends string>({
  options,
  value,
  onChange,
  name,
  "aria-label": ariaLabel,
  disabled = false,
  className,
}: SegmentedControlProps<V>) {
  const trackRef = useRef<HTMLDivElement>(null);
  const checkedIndex = options.findIndex((option) => option.value === value);
  const focusIndex = checkedIndex >= 0 ? checkedIndex : 0;
  // Stable across renders even when the caller passes a fresh options array each time.
  const optionsKey = options.map((option) => option.value).join("\u0000");

  // Placement without animation: on mount and whenever the track or an option changes size.
  useLayoutEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    let frame = 0;
    const snap = () => {
      track.dataset.thumb = "ready";
      if (!writeThumb(track)) return;
      // Commit the snapped position before transitions come back on.
      track.getBoundingClientRect();
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(() => {
          if (track.dataset.thumb) track.dataset.thumb = "live";
        });
      });
    };
    snap();
    if (typeof ResizeObserver === "undefined") return () => cancelAnimationFrame(frame);
    const observer = new ResizeObserver(snap);
    observer.observe(track);
    track.querySelectorAll(RADIO).forEach((radio) => observer.observe(radio));
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [optionsKey]);

  // A new choice: the thumb slides (the transition is on once the track is "live").
  useLayoutEffect(() => {
    const track = trackRef.current;
    if (track && writeThumb(track) && !track.dataset.thumb) track.dataset.thumb = "ready";
  }, [value]);

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const rtl = getComputedStyle(event.currentTarget).direction === "rtl";
    const target = nextRadioIndex(index, event.key, options.length, rtl);
    if (target === null) return;
    event.preventDefault();
    const option = options[target];
    if (option.value !== value) onChange(option.value);
    trackRef.current?.querySelectorAll<HTMLButtonElement>(RADIO)[target]?.focus();
  };

  return (
    <div
      ref={trackRef}
      role="radiogroup"
      aria-label={ariaLabel}
      aria-disabled={disabled || undefined}
      data-disabled={disabled || undefined}
      className={cn(mk.segmented, className)}
    >
      <span className={mk.segmentedThumb} aria-hidden />
      {options.map((option, index) => {
        const checked = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={index === focusIndex ? 0 : -1}
            disabled={disabled}
            className={mk.segmentedOption}
            onClick={() => {
              if (!checked) onChange(option.value);
            }}
            onKeyDown={(event) => onKeyDown(event, index)}
          >
            {option.label}
          </button>
        );
      })}
      {name ? <input type="hidden" name={name} value={value} /> : null}
    </div>
  );
}
