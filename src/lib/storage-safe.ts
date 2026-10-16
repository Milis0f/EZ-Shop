/**
 * Text that Postgres (and PGlite) can store in `text` and `jsonb` columns.
 *
 * Both reject U+0000, and `jsonb` also rejects lone surrogates. A provider body may carry either
 * (`"\u0000"`, `"\ud800"`), so provider JSON goes through `parseJsonForStorage` before it is cached
 * or persisted. Nothing here ever echoes a key, a value or an error message.
 */

/** Two keys of one JSON object became equal once made storable: they would overwrite each other. */
export class UnsafeJsonKeysError extends Error {
  constructor() {
    // No key and no value: the object comes from an external service.
    super("JSON object keys collide once made storable");
    this.name = "UnsafeJsonKeysError";
  }
}

/** Removes U+0000 and replaces lone surrogates with U+FFFD. */
export function toStorageSafeText(value: string): string {
  return value.replaceAll("\u0000", "").toWellFormed();
}

/**
 * `JSON.parse` with every string value and object key made storable.
 *
 * Throws `UnsafeJsonKeysError` when two keys of one object become equal after sanitising
 * (`"a\u0000"` and `"a"`): merging them would silently drop a value. An object is rebuilt only when
 * one of its keys changes, with `Object.fromEntries` so that a `"__proto__"` key stays an own data
 * property and no prototype is touched. Arrays only have their elements sanitised.
 */
export function parseJsonForStorage(text: string): unknown {
  return JSON.parse(text, (_key: string, value: unknown): unknown => {
    if (typeof value === "string") return toStorageSafeText(value);
    if (value === null || typeof value !== "object" || Array.isArray(value)) return value;
    return withStorageSafeKeys(value);
  });
}

/** The reviver visits children first, so the values of `object` are already sanitised. */
function withStorageSafeKeys(object: object): object {
  const entries = Object.entries(object);
  const safeEntries = entries.map(([key, value]): [string, unknown] => [toStorageSafeText(key), value]);
  const changed = safeEntries.some(([safeKey], index) => safeKey !== entries[index][0]);
  if (!changed) return object;
  if (new Set(safeEntries.map(([safeKey]) => safeKey)).size !== safeEntries.length) throw new UnsafeJsonKeysError();
  return Object.fromEntries(safeEntries);
}

const ERROR_NAME = /^[A-Za-z]{1,40}$/;
const SQLSTATE = /^[0-9A-Z]{5}$/;

function readCode(value: unknown): unknown {
  return typeof value === "object" && value !== null ? (value as { code?: unknown }).code : undefined;
}

/**
 * A log-safe description of a storage failure: the error's name and, when it carries one, its
 * SQLSTATE (`"error (code 22P05)"`). Never the message: Drizzle's `DrizzleQueryError` embeds the SQL
 * and its parameters (the cached payload) in it, and puts the driver's SQLSTATE on `cause.code`,
 * which is why the code is read from the error itself, else from its direct cause only.
 */
export function describeStorageError(error: unknown): string {
  if (!(error instanceof Error)) return "unknown error";
  const name = ERROR_NAME.test(error.name) ? error.name : "error";
  const code = readCode(error) ?? readCode(error.cause);
  return typeof code === "string" && SQLSTATE.test(code) ? `${name} (code ${code})` : name;
}
