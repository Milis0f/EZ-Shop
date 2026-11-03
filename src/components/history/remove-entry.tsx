"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { removeHistoryEntry } from "@/app/analyses/actions";
import { Button } from "@/components/ui/button";
import type { HistoryKind } from "@/domain/history";
import { useMessages } from "@/i18n/client";

/** Remove, then confirm: one click never erases anything. */
export function RemoveEntry({ kind, id, title, onRemoved }: { readonly kind: HistoryKind; readonly id: string; readonly title: string; readonly onRemoved?: string }) {
  const m = useMessages("history");
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function remove() {
    startTransition(async () => {
      const result = await removeHistoryEntry(kind, id);
      setConfirming(false);
      if (!result.ok) {
        setMessage(result.error === "remote" ? m.remote : m.removeFailed);
        return;
      }
      if (onRemoved) router.push(onRemoved);
      else router.refresh();
    });
  }

  return (
    <span className="flex shrink-0 items-center gap-2">
      {message && (
        <span role="status" className="text-xs text-muted-foreground">
          {message}
        </span>
      )}
      {confirming ? (
        <>
          <Button type="button" size="sm" variant="destructive" disabled={pending} onClick={remove} aria-label={`${m.confirmRemove} : ${title}`}>
            {m.confirmRemove}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setConfirming(false)}>
            {m.cancel}
          </Button>
        </>
      ) : (
        <Button type="button" size="sm" variant="ghost" onClick={() => setConfirming(true)} aria-label={`${m.remove} : ${title}`}>
          {m.remove}
        </Button>
      )}
    </span>
  );
}
