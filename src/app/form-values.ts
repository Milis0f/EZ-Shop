/** Digits with one optional decimal part, comma or dot. A sign is kept so the schema can say « négatif ». */
const PLAIN_DECIMAL = /^-?\d+(?:[.,]\d+)?$/;
/** Spaces, including the no-break and narrow no-break spaces French uses between thousands. */
const SPACES = /[\s  ]/g;

/**
 * Reads an optional number field as the owner types it (« 1 299,90 »). Anything else, such as « 29 € »,
 * « 1e3 » or « 0x10 », becomes NaN, which the schema refuses with its French message.
 * Not in `actions.ts`: every export of a "use server" module is a public endpoint.
 */
export function parseFormNumber(value: FormDataEntryValue | null): number | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.replace(SPACES, "");
  if (text === "") return undefined;
  return PLAIN_DECIMAL.test(text) ? Number(text.replace(",", ".")) : Number.NaN;
}
