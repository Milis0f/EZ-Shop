/**
 * Pure parsers for the GOV.UK Trade Tariff API (JSON:API documents). Shared by the GB tariff (/uk/api)
 * and the Northern Ireland tariff (/xi/api), which applies the EU Common Customs Tariff.
 */

export interface JsonApiResource {
  readonly id: string;
  readonly type: string;
  readonly attributes?: Record<string, unknown>;
  readonly relationships?: Record<string, { readonly data?: { readonly id: string; readonly type: string } | ReadonlyArray<{ readonly id: string; readonly type: string }> | null }>;
}

interface JsonApiDocument {
  readonly data?: JsonApiResource | JsonApiResource[];
  readonly included?: readonly JsonApiResource[];
}

const asDoc = (payload: unknown): JsonApiDocument => (payload !== null && typeof payload === "object" ? (payload as JsonApiDocument) : {});
const str = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);
const relId = (r: JsonApiResource, name: string): string | undefined => {
  const data = r.relationships?.[name]?.data;
  return data && !Array.isArray(data) ? (data as { id: string }).id : undefined;
};
const relIds = (r: JsonApiResource, name: string): string[] => {
  const data = r.relationships?.[name]?.data;
  return Array.isArray(data) ? data.map((d) => d.id) : [];
};

// ---------- Search ----------

export type SearchHit =
  | { readonly kind: "exact"; readonly endpoint: string; readonly id: string }
  | { readonly kind: "fuzzy"; readonly codes: readonly string[] }
  | { readonly kind: "none" };

export function parseSearch(payload: unknown): SearchHit {
  const data = asDoc(payload).data;
  const attributes = data && !Array.isArray(data) ? data.attributes : undefined;
  const entry = attributes?.entry as { endpoint?: unknown; id?: unknown } | undefined;
  if (attributes?.type === "exact_match" && typeof entry?.endpoint === "string" && typeof entry.id === "string") {
    return { kind: "exact", endpoint: entry.endpoint, id: entry.id };
  }
  const match = attributes?.goods_nomenclature_match as Record<string, unknown> | undefined;
  const items = [...((match?.commodities as unknown[]) ?? []), ...((match?.headings as unknown[]) ?? [])];
  const codes = items.flatMap((item) => {
    const o = item as Record<string, unknown>;
    const source = (o._source as Record<string, unknown> | undefined) ?? o;
    const code = str(source.goods_nomenclature_item_id);
    return code ? [code] : [];
  });
  return codes.length > 0 ? { kind: "fuzzy", codes } : { kind: "none" };
}

/**
 * Description of the node returned by /commodities, /subheadings or /headings. Deep nodes often read
 * "Other" on their own: the heading's description is put in front so the label makes sense.
 */
export function parseNodeDescription(payload: unknown): string | null {
  const doc = asDoc(payload);
  const data = doc.data;
  if (!data || Array.isArray(data)) return null;
  const own = str(data.attributes?.description_plain) ?? str(data.attributes?.description) ?? null;
  if (data.type === "heading") return own;
  const heading = (doc.included ?? []).find((r) => r.type === "heading");
  const parent = str(heading?.attributes?.description_plain) ?? str(heading?.attributes?.description);
  if (!parent) return own;
  const short = parent.length > 90 ? `${parent.slice(0, 87).replace(/[\s,;]+\S*$/, "")}…` : parent;
  return own ? `${short} › ${own}` : short;
}

// ---------- Heading → declarable commodities ----------

export interface LeafCommodity {
  readonly code: string;
  readonly description: string;
}

/** Declarable end-lines of a heading whose code starts with `prefix` (4 to 10 digits). */
export function parseHeadingLeaves(payload: unknown, prefix: string): LeafCommodity[] {
  return (asDoc(payload).included ?? [])
    .filter((r) => r.type === "commodity" && r.attributes?.leaf === true)
    .flatMap((r) => {
      const code = str(r.attributes?.goods_nomenclature_item_id);
      return code && code.startsWith(prefix) ? [{ code, description: str(r.attributes?.description_plain) ?? str(r.attributes?.description) ?? "" }] : [];
    });
}

