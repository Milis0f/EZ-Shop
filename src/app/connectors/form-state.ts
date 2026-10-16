import type { ConnectionCheckStep } from "@/providers/contracts";

export interface ConnectorFormState {
  readonly status: "idle" | "saved" | "error";
  readonly message?: string;
  readonly fieldErrors?: Readonly<Record<string, string>>;
  /** Every required variable of the connector is now set. */
  readonly complete?: boolean;
  /** Changes on every successful save, so the form can reset itself. */
  readonly savedAt?: number;
}

export const INITIAL_CONNECTOR_FORM_STATE: ConnectorFormState = { status: "idle" };

export type ConnectorTestResult =
  | { readonly ok: true; readonly steps: readonly ConnectionCheckStep[]; readonly testedAt: string }
  | { readonly ok: false; readonly message: string };
