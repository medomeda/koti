"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState, useTransition } from "react";
import { toast } from "sonner";
import type { ActionResult } from "@/actions/_shared";

/**
 * Exécute une Server Action avec état de chargement, toast de succès/erreur
 * et rafraîchissement des Server Components.
 */
export function useAction<A, T>(action: (input: A) => Promise<ActionResult<T>>, opts: { success?: string | ((data: T) => string); onSuccess?: (data: T) => void; refresh?: boolean } = {}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const run = useCallback(
    async (input: A): Promise<ActionResult<T>> => {
      setError(null);
      setFieldErrors({});
      let result: ActionResult<T>;
      try {
        result = await action(input);
      } catch (err) {
        // Les redirections Next.js (connexion, etc.) remontent sous forme d'exception : on les laisse passer.
        if (err && typeof err === "object" && "digest" in err && String((err as { digest: unknown }).digest).startsWith("NEXT_REDIRECT")) throw err;
        result = { ok: false, error: "Connexion au serveur impossible. Vérifiez votre réseau et réessayez." };
      }
      if (result.ok) {
        const msg = typeof opts.success === "function" ? opts.success(result.data) : (opts.success ?? result.message);
        if (msg) toast.success(msg);
        opts.onSuccess?.(result.data);
        if (opts.refresh !== false) startTransition(() => router.refresh());
      } else {
        setError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
        toast.error(result.error);
      }
      return result;
    },
    [action, opts, router],
  );

  return { run, pending, error, fieldErrors, setError };
}