// ---------- Commodity → measures applicable to an origin ----------

export interface ApplicableMeasures {
  /** Third-country (MFN) ad valorem duty applicable to the origin, %. */
  readonly thirdCountryPct: number | null;
  /** Lowest tariff preference available to the origin (requires proof of origin), %. */
  readonly preferencePct: number | null;
  /** Flat duty per item on low-value consignments, in the tariff currency (EUR on the XI tariff). */
  readonly lowValueFlat: number | null;
  /** Origin-specific measures not computed (anti-dumping, specific duties…), as "type : expression". */
  readonly other: readonly string[];
}

const ERGA_OMNES = "1011";
const percent = (expression: string): number | null => {
  const m = /^\s*([\d.]+)\s*%\s*$/.exec(expression);
  return m ? Number(m[1]) : null;
};
const flatAmount = (expression: string): number | null => {
  const m = /^\s*([\d.]+)\s*(EUR|GBP)\s*$/.exec(expression);
  return m ? Number(m[1]) : null;
};

/**
 * Picks the import measures of a commodity that apply to `origin` (ISO 3166-1 alpha-2): measures for erga omnes,
 * for the origin itself, or for a country group the origin belongs to (unless explicitly excluded).
 */
export function parseApplicableMeasures(payload: unknown, origin: string): ApplicableMeasures {
  const included = asDoc(payload).included ?? [];
  const byId = (type: string) => new Map(included.filter((r) => r.type === type).map((r) => [r.id, r]));
  const types = byId("measure_type");
  const expressions = byId("duty_expression");
  const areas = byId("geographical_area");

  const applies = (measure: JsonApiResource): { applies: boolean; specific: boolean } => {
    const geo = relId(measure, "geographical_area");
    if (!geo) return { applies: false, specific: false };
    const excluded = relIds(measure, "excluded_countries").concat(relIds(measure, "excluded_geographical_areas"));
    if (excluded.includes(origin)) return { applies: false, specific: false };
    if (geo === origin) return { applies: true, specific: true };
    if (geo === ERGA_OMNES) return { applies: true, specific: false };
    const members = relIds(areas.get(geo) ?? { id: geo, type: "geographical_area" }, "children_geographical_areas");
    return { applies: members.includes(origin), specific: members.includes(origin) };
  };

  let thirdCountryPct: number | null = null;
  let preferencePct: number | null = null;
  let lowValueFlat: number | null = null;
  const other: string[] = [];
  const min = (a: number | null, b: number) => (a === null ? b : Math.min(a, b));

  for (const measure of included.filter((r) => r.type === "measure")) {
    if (measure.attributes?.import === false) continue;
    const { applies: ok, specific } = applies(measure);
    if (!ok) continue;
    const type = str(types.get(relId(measure, "measure_type") ?? "")?.attributes?.description) ?? "";
    const expression = str(expressions.get(relId(measure, "duty_expression") ?? "")?.attributes?.base) ?? "";

    if (/^third country duty$/i.test(type)) {
      const p = percent(expression);
      if (p !== null) thirdCountryPct = min(thirdCountryPct, p);
      else if (expression) other.push(`Droit de pays tiers non ad valorem : ${expression}`);
    } else if (/^tariff preference$/i.test(type)) {
      const p = percent(expression);
      if (p !== null) preferencePct = min(preferencePct, p);
    } else if (/low-value consignment/i.test(type)) {
      const f = flatAmount(expression);
      if (f !== null) lowValueFlat = f;
    } else if (specific && /anti-dumping|countervailing|safeguard|additional dut/i.test(type) && expression) {
      other.push(`${type} : ${expression}`);
    }
  }
  return { thirdCountryPct, preferencePct, lowValueFlat, other: [...new Set(other)] };
}
