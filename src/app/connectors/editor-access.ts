import "server-only";

import type { EnvEditorAccess } from "@/config/connector-fields";
import type { Locale } from "@/i18n/config";
import { getMessages } from "@/i18n/server";
import { getEnvEditorAccess } from "@/server/connector-config";

/**
 * getEnvEditorAccess() with its reason in `locale`. The server helper only says why in French; the one
 * case it refuses is a request not addressed to this computer.
 */
export async function localizedEditorAccess(locale: Locale): Promise<EnvEditorAccess> {
  const access = await getEnvEditorAccess();
  if (access.enabled) return access;
  const m = (await getMessages("connectors", locale)).editor;
  return { enabled: false, reason: m.remote };
}
