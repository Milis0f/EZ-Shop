export type StoreConnectionState =
  | { readonly status: "idle" }
  | { readonly status: "saved"; readonly message: string; readonly savedAt: number }
  | { readonly status: "error"; readonly message: string; readonly fieldErrors?: Readonly<Record<string, string>> };

export const INITIAL_STORE_CONNECTION_STATE: StoreConnectionState = { status: "idle" };
