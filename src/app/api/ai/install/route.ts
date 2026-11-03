import { apiError, apiErrorFrom, apiMessages, apiOk } from "@/server/api-response";
import { cancelInstall, installStatus, startInstall } from "@/server/ai/installer";
import { isAiModelId } from "@/server/ai/models";
import { getEnv } from "@/config/env";
import { checkJsonPost } from "@/server/request-guard";
import { GUARD_MESSAGE_KEY, requestLocale } from "@/server/request-locale";

/** GET /api/ai/install — is the local model there, and how far is its download. */
export async function GET(request: Request) {
  try {
    return apiOk(await installStatus());
  } catch (error: unknown) {
    return apiErrorFrom(error, requestLocale(request));
  }
}

async function guarded(request: Request, action: () => ReturnType<typeof installStatus>) {
  const locale = requestLocale(request);
  const guard = checkJsonPost(request.headers);
  if (!guard.ok) return apiError(guard.status, guard.code, apiMessages(locale)[GUARD_MESSAGE_KEY[guard.code]]);
  try {
    return apiOk(await action());
  } catch (error: unknown) {
    return apiErrorFrom(error, locale);
  }
}

/** The model asked for in the body, when it is one of the catalogue; anything else means the configured one. */
async function askedModel(request: Request) {
  try {
    const body = (await request.clone().json()) as { model?: unknown };
    return isAiModelId(body.model) ? body.model : undefined;
  } catch {
    return undefined;
  }
}

/** POST /api/ai/install — starts the download of a free model: `{ "model": id }`, or the configured one. */
export async function POST(request: Request) {
  const model = await askedModel(request);
  return guarded(request, () => (model ? startInstall(getEnv(), {}, model) : startInstall()));
}

/** DELETE /api/ai/install — stops it; the next start resumes where it stopped. */
export function DELETE(request: Request) {
  return guarded(request, () => cancelInstall());
}
