import { describe, expect, it } from "vitest";
import { LOCALES } from "../config";
import { MESSAGES } from "./index";

type Tree = { readonly [key: string]: string | Tree };

/** Every leaf path ("nav.newAnalysis"), sorted. Throws on anything that is not a string or a plain object. */
function leafPaths(tree: unknown, prefix = ""): string[] {
  if (tree === null || typeof tree !== "object" || Array.isArray(tree)) throw new Error(`${prefix || "root"} is not an object`);
  return Object.entries(tree)
    .flatMap(([key, value]) => {
      const path = prefix ? `${prefix}.${key}` : key;
      return typeof value === "string" ? [path] : leafPaths(value, path);
    })
    .sort();
}

const leaf = (tree: Tree, path: string): string =>
  path.split(".").reduce<string | Tree>((node, key) => (node as Tree)[key], tree) as string;

const placeholders = (tree: Tree): Record<string, string[]> =>
  Object.fromEntries(leafPaths(tree).map((path) => [path, [...leaf(tree, path).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()]));

describe("dictionaries", () => {
  for (const [area, dictionary] of Object.entries(MESSAGES)) {
    describe(area, () => {
      const reference = leafPaths(dictionary.en);

      for (const locale of LOCALES) {
        it(`${locale} has exactly the English keys, all non-empty strings`, () => {
          const tree = dictionary[locale] as Tree;
          expect(leafPaths(tree)).toEqual(reference);
          expect(reference.filter((path) => leaf(tree, path).trim() === "")).toEqual([]);
        });
      }

      it("uses the same {placeholders} in every language", () => {
        const en = placeholders(dictionary.en as Tree);
        expect(placeholders(dictionary.fr as Tree)).toEqual(en);
        expect(placeholders(dictionary.es as Tree)).toEqual(en);
      });
    });
  }

  it("keeps the verdict words of the brief", () => {
    expect(MESSAGES.common.en.verdict).toEqual({ yes: "YES", no: "NO", watch: "WATCH" });
    expect(MESSAGES.common.fr.verdict).toEqual({ yes: "OUI", no: "NON", watch: "À SURVEILLER" });
    expect(MESSAGES.common.es.verdict).toEqual({ yes: "SÍ", no: "NO", watch: "VIGILAR" });
  });
});
