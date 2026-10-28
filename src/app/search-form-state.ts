export interface SearchFormState {
  readonly error?: string;
  /** Keyed by form field name; every price shares the `economics` slot. */
  readonly fieldErrors?: Readonly<Record<string, string>>;
}

export const INITIAL_SEARCH_STATE: SearchFormState = {};

/** A validation issue ready to show: dotted path and message in the active locale. */
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

/** Distinct messages in their first order, as one text: each message is a sentence that names its field. */
function joinMessages(messages: readonly string[]): string {
  return [...new Set(messages)].join(" ");
}

/**
 * Turns validation issues into the form state. An issue no field can show (a refused data mode, the whole
 * input) becomes the form error, so a refusal is never silent. Every message is kept: the prices share one
 * slot, and showing only one would hide the others until the next submit.
 */
export function searchFormStateFrom(issues: readonly InputIssue[]): SearchFormState {
  const located = issues.map((issue) => ({ field: issue.path.split(".")[0], message: issue.message }));
  const onFields = located.filter((issue) => FIELDS_WITH_MESSAGE.has(issue.field));
  const formMessages = located.filter((issue) => !FIELDS_WITH_MESSAGE.has(issue.field)).map((issue) => issue.message);
  const fields = [...new Set(onFields.map((issue) => issue.field))];
  return {
    ...(formMessages.length > 0 && { error: joinMessages(formMessages) }),
    ...(fields.length > 0 && {
      fieldErrors: Object.fromEntries(
        fields.map((field) => [field, joinMessages(onFields.filter((issue) => issue.field === field).map((issue) => issue.message))]),
      ),
    }),
  };
}
