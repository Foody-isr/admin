"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  getRestaurant,
  updateChainBranch,
  updateRestaurant,
  uploadRestaurantBackground,
  uploadRestaurantLogo,
  type ChainOverview,
  type Restaurant,
} from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import {
  ArrowUpRight,
  Building2,
  Check,
  ImagePlus,
  Landmark,
  Save,
  Store,
} from "lucide-react";

const WEB_ORIGIN = process.env.NEXT_PUBLIC_WEB_URL || "https://dev-app.foody-pos.co.il";

type FormState = {
  publicName: string;
  slug: string;
  address: string;
  phone: string;
  description: string;
  visible: boolean;
};

/** Local branch editor: operational public identity plus inherited brand site. */
export function BranchWebsitePresence({
  restaurantId,
  overview,
}: {
  restaurantId: number;
  overview: ChainOverview;
}) {
  const { t } = useI18n();
  const branch = useMemo(
    () => overview.branches.find((candidate) => candidate.id === restaurantId),
    [overview.branches, restaurantId],
  );
  const primary = overview.branches.find(
    (candidate) => candidate.id === overview.primary_restaurant_id,
  );
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<"logo" | "cover" | null>(null);
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    let active = true;
    getRestaurant(restaurantId)
      .then((value) => {
        if (!active) return;
        setRestaurant(value);
        setForm({
          publicName: branch?.public_name || branch?.name || value.name,
          slug: branch?.slug || value.slug,
          address: branch?.address || value.address || "",
          phone: branch?.phone || value.phone || "",
          description: branch?.short_description || value.description || "",
          visible: branch?.listing_status === "live",
        });
      })
      .catch((error: unknown) => setMessage({ kind: "error", text: readError(error) }));
    return () => { active = false; };
  }, [branch, restaurantId]);

  if (!branch || !primary) {
    return <div className="p-8 text-sm text-fg-secondary">{t("chain_no_branches")}</div>;
  }
  if (!form || !restaurant) {
    return <div className="grid min-h-[60vh] place-items-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-500 border-t-transparent" /></div>;
  }
  const currentBranch = branch;
  const currentForm = form;

  async function save() {
    setSaving(true);
    setMessage(null);
    try {
      await updateChainBranch(restaurantId, restaurantId, {
        public_name: currentForm.publicName.trim(),
        slug: currentForm.slug.trim(),
        address: currentForm.address.trim(),
        phone: currentForm.phone.trim(),
        short_description: currentForm.description.trim(),
        listing_status:
          currentForm.visible !== (currentBranch.listing_status === "live")
            ? currentForm.visible ? "live" : "hidden"
            : undefined,
      });
      setMessage({ kind: "success", text: t("branch_presence_saved") });
    } catch (error: unknown) {
      setMessage({ kind: "error", text: readError(error) });
    } finally {
      setSaving(false);
    }
  }

  async function upload(kind: "logo" | "cover", file?: File) {
    if (!file) return;
    setUploading(kind);
    setMessage(null);
    try {
      const url = kind === "logo"
        ? await uploadRestaurantLogo(restaurantId, file)
        : await uploadRestaurantBackground(restaurantId, file);
      const updated = await updateRestaurant(
        restaurantId,
        kind === "logo" ? { logo_url: url } : { cover_url: url },
      );
      setRestaurant(updated);
      setMessage({ kind: "success", text: t("branch_presence_media_saved") });
    } catch (error: unknown) {
      setMessage({ kind: "error", text: readError(error) });
    } finally {
      setUploading(null);
    }
  }

  return (
    <main className="min-h-screen bg-[var(--surface-2)] px-4 py-6 md:px-8 md:py-10">
      <div className="mx-auto max-w-6xl space-y-6">
        <section className="overflow-hidden rounded-[28px] border border-[var(--line)] bg-[var(--surface)] shadow-sm">
          <div className="grid gap-6 px-6 py-7 md:grid-cols-[1fr_auto] md:items-center md:px-9">
            <div>
              <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[.16em] text-brand-500">
                <Store className="h-4 w-4" /> {t("branch_presence_eyebrow")}
              </div>
              <h1 className="text-3xl font-semibold tracking-[-.035em] text-fg-primary md:text-4xl">
                {branch.public_name || branch.name}
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-fg-secondary">
                {t("branch_presence_intro")}
              </p>
            </div>
            <div className="flex flex-wrap gap-2 md:justify-end">
              <a className="btn-secondary" href={`${WEB_ORIGIN}/r/${branch.slug}`} target="_blank" rel="noreferrer">
                {t("branch_presence_preview")} <ArrowUpRight className="h-4 w-4" />
              </a>
              <a className="btn-primary" href={`${WEB_ORIGIN}/r/${branch.slug}/order`} target="_blank" rel="noreferrer">
                {t("chain_open_site")} <ArrowUpRight className="h-4 w-4" />
              </a>
            </div>
          </div>

          <div className="border-t border-[var(--line)] bg-[color-mix(in_oklab,var(--brand-500)_6%,var(--surface))] px-6 py-5 md:px-9">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="flex items-start gap-3">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-500 text-white"><Landmark className="h-5 w-5" /></div>
                <div>
                  <p className="font-semibold text-fg-primary">{t("branch_presence_inherits_title")}</p>
                  <p className="mt-1 text-sm text-fg-secondary">{overview.chain_name} · {primary.public_name || primary.name}</p>
                </div>
              </div>
              <Link className="inline-flex items-center gap-2 text-sm font-semibold text-brand-500 hover:underline" href={`/${primary.id}/website-v3`}>
                {t("branch_presence_open_global")} <ArrowUpRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </section>

        {message && (
          <div role="status" className={`rounded-2xl border px-4 py-3 text-sm ${message.kind === "success" ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-700" : "border-red-500/25 bg-red-500/10 text-red-600"}`}>
            {message.text}
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.45fr)_minmax(300px,.75fr)]">
          <section className="rounded-[24px] border border-[var(--line)] bg-[var(--surface)] p-6 md:p-8">
            <div className="mb-6 flex items-center gap-3"><Building2 className="h-5 w-5 text-brand-500" /><h2 className="text-xl font-semibold text-fg-primary">{t("branch_presence_identity")}</h2></div>
            <div className="grid gap-5 md:grid-cols-2">
              <Field label={t("chain_public_name")} value={form.publicName} onChange={(publicName) => setForm({ ...form, publicName })} />
              <Field label={t("chain_branch_url")} value={form.slug} prefix="/r/" onChange={(slug) => setForm({ ...form, slug })} />
              <Field label={t("chain_branch_address")} value={form.address} onChange={(address) => setForm({ ...form, address })} />
              <Field label={t("chain_branch_phone")} value={form.phone} onChange={(phone) => setForm({ ...form, phone })} />
              <label className="md:col-span-2">
                <span className="mb-1.5 block text-sm font-medium text-fg-secondary">{t("chain_short_description")}</span>
                <textarea className="input min-h-28 resize-y" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
              </label>
              <label className="md:col-span-2 flex cursor-pointer items-center justify-between gap-4 rounded-2xl border border-[var(--line)] bg-[var(--surface-2)] p-4">
                <span><span className="block font-semibold text-fg-primary">{t("branch_presence_visible")}</span><span className="mt-1 block text-xs text-fg-tertiary">{t("branch_presence_visible_hint")}</span></span>
                <input type="checkbox" className="h-5 w-5 accent-[var(--brand-500)]" checked={form.visible} onChange={(event) => setForm({ ...form, visible: event.target.checked })} />
              </label>
            </div>
            <div className="mt-6 flex justify-end">
              <button className="btn-primary" type="button" disabled={saving || !form.publicName.trim() || !form.slug.trim()} onClick={save}>
                {saving ? t("saving") : t("branch_presence_save")} {saving ? null : <Save className="h-4 w-4" />}
              </button>
            </div>
          </section>

          <aside className="space-y-6">
            <section className="rounded-[24px] border border-[var(--line)] bg-[var(--surface)] p-6">
              <h2 className="text-lg font-semibold text-fg-primary">{t("branch_presence_media")}</h2>
              <p className="mt-1 text-sm leading-6 text-fg-secondary">{t("branch_presence_media_hint")}</p>
              <MediaUpload label={t("branch_presence_logo")} imageUrl={restaurant.logo_url} busy={uploading === "logo"} onFile={(file) => upload("logo", file)} />
              <MediaUpload label={t("branch_presence_cover")} imageUrl={restaurant.cover_url} busy={uploading === "cover"} onFile={(file) => upload("cover", file)} />
            </section>
            <section className="rounded-[24px] border border-[var(--line)] bg-[var(--surface)] p-6">
              <h2 className="text-lg font-semibold text-fg-primary">{t("branch_presence_inherited")}</h2>
              <ul className="mt-4 space-y-3 text-sm text-fg-secondary">
                {["branch_presence_theme", "branch_presence_navigation", "branch_presence_pages", "branch_presence_footer"].map((key) => (
                  <li key={key} className="flex items-center gap-2"><span className="grid h-5 w-5 place-items-center rounded-full bg-emerald-500/15 text-emerald-600"><Check className="h-3 w-3" /></span>{t(key)}</li>
                ))}
              </ul>
            </section>
          </aside>
        </div>
      </div>
    </main>
  );
}

