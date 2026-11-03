import Link from "next/link";
import { getMessages } from "@/i18n/server";

/** Shown in place of stored analyses when the local database cannot be opened: what happened, and that nothing was erased. */
export async function DatabaseNotice() {
  const m = (await getMessages("serverMessages")).api;
  return (
    <p role="alert" className="rounded-tile border border-[var(--verdict-surveiller)] px-6 py-5 text-sm leading-relaxed text-muted-foreground">
      {m.databaseDamaged}{" "}
      <Link href="/settings#backups" className="text-foreground underline decoration-line underline-offset-4 hover:decoration-foreground">
        {m.restoreFromBackup}
      </Link>
    </p>
  );
}
