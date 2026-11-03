import Link from "next/link";
import { getMessages } from "@/i18n/server";

export default async function NotFound() {
  const m = await getMessages("shell");
  return (
    <div className="mx-auto max-w-xl py-20">
      <h1 className="page-title">{m.notFound.title}</h1>
      <p className="mt-3 text-muted-foreground">{m.notFound.body}</p>
      <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm">
        <Link href="/" className="underline decoration-line underline-offset-4 hover:decoration-foreground">
          {m.notFound.back}
        </Link>
        <Link href="/analyses" className="underline decoration-line underline-offset-4 hover:decoration-foreground">
          {m.notFound.recent}
        </Link>
      </div>
    </div>
  );
}
