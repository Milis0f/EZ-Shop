import { apiError, apiErrorFrom, apiMessages, apiOk } from "@/server/api-response";
import { cancelInstall, installStatus, startInstall } from "@/server/ai/installer";
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

/** POST /api/ai/install — starts the download of the free model. */
export function POST(request: Request) {
  return guarded(request, () => startInstall());
}

/** DELETE /api/ai/install — stops it; the next start resumes where it stopped. */
export function DELETE(request: Request) {
  return guarded(request, () => cancelInstall());
}
