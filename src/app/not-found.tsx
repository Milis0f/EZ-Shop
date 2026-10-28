import Link from "next/link";
import { getMessages } from "@/i18n/server";

export default async function NotFound() {
  const m = await getMessages("shell");
  return (
    <div className="mx-auto max-w-xl py-20">
      <h1 className="text-2xl font-semibold">{m.notFound.title}</h1>
      <p className="mt-3 text-muted-foreground">{m.notFound.body}</p>
      <Link href="/" className="mt-6 inline-block text-sm underline underline-offset-4">
        {m.notFound.back}
      </Link>
    </div>
  );
}