function Field({ label, value, prefix, onChange }: { label: string; value: string; prefix?: string; onChange: (value: string) => void }) {
  return <label><span className="mb-1.5 block text-sm font-medium text-fg-secondary">{label}</span><div className="flex"><span className={`grid place-items-center rounded-l-xl border border-r-0 border-[var(--line)] bg-[var(--surface-2)] px-3 text-sm text-fg-tertiary ${prefix ? "" : "hidden"}`}>{prefix}</span><input className={`input ${prefix ? "rounded-l-none" : ""}`} value={value} onChange={(event) => onChange(event.target.value)} /></div></label>;
}

function MediaUpload({ label, imageUrl, busy, onFile }: { label: string; imageUrl?: string; busy: boolean; onFile: (file?: File) => void }) {
  return (
    <label className="mt-4 block cursor-pointer overflow-hidden rounded-2xl border border-dashed border-[var(--line-strong)] bg-[var(--surface-2)] p-3 transition hover:border-brand-500">
      <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-fg-tertiary">{label}</span>
      <span className="flex items-center gap-3">
        {imageUrl ? (
          <span
            aria-hidden
            className="h-14 w-20 rounded-xl bg-cover bg-center"
            style={{ backgroundImage: `url(${JSON.stringify(imageUrl)})` }}
          />
        ) : (
          <span className="grid h-14 w-20 place-items-center rounded-xl bg-[var(--surface)]"><ImagePlus className="h-5 w-5 text-fg-tertiary" /></span>
        )}
        <span className="text-sm font-semibold text-fg-primary">{busy ? "…" : label}</span>
      </span>
      <input className="sr-only" type="file" accept="image/*" disabled={busy} onChange={(event) => onFile(event.target.files?.[0])} />
    </label>
  );
}

function readError(error: unknown): string {
  return error instanceof Error ? error.message : "Une erreur est survenue.";
}
