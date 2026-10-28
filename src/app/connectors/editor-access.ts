import "server-only";

import type { EnvEditorAccess } from "@/config/connector-fields";
import { getEnv } from "@/config/env";
import type { Locale } from "@/i18n/config";
import { getMessages } from "@/i18n/server";
import { getEnvEditorAccess } from "@/server/connector-config";

/**
 * getEnvEditorAccess() with its reason in `locale`. The server helper only says why in French;
 * the two cases it refuses are told apart the same way it does (production first, then a remote host).
 */
export async function localizedEditorAccess(locale: Locale): Promise<EnvEditorAccess> {
  const access = await getEnvEditorAccess();
  if (access.enabled) return access;
  const m = (await getMessages("connectors", locale)).editor;
  return { enabled: false, reason: getEnv().NODE_ENV === "production" ? m.production : m.remote };
}
