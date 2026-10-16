export interface SearchFormState {
  readonly error?: string;
  readonly fieldErrors?: Readonly<Record<string, string>>;
}

export const INITIAL_SEARCH_STATE: SearchFormState = {};
