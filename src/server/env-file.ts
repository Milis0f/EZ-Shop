import "server-only";
import { randomUUID } from "node:crypto";
import { readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Reads and rewrites .env.local for the connector settings form.
 * Values are never logged; callers validate them first (see validateEnvValue).
 */

export interface EnvUpdate {
  readonly key: string;
  /** null removes the variable. */
  readonly value: string | null;
}

const HEADER = "# Local secrets for EZ-Shop. Never commit this file.\n";
function keyLine(key: string): RegExp {
  if (!/^[A-Z][A-Z0-9_]*$/.test(key)) throw new Error("Invalid environment variable name.");
  return new RegExp(`^\\s*(?:export\\s+)?${key}\\s*=`);
}

/**
 * Applies updates to the text of a dotenv file, keeping every other line (comments included).
 * An existing key is replaced in place (duplicates dropped); a new key goes under `# ---- <section> ----`,
 * created at the end of the file when missing. A section left without any variable is removed.
 */
export function applyEnvUpdates(content: string, updates: readonly EnvUpdate[], section: string): string {
  let lines = content.length > 0 ? content.replace(/\r\n/g, "\n").replace(/\n$/, "").split("\n") : [];
  const marker = `# ---- ${section} ----`;

  for (const { key, value } of updates) {
    const matcher = keyLine(key);
    const first = lines.findIndex((l) => matcher.test(l));
    lines = lines.filter((l, i) => i === first || !matcher.test(l));
    if (first !== -1) {
      lines = value === null ? lines.filter((_, i) => i !== first) : lines.map((l, i) => (i === first ? `${key}=${value}` : l));
      continue;
    }
    if (value === null) continue;

    let at = lines.indexOf(marker);
    if (at === -1) {
      if (lines.length > 0 && lines.at(-1) !== "") lines.push("");
      lines.push(marker);
      at = lines.length - 1;
    }
    // End of the section: the next blank line or the next section marker.
    let end = at + 1;
    while (end < lines.length && lines[end].trim() !== "" && !lines[end].startsWith("# ----")) end += 1;
    lines.splice(end, 0, `${key}=${value}`);
  }

  // A section marker with nothing under it (its last variable was removed) goes too.
  const isMarker = (l: string | undefined) => l !== undefined && /^# ---- .+ ----$/.test(l);
  const isEmptySection = (i: number) => lines[i + 1] === undefined || lines[i + 1].trim() === "" || isMarker(lines[i + 1]);
  lines = lines.filter((l, i) => !isMarker(l) || !isEmptySection(i));

  const body = lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return body.length === 0 ? "" : `${body}\n`;
}

export const envLocalPath = (): string => path.join(process.cwd(), ".env.local");

async function readIfExists(file: string): Promise<string> {
  try {
    return await readFile(file, "utf8");
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "";
    throw error;
  }
}

/**
 * Rewrites .env.local through a temporary file then a rename, so a crash never leaves it half written.
 * Windows can refuse the rename while the dev server's watcher holds the file: a direct write is the fallback.
 */
export async function updateEnvLocal(updates: readonly EnvUpdate[], section: string): Promise<void> {
  const file = envLocalPath();
  const current = await readIfExists(file);
  const next = applyEnvUpdates(current.length > 0 ? current : HEADER, updates, section);
  const tmp = `${file}.${randomUUID()}.tmp`;
  await writeFile(tmp, next, { encoding: "utf8", mode: 0o600 });
  try {
    await rename(tmp, file);
  } catch {
    await writeFile(file, next, { encoding: "utf8", mode: 0o600 });
    await rm(tmp, { force: true });
  }
}
