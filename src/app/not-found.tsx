import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl py-20">
      <h1 className="text-2xl font-semibold">Page introuvable</h1>
      <p className="mt-3 text-muted-foreground">Cette analyse ou ce pays n&apos;existe pas, ou l&apos;identifiant est incorrect.</p>
      <Link href="/" className="mt-6 inline-block text-sm underline underline-offset-4">
        Revenir aux analyses
      </Link>
    </div>
  );
}
