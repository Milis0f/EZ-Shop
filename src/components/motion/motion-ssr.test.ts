/* eslint-disable react/no-children-prop -- a .ts test has no JSX, and required children must be typed props for createElement. */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AnimatedNumber } from "./animated-number";
import { Expand } from "./expand";
import { PendingButton } from "./pending-button";
import { ProgressRing } from "./progress-ring";
import { Reveal, RevealGroup } from "./reveal";
import { RingLoader } from "./ring-loader";
import { SegmentedControl } from "./segmented-control";

/**
 * Server render of every primitive: what the first paint shows before any script runs, and what
 * hydration must match. Interaction is checked in the browser on /motion-lab.
 */
const html = (element: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(element);

describe("SegmentedControl on the server", () => {
  const options = [
    { value: "fr", label: "France" },
    { value: "world", label: "Monde entier" },
  ] as const;
  const markup = html(
    createElement(SegmentedControl<"fr" | "world">, { options, value: "world", onChange: vi.fn(), name: "zone", "aria-label": "Zone" }),
  );

  it("is a labelled radio group with one tab stop, on the checked option", () => {
    expect(markup).toContain('role="radiogroup"');
    expect(markup).toContain('aria-label="Zone"');
    expect(markup).toMatch(/aria-checked="false" tabindex="-1"[^>]*>France</);
    expect(markup).toMatch(/aria-checked="true" tabindex="0"[^>]*>Monde entier</);
  });

  it("submits the value with its form", () => {
    expect(markup).toContain('<input type="hidden" name="zone" value="world"/>');
  });

  it("paints the checked option itself until the thumb is measured", () => {
    expect(markup).not.toContain("data-thumb");
  });
});

describe("PendingButton on the server", () => {
  it("is an enabled submit button outside a pending form, idle label spoken", () => {
    const markup = html(createElement(PendingButton, { pendingLabel: "Analyse en cours", children: "Analyser" }));
    expect(markup).toContain('type="submit"');
    expect(markup).not.toContain("disabled");
    expect(markup).not.toContain("aria-busy");
    expect(markup).toMatch(/mk-pending-busy" aria-hidden="true"/);
  });

  it("is disabled and busy when pending, pending label spoken", () => {
    const markup = html(createElement(PendingButton, { pending: true, type: "button", pendingLabel: "Analyse en cours", children: "Analyser" }));
    expect(markup).toContain('disabled=""');
    expect(markup).toContain('aria-busy="true"');
    expect(markup).toMatch(/mk-pending-idle" aria-hidden="true"/);
    expect(markup).not.toMatch(/mk-pending-busy" aria-hidden/);
  });
});

describe("AnimatedNumber on the server", () => {
  it("shows the final value, in tabular figures, visible and spoken", () => {
    const markup = html(createElement(AnimatedNumber, { value: 1234, format: "int" }));
    expect(markup).toContain('class="tabular-nums"');
    const finals = markup.match(/>1\s?234</g) ?? [];
    expect(finals).toHaveLength(2);
  });
});

describe("ProgressRing on the server", () => {
  it("is one labelled image holding its final offset", () => {
    const markup = html(createElement(ProgressRing, { value: 64, "aria-label": "Jauge 64 %" }));
    expect(markup).toContain('role="img"');
    expect(markup).toContain('aria-label="Jauge 64 %"');
    expect(markup).toContain("--ring-offset:36");
    expect(markup).not.toContain("data-empty");
  });

  it("draws nothing for zero or a non-number", () => {
    expect(html(createElement(ProgressRing, { value: 0, "aria-label": "Vide" }))).toContain("data-empty");
    expect(html(createElement(ProgressRing, { value: Number.NaN, "aria-label": "Vide" }))).toContain("data-empty");
  });

  it("adds a blurred copy of the arc for the glow, never a box-shadow", () => {
    const markup = html(createElement(ProgressRing, { value: 50, glow: true, "aria-label": "Halo" }));
    expect(markup).toContain("<feGaussianBlur");
    expect(markup).toMatch(/filter="url\(#ring-glow-[\w-]+\)"/);
    expect(markup).not.toContain("box-shadow");
  });
});

describe("Expand on the server", () => {
  it("keeps closed content in the page but inert", () => {
    const markup = html(createElement(Expand, { open: false, children: "Détail" }));
    expect(markup).toContain('inert=""');
    expect(markup).not.toContain("data-open");
    expect(markup).toContain("Détail");
  });

  it("marks open content", () => {
    const markup = html(createElement(Expand, { open: true, children: "Détail" }));
    expect(markup).toContain('data-open="true"');
    expect(markup).not.toContain("inert");
  });
});

describe("Reveal on the server", () => {
  it("renders visible items with their place in the sequence", () => {
    const markup = html(
      createElement(RevealGroup, { as: "ul", step: 80, children: createElement(Reveal, { as: "li", index: 2 }, "Signal") }),
    );
    expect(markup).toContain("--reveal-step:80ms");
    expect(markup).toContain('<li class="mk-reveal-item" style="--i:2">Signal</li>');
    expect(markup).not.toContain("data-motion");
  });
});

describe("RingLoader on the server", () => {
  it("is decorative by default and a status when it carries a label", () => {
    expect(html(createElement(RingLoader, {}))).toContain('aria-hidden="true"');
    const labelled = html(createElement(RingLoader, { label: "Chargement" }));
    expect(labelled).toContain('role="status"');
    expect(labelled).toContain("Chargement");
  });
});
