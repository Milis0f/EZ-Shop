"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { moveSecrets } from "@/app/settings/secret-actions";
import { Button } from "@/components/ui/button";
import { useFormat, useMessages } from "@/i18n/client";
import { t } from "@/i18n/translate";
import type { SecretsStatus } from "@/server/secrets/settings-store";
import { SettingsSection } from "./settings-panels";

/** Where the secrets live, and a button to move those still in plain text into the system store. */
export function SecretsPanel({ status }: { readonly status: SecretsStatus }) {
  const m = useMessages("secrets");
  const f = useFormat();
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function move() {
    startTransition(async () => {
      const result = await moveSecrets();
      if (!result.ok) setMessage(result.error === "remote" ? m.remote : m.failed);
      else setMessage([result.moved > 0 ? t(m.moved, { count: f.int(result.moved) }) : m.nothing, result.kept > 0 ? t(m.kept, { count: f.int(result.kept) }) : ""].filter(Boolean).join(" "));
      router.refresh();
    });
  }

  return (
    <SettingsSection id="secrets" bar="réglages — clés" title={m.title} intro={m.intro}>
      <p className="text-sm">{status.available ? t(m.available, { store: m.stores[status.kind] }) : m.unavailable}</p>
      {status.available && <p className="mt-1 text-sm text-muted-foreground">{t(m.counts, { vault: f.int(status.inVault), file: f.int(status.inFile) })}</p>}
      {status.available && status.inFile > 0 && (
        <Button type="button" className="mt-4" disabled={pending} onClick={move}>
          {pending ? m.moving : m.move}
        </Button>
      )}
      <p role="status" aria-live="polite" className="mt-3 min-h-5 text-sm text-muted-foreground">
        {message}
      </p>
    </SettingsSection>
  );
}
