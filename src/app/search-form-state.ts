export interface SearchFormState {
  readonly error?: string;
  /** Keyed by form field name; every price shares the `economics` slot. */
  readonly fieldErrors?: Readonly<Record<string, string>>;
}

export const INITIAL_SEARCH_STATE: SearchFormState = {};

/** A validation issue as the pipeline reports it: dotted path and French message. */
export interface InputIssue {
  readonly path: string;
  readonly message: string;
}

/** First path segments the search forms can show a message next to. */
const FIELDS_WITH_MESSAGE: ReadonlySet<string> = new Set([
  "productName",
  "supplierUrl",
  "category",
  "countries",
  "extraTerms",
  "originCountry",
  "hsCode",
  "economics",
]);

/**
 * Turns validation issues into the form state. An issue no field can show (a refused data mode, the whole
 * input) becomes the form error, so a refusal is never silent.
 */
export function searchFormStateFrom(issues: readonly InputIssue[]): SearchFormState {
  const located = issues.map((issue) => ({ field: issue.path.split(".")[0], message: issue.message }));
  const onFields = located.filter((issue) => FIELDS_WITH_MESSAGE.has(issue.field));
  const error = located.find((issue) => !FIELDS_WITH_MESSAGE.has(issue.field))?.message;
  return {
    ...(error !== undefined && { error }),
    ...(onFields.length > 0 && { fieldErrors: Object.fromEntries(onFields.map((issue) => [issue.field, issue.message])) }),
  };
}
