import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { EpistemicLegend } from "@/components/data/epistemic-legend";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { TermPrompt } from "@/components/marketing/term";
import { BackupPanel } from "@/components/settings/backup-panel";
import { AiSettings, ModeSettings, SettingsSection } from "@/components/settings/settings-panels";
import { Skeleton } from "@/components/ui/skeleton";
import { getEnv } from "@/config/env";
import { getLocale, getMessages } from "@/i18n/server";
import { modelChoices } from "@/server/ai/fit";
import { installedModels } from "@/server/ai/installer";
import { probeMachine } from "@/server/ai/machine";
import { AI_MODELS, modelInfoOf, modelOfPath } from "@/server/ai/models";
import { backupsAvailable, listLocalBackups } from "@/server/db/backup";
import { backupDir, localDataDir } from "@/server/db/client";
import { localizedEditorAccess } from "../connectors/editor-access";

export async function generateMetadata(): Promise<Metadata> {
  const m = await getMessages("settings");
  return { title: m.metadataTitle };
}

export default async function SettingsPage() {
  const m = await getMessages("settings");
  return (
    <div className="mx-auto max-w-4xl pt-[3vh]">
      <header className="animate-enter mb-10 max-w-2xl">
        <TermPrompt command="ez-shop config" className="mb-5" />
        <h1 className="page-title">{m.title}</h1>
        <p className="mt-4 leading-relaxed text-muted-foreground">{m.intro}</p>
      </header>
      <div className="flex flex-col gap-4">
        <Suspense fallback={<Skeleton className="h-64 w-full rounded-tile" />}>
          <AiSection />
        </Suspense>
        <Suspense fallback={<Skeleton className="h-48 w-full rounded-tile" />}>
          <BackupSection />
        </Suspense>
        <SettingsSection bar="réglages — langue" title={m.language.title} intro={m.language.intro}>
          <LanguageSwitcher />
        </SettingsSection>
        <ModeSettings />
        <SettingsSection bar="réglages — valeurs" title={m.legend.title} intro={m.legend.intro}>
          <EpistemicLegend />
        </SettingsSection>
        <nav className="flex flex-wrap gap-x-6 gap-y-2 px-1 pt-2 text-sm">
          <Link href="/connectors" className="underline decoration-line underline-offset-4 hover:decoration-foreground">
            {m.links.sources}
          </Link>
          <Link href="/methodology" className="underline decoration-line underline-offset-4 hover:decoration-foreground">
            {m.links.method}
          </Link>
        </nav>
      </div>
    </div>
  );
}

/** The backups on disk: readable even when the database itself no longer opens, to restore one. */
async function BackupSection() {
  await connection();
  const available = backupsAvailable();
  const backups = available ? await listLocalBackups() : [];
  return <BackupPanel data={{ available, backups, folder: backupDir(), dataDir: localDataDir(), keep: getEnv().BACKUP_KEEP }} />;
}

/** Reads this computer (memory, graphics card, models on disk): each model's needs are stated against it. */
async function AiSection() {
  await connection();
  const env = getEnv();
  const [access, machine, onDisk] = await Promise.all([getLocale().then(localizedEditorAccess), probeMachine(env), installedModels(env)]);
  const active = modelOfPath(env.LOCAL_AI_MODEL_PATH);
  const info = modelInfoOf(env.LOCAL_AI_MODEL_PATH);
  return (
    <AiSettings
      data={{
        machine,
        choices: modelChoices(AI_MODELS, machine, onDisk, active?.id ?? null),
        active: { name: info.name, license: info.license, custom: active === null },
        editable: access.enabled,
      }}
    />
  );
}
