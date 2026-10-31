import Link from "next/link";
import { Button } from "@/components/ui/button";
import { StatusScreen } from "@/components/ui/feedback";

export default function NotFound() {
  return (
    <div className="flex min-h-[70dvh] items-center justify-center">
      <StatusScreen kind="not-found" title="Page introuvable" description="Cette page n'existe pas, ou vous n'y avez pas accès." action={<Button asChild><Link href="/">Retour à l&apos;accueil</Link></Button>} />
    </div>
  );
}
