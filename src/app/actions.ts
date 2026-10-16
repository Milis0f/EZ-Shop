"use server";

import { redirect } from "next/navigation";
import { LANGUAGE_CODES, type LanguageCode } from "@/domain/country";
import type { AnalysisInputRaw } from "@/domain/schemas";
import { AnalysisValidationError } from "@/server/pipeline/run-analysis";
import { MockDataNotAllowedError } from "@/providers/registry";
import { ANALYSIS_RATE_LIMIT, checkRateLimit } from "@/server/rate-limit";
import { createAnalysis } from "@/server/services";

import type { SearchFormState } from "./search-form-state";

const optionalNumber = (value: FormDataEntryValue | null): number | undefined => {
  if (typeof value !== "string" || value.trim() === "") return undefined;
  const n = Number(value.replace(",", "."));
  return Number.isFinite(n) ? n : Number.NaN;
};

const optionalText = (value: FormDataEntryValue | null): string | undefined =>
  typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;

/**
 * Parses "de: Socken, Strümpfe" lines into { language, term } pairs; unknown languages are reported.
 * Not exported: every exported function of a "use server" module becomes a public endpoint.
 */
function parseExtraTerms(text: string): { terms: Array<{ language: LanguageCode; term: string }>; invalid: string[] } {
  const terms: Array<{ language: LanguageCode; term: string }> = [];
  const invalid: string[] = [];
  for (const line of text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)) {
    const match = /^([a-z]{2})\s*:\s*(.+)$/i.exec(line);
    const language = match?.[1].toLowerCase();
    if (!match || !language || !(LANGUAGE_CODES as readonly string[]).includes(language)) {
      invalid.push(line);
      continue;
    }
    for (const term of match[2].split(",").map((t) => t.trim()).filter(Boolean)) {
      terms.push({ language: language as LanguageCode, term });
    }
  }
  return { terms, invalid };
}

export async function submitAnalysis(_prev: SearchFormState, formData: FormData): Promise<SearchFormState> {
  const limit = checkRateLimit("analysis:form", ANALYSIS_RATE_LIMIT.limit, ANALYSIS_RATE_LIMIT.windowMs);
  if (!limit.allowed) return { error: `Trop d'analyses. Réessaie dans ${limit.retryAfterSeconds} s.` };

  const { terms, invalid } = parseExtraTerms(String(formData.get("extraTerms") ?? ""));
  if (invalid.length > 0) {
    return { fieldErrors: { extraTerms: `Format attendu « de: terme1, terme2 ». Lignes invalides : ${invalid.join(" | ")}` } };
  }

  const raw: AnalysisInputRaw = {
    productName: String(formData.get("productName") ?? ""),
    inputLanguage: String(formData.get("inputLanguage") ?? "fr") as LanguageCode,
    extraTerms: terms,
    countries: formData.getAll("countries").map(String) as AnalysisInputRaw["countries"],
    dataMode: formData.get("dataMode") === "mock" ? "mock" : "live",
    originCountry: (optionalText(formData.get("originCountry")) as AnalysisInputRaw["originCountry"]) ?? undefined,
    hsCode: optionalText(formData.get("hsCode")),
    economics: {
      currency: "EUR",
      sellingPrice: optionalNumber(formData.get("sellingPrice")),
      landedCost: optionalNumber(formData.get("landedCost")),
    },
  };

  let id: string;
  try {
    id = (await createAnalysis(raw)).id;
  } catch (error: unknown) {
    if (error instanceof AnalysisValidationError) {
      return { fieldErrors: Object.fromEntries(error.issues.map((i) => [i.path.split(".")[0] || "form", i.message])) };
    }
    if (error instanceof MockDataNotAllowedError) return { error: "Les données mock sont désactivées dans cet environnement." };
    console.error("[submitAnalysis]", error);
    return { error: "L'analyse a échoué. Consulte les logs serveur." };
  }
  redirect(`/analyses/${id}?created=1`);
}
