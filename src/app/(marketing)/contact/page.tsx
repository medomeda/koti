import type { Metadata } from "next";
import { ContactForm } from "@/components/marketing/contact-form";
import { SiteHeader } from "@/components/marketing/site-header";

export const metadata: Metadata = { title: "Contact" };

export default function ContactPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 md:py-16 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
        <div>
          <h1 className="font-display text-4xl font-bold tracking-tight sm:text-5xl">Parlons de votre tontine</h1>
          <p className="mt-4 max-w-md text-lg leading-relaxed text-muted-foreground">Une question avant de commencer, une démonstration pour votre groupe ou un souci avec votre compte : écrivez-nous, nous répondons par e-mail.</p>
          <p className="mt-6 text-sm text-muted-foreground">Vos coordonnées ne servent qu&apos;à vous répondre.</p>
        </div>
        <div className="rounded-2xl border bg-card p-5 sm:p-7">
          <ContactForm />
        </div>
      </main>
    </>
  );
}
