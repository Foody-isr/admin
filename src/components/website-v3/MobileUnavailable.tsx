"use client";

import Link from "next/link";
import { MonitorUp } from "lucide-react";

export function MobileUnavailable({ restaurantId }: { restaurantId: number }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f4f6f8] px-6 lg:hidden">
      <section className="w-full max-w-md rounded-[28px] border border-slate-200 bg-white p-8 text-center shadow-[0_24px_70px_rgba(15,23,42,0.12)]">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#e8efff] text-[#315fce]">
          <MonitorUp className="h-7 w-7" aria-hidden="true" />
        </span>
        <p className="mt-6 text-xs font-bold uppercase tracking-[0.2em] text-[#315fce]">
          Website Builder V3
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
          Ouvrez le builder sur un écran plus large
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          La création du site est disponible sur ordinateur et tablette en mode
          paysage. L’administration Foody reste accessible sur mobile.
        </p>
        <Link
          href={`/${restaurantId}/dashboard`}
          className="mt-7 inline-flex min-h-11 items-center justify-center rounded-xl bg-slate-950 px-5 text-sm font-semibold text-white transition hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-[#315fce] focus:ring-offset-2"
        >
          Retour à l’administration
        </Link>
      </section>
    </main>
  );
}
