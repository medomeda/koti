import { CalendarCheck2, ShieldCheck, Users } from "lucide-react";
import type { ReactNode } from "react";
import { Brand } from "@/components/layout/brand";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_minmax(0,560px)]">
      <aside className="relative hidden overflow-hidden bg-sidebar p-10 text-white lg:flex lg:flex-col">
        <Brand dark />
        <div className="my-auto max-w-md">
          <h2 className="text-3xl font-semibold leading-tight tracking-tight">Vos tontines, enfin claires et sereines.</h2>
          <p className="mt-3 text-sidebar-foreground">Cotisations, validations, tours de main : tout le monde voit où en est la tontine, sans tableaux Excel ni messages perdus.</p>
          <ul className="mt-8 space-y-4 text-sm text-sidebar-foreground">
            <li className="flex gap-3">
              <Users className="size-5 shrink-0 text-green-300" aria-hidden /> Plusieurs tontines depuis un seul compte
            </li>
            <li className="flex gap-3">
              <CalendarCheck2 className="size-5 shrink-0 text-green-300" aria-hidden /> Échéances générées et rappels automatiques
            </li>
            <li className="flex gap-3">
              <ShieldCheck className="size-5 shrink-0 text-green-300" aria-hidden /> KOTI ne détient ni ne transfère aucun fonds
            </li>
          </ul>
        </div>
        <div aria-hidden className="pointer-events-none absolute -bottom-24 -right-24 size-96 rounded-full border-[40px] border-white/5" />
      </aside>
      <main className="flex flex-col px-4 py-8 sm:px-10">
        <div className="lg:hidden">
          <Brand />
        </div>
        <div className="mx-auto my-auto w-full max-w-sm py-8">{children}</div>
      </main>
    </div>
  );
}
