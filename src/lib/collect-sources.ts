import type { SourceRef } from "@/domain/provenance";

/** Walk any analysis object and collect every distinct SourceRef of Known values (for the provenance table). */
export function collectSources(root: unknown): SourceRef[] {
  const found = new Map<string, SourceRef>();
  const visit = (node: unknown, depth: number) => {
    if (depth > 12 || node === null || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (const item of node) visit(item, depth + 1);
      return;
    }
    const record = node as Record<string, unknown>;
    if (record.status === "known" && Array.isArray(record.sources)) {
      for (const s of record.sources as SourceRef[]) {
        const key = `${s.sourceId}|${s.origin}|${s.queryRef ?? ""}|${s.period?.end ?? ""}`;
        if (!found.has(key)) found.set(key, s);
      }
    }
    for (const value of Object.values(record)) visit(value, depth + 1);
  };
  visit(root, 0);
  return [...found.values()].toSorted((a, b) => a.sourceId.localeCompare(b.sourceId));
}
