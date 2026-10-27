import type { DataMode } from "@/domain/analysis";
import { MockBanner } from "./mock-banner";

/** The banner of stored pre-V1 mock analyses; live analyses render nothing. */
export function LegacyMockNotice({ dataMode }: { dataMode: DataMode }) {
  return dataMode === "mock" ? <MockBanner /> : null;
}
