'use client';

// Fiches Recettes — unified recipe library (articles ↔ preparations).
// Two layouts: Grid (default) and Split (master/detail), URL-driven via ?id=&from=.
// Wired to real data: getAllCategories + computeItemCostSummary (article cost,
// composition, prep links), getRecipeSteps (method), listPrepItems (+ derived
// where-used) for preparations.

import { useEffect, useState, useCallback, useMemo, useRef, useLayoutEffect, createContext, useContext } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import {
  SearchIcon, ChevronRightIcon, ChevronLeftIcon, ChevronDownIcon, PlusIcon, RefreshCwIcon,
  EyeIcon, PencilIcon, LockIcon, ChefHatIcon, BoxIcon, LayersIcon, InfoIcon,
  TriangleAlertIcon, LayoutGridIcon, ListIcon, SparklesIcon, ImageIcon, XIcon,
} from 'lucide-react';
import {
  getAllCategories, listPrepItems, getRestaurantSettings, getMenuItemIngredients,
  getItemOptionPrices, getRecipeSteps, setRecipeSteps, getPrepIngredients,
  getRecipeCategories, createRecipeCategory, updateRecipeCategory, deleteRecipeCategory, updateMenuItem, updatePrepItem,
  type ItemOptionOverride, type RecipeStepInput, type RecipeCategory,
} from '@/lib/api';
import CategoryDrawer from '@/components/menu/CategoryDrawer';
import MenuItemTabCost from '@/components/menu-item/MenuItemTabCost';
import { computeItemCostSummary, computePrepUnitCostExVat } from '@/lib/cost-utils';
import { usePermissions } from '@/lib/permissions-context';
import { useI18n } from '@/lib/i18n';
import { Button, Kpi, PageHead, Badge, FullScreenEditor } from '@/components/ds';
import {
  FicheArticle, FichePrep, CompRow, UsedByEntry,
  ApiMenuItem, mapArticleBase, mapPrepBase, enrichArticle, methodFromSteps,
  money, catColor, fmtQty,
} from './model';
import './fiches.css';

// ─── keys & routing ──────────────────────────────────────────────────────────
type FKey = string; // 'a123' (article) | 'p45' (prep)
const keyOf = (kind: 'article' | 'prep', id: number): FKey => `${kind === 'article' ? 'a' : 'p'}${id}`;
function parseKey(k: string | null | undefined): { kind: 'article' | 'prep'; id: number } | null {
  if (!k) return null;
  const m = /^([ap])(\d+)$/.exec(k);
  if (!m) return null;
  return { kind: m[1] === 'a' ? 'article' : 'prep', id: Number(m[2]) };
}

// ─── prefers-reduced-motion ──────────────────────────────────────────────────
function useReducedMotion() {
  const [r, setR] = useState(false);
  useEffect(() => {
    let mq: MediaQueryList;
    try { mq = window.matchMedia('(prefers-reduced-motion: reduce)'); } catch { return; }
    const on = () => setR(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return r;
}

// recipe-category color: the category's real stored color when it's in the
// managed list, else a stable fallback hue derived from the name. Supplied via
// context so any card/row/detail can tint by category without prop-drilling.
const fallbackTint = (n: string) => (n ? `var(--cat-${catColor(n)})` : 'var(--fg-subtle)');
const TintCtx = createContext<(name: string) => string>(fallbackTint);
const useTint = () => useContext(TintCtx);

// Effective category for display/color/filter: the recipe category if assigned,
// otherwise the fiche's existing menu/prep category — so cards are colorful out
// of the box (prototype look) and a recipe category overrides once set.
const effCat = (f: { recipeCategory?: string; category?: string }) => f.recipeCategory || f.category || '';

// ─── inline recipe-category picker (chef assigns / creates on a fiche) ─────────
const catDot = (color: string): React.CSSProperties => ({ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0, display: 'inline-block' });
const catChipStyle: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, height: 26, padding: '0 10px', borderRadius: 999, border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--fg)', fontSize: 12, fontWeight: 500 };
const catMenuItem = (active: boolean): React.CSSProperties => ({ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', padding: '8px 10px', border: 'none', borderRadius: 'var(--r-sm)', background: active ? 'var(--surface-2)' : 'transparent', color: 'var(--fg)', fontSize: 13, cursor: 'pointer' });

function InlineCategoryPicker({ value, catNames, canEdit, editor, onAssign, onCreate }: {
  value: string; catNames: string[]; canEdit: boolean; editor: string;
  onAssign: (name: string) => void; onCreate: (name: string) => Promise<string | null>;
}) {
  const tint = useTint();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setCreating(false); } };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  const label = value || 'Sans catégorie';
  if (!canEdit) {
    return (
      <span className="rlf-tip rlf-lock" data-tip={`Demander à ${editor} pour modifier`} style={catChipStyle}>
        <span style={catDot(tint(value))} /> {label}
      </span>
    );
  }
  const pick = (name: string) => { setOpen(false); setCreating(false); setDraft(''); onAssign(name); };
  const doCreate = async () => { const n = await onCreate(draft); if (n) pick(n); else { setCreating(false); setDraft(''); } };
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button onClick={() => setOpen((o) => !o)} title="Catégorie recette" style={{ ...catChipStyle, cursor: 'pointer' }}>
        <span style={catDot(tint(value))} /> {label} <ChevronDownIcon size={12} />
      </button>
      {open && (
        <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: 4, zIndex: 40, minWidth: 210, maxHeight: 300, overflowY: 'auto', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--r-md)', boxShadow: 'var(--shadow-3)', padding: 4 }}>
          {catNames.map((n) => (
            <button key={n} onClick={() => pick(n)} style={catMenuItem(n === value)}><span style={catDot(tint(n))} /> {n}</button>
          ))}
          {value && <button onClick={() => pick('')} style={catMenuItem(false)}>Sans catégorie</button>}
          {creating ? (
            <div style={{ display: 'flex', gap: 4, padding: 4 }}>
              <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') doCreate(); if (e.key === 'Escape') { setCreating(false); setDraft(''); } }}
                placeholder="Nom…" style={{ flex: 1, height: 28, padding: '0 8px', borderRadius: 'var(--r-sm)', border: '1px solid var(--line-strong)', background: 'var(--surface)', color: 'var(--fg)', font: 'inherit', fontSize: 13 }} />
              <Button variant="primary" size="sm" onClick={doCreate}>OK</Button>
            </div>
          ) : (
            <button onClick={() => setCreating(true)} style={{ ...catMenuItem(false), color: 'var(--brand-500)', fontWeight: 600 }}><PlusIcon size={12} /> Créer une catégorie</button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── small UI bits ────────────────────────────────────────────────────────────
function TypePill({ kind, size = 'md' }: { kind: 'article' | 'prep'; size?: 'sm' | 'md' }) {
  const isArt = kind === 'article';
  const dims = size === 'sm' ? { height: 18, padding: '0 6px', fontSize: 10 } : { height: 22, padding: '0 8px', fontSize: 11 };
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5, ...dims, borderRadius: 6, fontWeight: 600, letterSpacing: '.02em',
      background: isArt ? 'color-mix(in oklab, var(--brand-500) 14%, transparent)' : 'color-mix(in oklab, var(--cat-8) 18%, transparent)',
      color: isArt ? 'var(--brand-500)' : 'var(--cat-8)', border: '1px solid currentColor',
    }}>
      {isArt ? <ListIcon size={size === 'sm' ? 10 : 12} /> : <ChefHatIcon size={size === 'sm' ? 10 : 12} />}
      {isArt ? 'Carte' : 'Cuisine'}
    </span>
  );
}
const KpiMini = ({ label, value, tone }: { label: string; value: string; tone?: 'success' | 'muted' }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
    <span style={{ fontSize: 9, color: 'var(--fg-subtle)', textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 500 }}>{label}</span>
    <span className="num" style={{ fontSize: 13, fontWeight: 600, color: tone === 'success' ? 'var(--success-500)' : tone === 'muted' ? 'var(--fg-muted)' : 'var(--fg)' }}>{value}</span>
  </div>
);

// ─── permission helpers ───────────────────────────────────────────────────────
function LockChip({ editor }: { editor: string }) {
  return (
    <span className="rlf-tip rlf-lock" data-tip={`Demander à ${editor} pour modifier`}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 28, padding: '0 10px', borderRadius: 'var(--r-md)', fontSize: 13, fontWeight: 500, background: 'var(--surface-2)', color: 'var(--fg-muted)' }}>
      <LockIcon size={12} /> Verrouillé
    </span>
  );
}

// ─── editable text (chef inline edit) ─────────────────────────────────────────
function EditableText({ value, canEdit, editor, multiline, onSave }: {
  value: string; canEdit: boolean; editor: string; multiline?: boolean; onSave: (v: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value);
  useEffect(() => setVal(value), [value]);
  if (!canEdit) {
    return <span className="rlf-tip rlf-lock" data-tip={`Demander à ${editor} pour modifier`}>{value}</span>;
  }
  if (editing) {
    const commit = () => { setEditing(false); if (val !== value) onSave(val); };
    if (multiline) {
      return <textarea autoFocus value={val} onChange={(e) => setVal(e.target.value)} onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); commit(); } }}
        style={{ width: '100%', minHeight: 56, padding: 8, borderRadius: 'var(--r-md)', border: '1px solid var(--brand-500)', background: 'var(--surface)', color: 'var(--fg)', font: 'inherit' }} />;
    }
    return <input autoFocus value={val} onChange={(e) => setVal(e.target.value)} onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); } if (e.key === 'Escape') { setVal(value); setEditing(false); } }}
      style={{ padding: '2px 6px', borderRadius: 'var(--r-sm)', border: '1px solid var(--brand-500)', background: 'var(--surface)', color: 'var(--fg)', font: 'inherit' }} />;
  }
  return <span className="rlf-editable" title="Cliquer pour modifier" onClick={() => setEditing(true)}>{value}</span>;
}

// ─── main component ───────────────────────────────────────────────────────────
export default function RecipesFiches() {
  const { restaurantId } = useParams();
  const rid = Number(restaurantId);
  const router = useRouter();
  const params = useSearchParams();
  const { hasPermission, isOwner, roleName } = usePermissions();
  const canEdit = isOwner || hasPermission('kitchen.manage');
  const editor = 'Avi';
  const reduced = useReducedMotion();
  useI18n();

  const [articles, setArticles] = useState<FicheArticle[]>([]);
  const [preps, setPreps] = useState<FichePrep[]>([]);
  const [whereUsed, setWhereUsed] = useState<Map<number, UsedByEntry[]>>(new Map());
  const [loading, setLoading] = useState(true);
  const [vatRate, setVatRate] = useState(18);
  const [recipeCats, setRecipeCats] = useState<RecipeCategory[]>([]);
  const stepCache = useRef<Map<number, string[]>>(new Map());
  const rawItems = useRef<Map<number, ApiMenuItem>>(new Map());

  // ── initial load ──
  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [cats, prepItems, settings, recCats] = await Promise.all([
        getAllCategories(rid, { withRecipeOnly: true }),
        listPrepItems(rid),
        getRestaurantSettings(rid).catch(() => null),
        getRecipeCategories(rid).catch(() => [] as RecipeCategory[]),
      ]);
      const vr = settings?.vat_rate ?? 18;
      setVatRate(vr);
      setRecipeCats(recCats);
      const flat: ApiMenuItem[] = cats.flatMap((c) => (c.items ?? []).map((i) => ({ ...i, category_name: c.name })));
      rawItems.current = new Map(flat.map((i) => [i.id, i]));
      setArticles(flat.map(mapArticleBase));
      setPreps(prepItems.map((p) => mapPrepBase(p, computePrepUnitCostExVat(p) ?? (p.cost_per_unit || null))));
    } finally {
      setLoading(false);
    }
  }, [rid]);
  useEffect(() => { reload(); }, [reload]);

  // recipe-category color resolver (real stored color → fallback hue)
  const catColorOf = useCallback((name: string) => {
    const hit = recipeCats.find((c) => c.name === name);
    return hit && hit.color ? hit.color : fallbackTint(name);
  }, [recipeCats]);
  const catNames = useMemo(() => recipeCats.map((c) => c.name), [recipeCats]);

  // assign / create recipe category (chef inline)
  const assignCategory = useCallback(async (kind: 'article' | 'prep', id: number, name: string) => {
    if (kind === 'article') {
      setArticles((prev) => prev.map((a) => (a.id === id ? { ...a, recipeCategory: name } : a)));
      try { await updateMenuItem(rid, id, { recipe_category: name }); } catch { /* optimistic */ }
    } else {
      setPreps((prev) => prev.map((p) => (p.id === id ? { ...p, recipeCategory: name, category: name } : p)));
      try { await updatePrepItem(rid, id, { category: name }); } catch { /* optimistic */ }
    }
  }, [rid]);
  const createCategory = useCallback(async (name: string): Promise<string | null> => {
    const trimmed = name.trim();
    if (!trimmed) return null;
    if (recipeCats.some((c) => c.name === trimmed)) return trimmed;
    try {
      const c = await createRecipeCategory(rid, { name: trimmed });
      setRecipeCats((prev) => [...prev, c]);
      return c.name;
    } catch { return null; }
  }, [rid, recipeCats]);

  // ── category management (drawer: create / edit+color / delete) ──
  const refreshCats = useCallback(async () => { try { setRecipeCats(await getRecipeCategories(rid)); } catch { /* keep */ } }, [rid]);
  const catCreate = useCallback(async (input: { name: string; color?: string }) => {
    try { await createRecipeCategory(rid, { name: input.name.trim(), color: input.color }); } catch { /* surfaced on refresh */ }
    await refreshCats();
  }, [rid, refreshCats]);
  const catEdit = useCallback(async (oldName: string, patch: { name: string; color?: string }) => {
    const c = recipeCats.find((x) => x.name === oldName);
    try {
      if (c) await updateRecipeCategory(rid, c.id, { name: patch.name, color: patch.color });
      else await createRecipeCategory(rid, { name: patch.name, color: patch.color });
    } catch { /* surfaced on refresh */ }
    // Rename cascade — fiches reference the category by name, so re-point them.
    if (patch.name && patch.name !== oldName) {
      setArticles((prev) => prev.map((a) => (a.recipeCategory === oldName ? { ...a, recipeCategory: patch.name } : a)));
      setPreps((prev) => prev.map((p) => (p.recipeCategory === oldName ? { ...p, recipeCategory: patch.name, category: patch.name } : p)));
      articles.filter((a) => a.recipeCategory === oldName).forEach((a) => { updateMenuItem(rid, a.id, { recipe_category: patch.name }).catch(() => {}); });
      preps.filter((p) => p.recipeCategory === oldName).forEach((p) => { updatePrepItem(rid, p.id, { category: patch.name }).catch(() => {}); });
    }
    await refreshCats();
  }, [rid, recipeCats, articles, preps, refreshCats]);
  const catDelete = useCallback(async (name: string) => {
    const c = recipeCats.find((x) => x.name === name);
    if (c) { try { await deleteRecipeCategory(rid, c.id); } catch { /* surfaced on refresh */ } }
    await refreshCats();
  }, [rid, recipeCats, refreshCats]);

  // ── background enrichment: cost + composition + cross-links for every article ──
  const enrichRanFor = useRef<string>('');
  useEffect(() => {
    if (loading || articles.length === 0) return;
    const sig = articles.map((a) => a.id).join(',') + '|' + vatRate;
    if (enrichRanFor.current === sig) return;
    enrichRanFor.current = sig;
    let cancelled = false;
    (async () => {
      const used = new Map<number, UsedByEntry[]>();
      const enriched = await Promise.all(articles.map(async (a) => {
        try {
          const [ings, overrides] = await Promise.all([
            getMenuItemIngredients(rid, a.id),
            getItemOptionPrices(rid, a.id).catch(() => [] as ItemOptionOverride[]),
          ]);
          const raw = rawItems.current.get(a.id);
          if (!raw) return a;
          const summary = computeItemCostSummary({ item: raw, ingredients: ings, overrides, vatRate, showCostsExVat: true });
          const next = { ...enrichArticle(a, summary, a.method ?? []), costItem: raw, costIngredients: ings, costOverrides: overrides };
          // accumulate where-used (prep → articles)
          summary.lines.filter((l) => l.isPrep && l.ingredient.prep_item_id != null).forEach((l) => {
            const pid = l.ingredient.prep_item_id as number;
            const list = used.get(pid) ?? [];
            list.push({ id: a.id, name: a.name, perPortion: fmtQty(l.qty, l.qtyUnit) });
            used.set(pid, list);
          });
          return next;
        } catch {
          return a;
        }
      }));
      if (cancelled) return;
      setArticles(enriched);
      setWhereUsed(used);
      setPreps((prev) => prev.map((p) => {
        const list = used.get(p.id) ?? [];
        return { ...p, usedBy: list, usedByCount: list.length, critical: list.length >= 5 };
      }));
    })();
    return () => { cancelled = true; };
  }, [loading, articles, rid, vatRate]);

  // ── nav state from URL ──
  const openKey = params.get('id');
  const fromKey = params.get('from');
  const open = parseKey(openKey);
  const view: 'grid' | 'split' = open ? 'split' : 'grid';

  const byKey = useCallback((k: string | null | undefined): FicheArticle | FichePrep | undefined => {
    const p = parseKey(k);
    if (!p) return undefined;
    return p.kind === 'article' ? articles.find((a) => a.id === p.id) : preps.find((x) => x.id === p.id);
  }, [articles, preps]);

  const navTo = useCallback((k: FKey | null, from?: FKey | null) => {
    const qs = new URLSearchParams();
    if (k) qs.set('id', k);
    if (from) qs.set('from', from);
    const q = qs.toString();
    router.push(`/${rid}/kitchen/recipes${q ? '?' + q : ''}`);
  }, [router, rid]);

  // ── lazy fetch: article steps, prep ingredients ──
  const ensureArticleDetail = useCallback(async (a: FicheArticle) => {
    // Method (recipe steps)
    if (!stepCache.current.has(a.id)) {
      try {
        const steps = await getRecipeSteps(rid, a.id);
        const method = methodFromSteps(steps);
        stepCache.current.set(a.id, method);
        setArticles((prev) => prev.map((x) => x.id === a.id ? { ...x, method } : x));
      } catch { stepCache.current.set(a.id, []); }
    }
    // Cost inputs for the Coûts tab (MenuItemTabCost) — fetch on open if the
    // background enrichment hasn't reached this article yet, so the food-cost
    // section always renders (never the fallback).
    if (!a.costItem) {
      const raw = rawItems.current.get(a.id);
      if (raw) {
        try {
          const [ings, overrides] = await Promise.all([
            getMenuItemIngredients(rid, a.id),
            getItemOptionPrices(rid, a.id).catch(() => [] as ItemOptionOverride[]),
          ]);
          const summary = computeItemCostSummary({ item: raw, ingredients: ings, overrides, vatRate, showCostsExVat: true });
          setArticles((prev) => prev.map((x) => x.id === a.id
            ? { ...enrichArticle(x, summary, stepCache.current.get(a.id) ?? x.method ?? []), costItem: raw, costIngredients: ings, costOverrides: overrides }
            : x));
        } catch { /* keep base */ }
      }
    }
  }, [rid, vatRate]);

  // Forced re-fetch of one article's cost inputs (after the What-If simulator
  // persists changes), so the food-cost cards/breakdown reflect the new state.
  const refreshArticleCost = useCallback(async (id: number) => {
    const raw = rawItems.current.get(id);
    if (!raw) return;
    try {
      const [ings, overrides] = await Promise.all([
        getMenuItemIngredients(rid, id),
        getItemOptionPrices(rid, id).catch(() => [] as ItemOptionOverride[]),
      ]);
      const summary = computeItemCostSummary({ item: raw, ingredients: ings, overrides, vatRate, showCostsExVat: true });
      setArticles((prev) => prev.map((x) => x.id === id
        ? { ...enrichArticle(x, summary, stepCache.current.get(id) ?? x.method ?? []), costItem: raw, costIngredients: ings, costOverrides: overrides }
        : x));
    } catch { /* keep */ }
  }, [rid, vatRate]);

  const prepIngCache = useRef<Set<number>>(new Set());
  const ensurePrepDetail = useCallback(async (p: FichePrep) => {
    if (prepIngCache.current.has(p.id)) return;
    prepIngCache.current.add(p.id);
    try {
      const ings = await getPrepIngredients(rid, p.id);
      const rows = ings.map((pi) => ({
        name: pi.stock_item?.name ?? `#${pi.stock_item_id}`,
        qty: fmtQty(pi.quantity_needed, pi.stock_item?.unit ?? ''),
        cost: pi.quantity_needed * (pi.stock_item?.cost_per_unit ?? 0),
      }));
      setPreps((prev) => prev.map((x) => x.id === p.id ? { ...x, ingredients: rows, enriched: true } : x));
    } catch { /* keep base */ }
  }, [rid]);

  useEffect(() => {
    if (!open) return;
    if (open.kind === 'article') { const a = articles.find((x) => x.id === open.id); if (a) ensureArticleDetail(a); }
    else { const p = preps.find((x) => x.id === open.id); if (p) ensurePrepDetail(p); }
  }, [openKey, open, articles, preps, ensureArticleDetail, ensurePrepDetail]);

  return (
    <TintCtx.Provider value={catColorOf}>
      <div className="rlf-root">
        {view === 'grid'
          ? <GridView articles={articles} preps={preps} loading={loading} canEdit={canEdit} editor={editor} roleName={roleName} onOpen={(k) => navTo(k)} onRefresh={reload}
              recipeCats={recipeCats} onCreateCat={catCreate} onEditCat={catEdit} onDeleteCat={catDelete} />
          : <SplitView articles={articles} preps={preps} openKey={openKey!} fromKey={fromKey} canEdit={canEdit} editor={editor} roleName={roleName} reduced={reduced}
              byKey={byKey} onOpen={(k, from) => navTo(k, from)} onBackGrid={() => navTo(null)} whereUsed={whereUsed} rid={rid} vatRate={vatRate}
              onRefresh={() => { const p = parseKey(openKey); if (p && p.kind === 'article') return refreshArticleCost(p.id); }}
              catNames={catNames} onAssignCategory={assignCategory} onCreateCategory={createCategory}
              onSaveSteps={async (id, method) => {
                const input: RecipeStepInput[] = method.map((instruction, i) => ({ step_number: i + 1, instruction }));
                try { await setRecipeSteps(rid, id, input); } catch { /* surfaced by reload */ }
                stepCache.current.set(id, method);
                setArticles((prev) => prev.map((x) => x.id === id ? { ...x, method } : x));
              }} />}
      </div>
    </TintCtx.Provider>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// GRID
// ════════════════════════════════════════════════════════════════════════════
function GridView({ articles, preps, loading, canEdit, editor, roleName, onOpen, onRefresh, recipeCats, onCreateCat, onEditCat, onDeleteCat }: {
  articles: FicheArticle[]; preps: FichePrep[]; loading: boolean; canEdit: boolean; editor: string; roleName: string;
  onOpen: (k: FKey) => void; onRefresh: () => void;
  recipeCats: RecipeCategory[];
  onCreateCat: (input: { name: string; color?: string }) => Promise<void>;
  onEditCat: (oldName: string, patch: { name: string; color?: string }) => Promise<void>;
  onDeleteCat: (name: string) => Promise<void>;
}) {
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'article' | 'prep'>('all');
  const [mode, setMode] = useState<'grid' | 'list'>('grid');
  const [catFilter, setCatFilter] = useState<string>('all');
  const [catDrawer, setCatDrawer] = useState(false);
  const tint = useTint();
  useEffect(() => { const t = setTimeout(() => setDebounced(query.trim().toLowerCase()), 200); return () => clearTimeout(t); }, [query]);

  // Recipe-category entries for the drawer: managed list (with color) + any
  // orphan names still on fiches, each with a live count across BOTH types.
  const catEntries = useMemo(() => {
    const counts = new Map<string, number>();
    [...articles, ...preps].forEach((f) => { const c = effCat(f); if (c) counts.set(c, (counts.get(c) ?? 0) + 1); });
    const seen = new Set<string>();
    const entries: { name: string; count: number; color?: string }[] = [];
    recipeCats.forEach((c) => { entries.push({ name: c.name, count: counts.get(c.name) ?? 0, color: c.color || undefined }); seen.add(c.name); });
    Array.from(counts.keys()).filter((n) => !seen.has(n)).forEach((n) => entries.push({ name: n, count: counts.get(n) ?? 0 }));
    return entries.sort((a, b) => a.name.localeCompare(b.name));
  }, [articles, preps, recipeCats]);

  const matchArt = (a: FicheArticle) => (catFilter === 'all' || effCat(a) === catFilter) && (!debounced || a.name.toLowerCase().includes(debounced) || effCat(a).toLowerCase().includes(debounced));
  const matchPrep = (p: FichePrep) => (catFilter === 'all' || effCat(p) === catFilter) && (!debounced || p.name.toLowerCase().includes(debounced) || effCat(p).toLowerCase().includes(debounced));
  const arts = articles.filter(matchArt);
  const prps = preps.filter(matchPrep);
  const shown = (typeFilter !== 'prep' ? arts.length : 0) + (typeFilter !== 'article' ? prps.length : 0);

  const avgPrice = articles.length ? articles.reduce((s, a) => s + a.price, 0) / articles.length : 0;
  const reset = () => { setQuery(''); setDebounced(''); setTypeFilter('all'); setCatFilter('all'); };

  return (
    <>
      <PageHead
        title="Fiches recettes"
        desc={`Bibliothèque centrale · ${articles.length} articles · ${preps.length} préparations`}
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {canEdit
              ? <Badge tone="neutral" style={{ height: 28, padding: '0 10px' }}><PencilIcon size={12} /> {roleName || 'Chef'} · peut modifier</Badge>
              : <Badge tone="neutral" style={{ height: 28, padding: '0 10px' }}><EyeIcon size={12} /> Lecture seule · {editor} peut modifier</Badge>}
            <Button variant="secondary" onClick={onRefresh}><RefreshCwIcon size={14} /> Recalculer</Button>
            {canEdit && <Button variant="primary"><PlusIcon size={14} /> Nouvelle fiche</Button>}
          </div>
        }
      />

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 20 }}>
        <Kpi label="Total fiches" value={articles.length + preps.length} sub={`${catEntries.length} catégories`} />
        <Kpi label="Articles (carte)" value={articles.length} sub="recettes d'assemblage" />
        <Kpi label="Préparations (cuisine)" value={preps.length} sub={`${preps.filter((p) => p.critical).length} critique(s)`} />
        <Kpi label="Prix moyen" value={money(avgPrice)} sub="par article" />
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: 36, padding: '0 12px', flex: '1 1 280px', minWidth: 240, background: 'var(--surface)', border: '1px solid var(--line-strong)', borderRadius: 'var(--r-md)' }}>
          <SearchIcon size={14} style={{ color: 'var(--fg-subtle)' }} />
          <input placeholder="Rechercher une fiche, une catégorie…" value={query} onChange={(e) => setQuery(e.target.value)}
            style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', color: 'var(--fg)', font: 'inherit', fontSize: 13 }} />
        </div>
        <div style={{ display: 'inline-flex', gap: 2, background: 'var(--surface-2)', padding: 4, borderRadius: 'var(--r-md)' }}>
          {(['all', 'article', 'prep'] as const).map((t) => (
            <button key={t} onClick={() => setTypeFilter(t)} style={segBtn(typeFilter === t)}>
              {t === 'all' ? 'Tout' : t === 'article' ? 'Articles' : 'Préparations'}
            </button>
          ))}
        </div>
        {/* Recipe-category filter — opens the right drawer (filter + manage) */}
        <button onClick={() => setCatDrawer(true)} title="Catégorie recette"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 36, padding: '0 12px', background: 'var(--surface)', border: '1px solid ' + (catFilter !== 'all' ? 'var(--brand-500)' : 'var(--line-strong)'), borderRadius: 'var(--r-md)', color: 'var(--fg)', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
          {catFilter !== 'all' && <span style={{ width: 8, height: 8, borderRadius: '50%', background: tint(catFilter), flexShrink: 0 }} />}
          Catégorie · {catFilter === 'all' ? 'Toutes' : catFilter}
          <ChevronDownIcon size={14} style={{ color: 'var(--fg-subtle)' }} />
        </button>
        <div style={{ display: 'inline-flex', gap: 2, background: 'var(--surface-2)', padding: 4, borderRadius: 'var(--r-md)', marginLeft: 'auto' }}>
          <button onClick={() => setMode('grid')} style={{ ...segBtn(mode === 'grid'), width: 30, padding: 0 }} title="Grille"><LayoutGridIcon size={13} /></button>
          <button onClick={() => setMode('list')} style={{ ...segBtn(mode === 'list'), width: 30, padding: 0 }} title="Liste"><ListIcon size={13} /></button>
        </div>
      </div>

      <CategoryDrawer
        open={catDrawer}
        mode="filter"
        withColor
        onClose={() => setCatDrawer(false)}
        categories={catEntries}
        currentCategory={catFilter === 'all' ? '' : catFilter}
        onSelect={(name) => { setCatFilter(name || 'all'); setCatDrawer(false); }}
        onCreateCategory={canEdit ? onCreateCat : undefined}
        onEditCategory={canEdit ? onEditCat : undefined}
        onDeleteCategory={canEdit ? onDeleteCat : undefined}
      />

      {/* Colored category chip row — quick filter (matches the design). */}
      {catEntries.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
          <CatChip active={catFilter === 'all'} label="Tous" count={articles.length + preps.length} onClick={() => setCatFilter('all')} />
          {catEntries.map((c) => (
            <CatChip key={c.name} active={catFilter === c.name} label={c.name} count={c.count} color={tint(c.name)} onClick={() => setCatFilter(catFilter === c.name ? 'all' : c.name)} />
          ))}
        </div>
      )}

      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
          {Array.from({ length: 8 }).map((_, i) => <div key={i} className="rlf-sk" style={{ height: 232, borderRadius: 'var(--r-lg)' }} />)}
        </div>
      ) : shown === 0 ? (
        <EmptyState onReset={reset} />
      ) : (
        <>
          {typeFilter !== 'prep' && arts.length > 0 && (
            <>
              <SectionHead icon={<ListIcon size={14} />} title="Articles" sub="Recettes d'assemblage — ce qui part en boîte" count={arts.length} />
              {mode === 'grid'
                ? <div style={cardGrid}>{arts.map((a) => <FicheCard key={'a' + a.id} fiche={a} onOpen={() => onOpen(keyOf('article', a.id))} />)}</div>
                : <ListRows fiches={arts} onOpen={(id) => onOpen(keyOf('article', id))} />}
            </>
          )}
          {typeFilter !== 'article' && prps.length > 0 && (
            <>
              <SectionHead icon={<ChefHatIcon size={14} />} title="Préparations" sub="Recettes cuisine — bases réutilisées dans plusieurs articles" count={prps.length} />
              {mode === 'grid'
                ? <div style={cardGrid}>{prps.map((p) => <FicheCard key={'p' + p.id} fiche={p} onOpen={() => onOpen(keyOf('prep', p.id))} />)}</div>
                : <ListRows fiches={prps} onOpen={(id) => onOpen(keyOf('prep', id))} />}
            </>
          )}
        </>
      )}
    </>
  );
}

const segBtn = (on: boolean): React.CSSProperties => ({
  height: 28, padding: '0 12px', border: 'none', borderRadius: 'var(--r-sm)', fontSize: 12, fontWeight: 500,
  background: on ? 'var(--surface)' : 'transparent', color: on ? 'var(--fg)' : 'var(--fg-muted)',
  boxShadow: on ? 'var(--shadow-1)' : 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, cursor: 'pointer',
});
const cardGrid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 };

function CatChip({ active, label, count, color, onClick }: { active: boolean; label: string; count: number; color?: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      display: 'inline-flex', alignItems: 'center', gap: 6, height: 32, padding: '0 14px', borderRadius: 999,
      border: '1px solid ' + (active ? 'var(--brand-500)' : 'var(--line)'),
      background: active ? 'var(--brand-500)' : 'var(--surface)', color: active ? '#fff' : 'var(--fg-muted)',
      fontSize: 13, fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap',
    }}>
      {color && <span style={{ width: 8, height: 8, borderRadius: '50%', background: active ? '#fff' : color, flexShrink: 0 }} />}
      {label} <span style={{ opacity: .6 }}>{count}</span>
    </button>
  );
}

function SectionHead({ icon, title, sub, count }: { icon: React.ReactNode; title: string; sub: string; count: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--surface-2)', color: 'var(--fg-muted)', display: 'grid', placeItems: 'center' }}>{icon}</div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg)' }}>{title} <span style={{ color: 'var(--fg-muted)', fontWeight: 400, marginLeft: 6 }}>· {count}</span></div>
          <div style={{ fontSize: 12, color: 'var(--fg-subtle)' }}>{sub}</div>
        </div>
      </div>
    </div>
  );
}

function FicheCard({ fiche, onOpen }: { fiche: FicheArticle | FichePrep; onOpen: () => void }) {
  const isArt = fiche.kind === 'article';
  const tint = useTint();
  const col = tint(effCat(fiche));
  return (
    <div className="rlf-card" onClick={onOpen}>
      <div style={{ position: 'relative', height: 120, background: `linear-gradient(135deg, color-mix(in oklab, ${col} 30%, var(--surface-2)), var(--surface-2))`, overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: col }} />
        {isArt && (fiche as FicheArticle).image
          ? <img src={(fiche as FicheArticle).image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: 'var(--fg-subtle)' }}><ImageIcon size={22} /></div>}
        {!isArt && (fiche as FichePrep).critical && <div style={{ position: 'absolute', top: 10, left: 10 }}><Badge tone="warning"><TriangleAlertIcon size={10} /> Critique</Badge></div>}
        <span className="rlf-open-chip">Ouvrir <ChevronRightIcon size={12} /></span>
      </div>
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: col, flexShrink: 0 }} />
          <span style={{ fontSize: 12, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 500 }}>{effCat(fiche) || 'Sans catégorie'}</span>
        </div>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg)', lineHeight: 1.2 }}>{fiche.name}</div>
        {isArt
          ? <RelLine icon={<ChefHatIcon size={11} />} color="var(--cat-8)" text={relForArticle(fiche as FicheArticle)} />
          : <RelLine icon={<ListIcon size={11} />} color="var(--brand-500)" text={relForPrep(fiche as FichePrep)} />}
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 12, borderTop: '1px solid var(--line)' }}>
          {isArt ? (
            <>
              <KpiMini label="Coût" value={(fiche as FicheArticle).enriched ? money((fiche as FicheArticle).cost) : '…'} tone="muted" />
              <KpiMini label="Prix" value={`₪${(fiche as FicheArticle).price}`} />
              <KpiMini label="Marge" value={(fiche as FicheArticle).enriched && (fiche as FicheArticle).costPct != null ? `${Math.round((1 - ((fiche as FicheArticle).costPct as number)) * 100)} %` : '…'} tone="success" />
            </>
          ) : (
            <>
              <KpiMini label="Rendement" value={(fiche as FichePrep).yieldLabel} />
              <KpiMini label="Coût/u" value={money((fiche as FichePrep).costPerUnit)} tone="muted" />
              <KpiMini label="Liés" value={String((fiche as FichePrep).usedByCount)} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
const RelLine = ({ icon, color, text }: { icon: React.ReactNode; color: string; text: string }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 6, color, fontSize: 12, fontWeight: 500 }}>{icon} {text}</div>
);
function relForArticle(a: FicheArticle): string {
  if (!a.enriched || !a.linkedPreps) return 'Composition…';
  const n = a.linkedPreps.length;
  return n === 0 ? 'Aucune préparation' : `Utilise ${n} préparation${n > 1 ? 's' : ''}`;
}
function relForPrep(p: FichePrep): string {
  return p.usedByCount === 0 ? 'Non utilisée' : `Utilisée dans ${p.usedByCount} article${p.usedByCount > 1 ? 's' : ''}`;
}

function ListRows({ fiches, onOpen }: { fiches: (FicheArticle | FichePrep)[]; onOpen: (id: number) => void }) {
  const tint = useTint();
  return (
    <div style={{ border: '1px solid var(--line)', borderRadius: 'var(--r-lg)', overflow: 'hidden', marginBottom: 24, background: 'var(--surface)' }}>
      {fiches.map((f, i) => (
        <div key={f.kind + f.id} className="rlf-row" onClick={() => onOpen(f.id)} style={{ borderTop: i ? '1px solid var(--line)' : 'none' }}>
          <div style={{ width: 34, height: 34, borderRadius: 8, background: `linear-gradient(135deg, color-mix(in oklab, ${tint(effCat(f))} 40%, var(--surface-2)), var(--surface-2))`, display: 'grid', placeItems: 'center', color: 'var(--fg-muted)' }}>
            {f.kind === 'article' ? <ListIcon size={14} /> : <ChefHatIcon size={14} />}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg)' }}>{f.name}</div>
            <div style={{ fontSize: 12, color: 'var(--fg-muted)' }}>{effCat(f) || 'Sans catégorie'}</div>
          </div>
          <span className="num" style={{ fontSize: 13, color: 'var(--fg-muted)' }}>{f.kind === 'article' ? `₪${(f as FicheArticle).price}` : (f as FichePrep).yieldLabel}</span>
          <ChevronRightIcon size={14} style={{ color: 'var(--fg-subtle)' }} />
        </div>
      ))}
    </div>
  );
}

function EmptyState({ onReset }: { onReset: () => void }) {
  return (
    <div style={{ border: '1px solid var(--line)', borderRadius: 'var(--r-lg)', background: 'var(--surface)', padding: 40, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, textAlign: 'center' }}>
      <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'var(--surface-2)', color: 'var(--fg-subtle)', display: 'grid', placeItems: 'center' }}><SearchIcon size={22} /></div>
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg)' }}>Aucune fiche</div>
      <div style={{ fontSize: 13, color: 'var(--fg-subtle)' }}>Essayez un autre filtre ou un autre terme de recherche.</div>
      <Button variant="secondary" size="sm" onClick={onReset}><RefreshCwIcon size={12} /> Réinitialiser les filtres</Button>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// SPLIT
// ════════════════════════════════════════════════════════════════════════════
function SplitView({ articles, preps, openKey, fromKey, canEdit, editor, roleName, reduced, rid, vatRate, onRefresh, byKey, onOpen, onBackGrid, whereUsed, onSaveSteps, catNames, onAssignCategory, onCreateCategory }: {
  articles: FicheArticle[]; preps: FichePrep[]; openKey: string; fromKey: string | null;
  canEdit: boolean; editor: string; roleName: string; reduced: boolean; rid: number; vatRate: number; onRefresh: () => void | Promise<void>;
  byKey: (k: string | null | undefined) => FicheArticle | FichePrep | undefined;
  onOpen: (k: FKey, from?: FKey | null) => void; onBackGrid: () => void;
  whereUsed: Map<number, UsedByEntry[]>;
  onSaveSteps: (id: number, method: string[]) => void | Promise<void>;
  catNames: string[];
  onAssignCategory: (kind: 'article' | 'prep', id: number, name: string) => void | Promise<void>;
  onCreateCategory: (name: string) => Promise<string | null>;
}) {
  const all = useMemo(() => [...articles, ...preps], [articles, preps]);
  const fiche = byKey(openKey);

  // pane transition machine
  const [paneKey, setPaneKey] = useState(openKey);
  const [phase, setPhase] = useState<'skeleton' | 'idle' | 'exit' | 'enter' | 'jexit' | 'jenter'>('skeleton');
  const [flashPrep, setFlashPrep] = useState<number | null>(null);
  const actionRef = useRef<'open' | 'select' | 'jump'>('open');
  const firstRun = useRef(true);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const clear = () => { timers.current.forEach(clearTimeout); timers.current = []; };
  const after = (ms: number, fn: () => void) => { timers.current.push(setTimeout(fn, ms)); };
  const SK = 1500, EX = reduced ? 80 : 180, EN = reduced ? 80 : 180, JX = reduced ? 80 : 220, JN = reduced ? 80 : 280;

  useEffect(() => {
    const action = actionRef.current; actionRef.current = 'select';
    if (firstRun.current || action === 'open') { firstRun.current = false; clear(); setPaneKey(openKey); setPhase('skeleton'); after(SK, () => { setPhase('enter'); after(EN, () => setPhase('idle')); }); return; }
    if (openKey === paneKey) { setPhase('idle'); return; }
    if (action === 'jump') { clear(); setPhase('jexit'); after(JX, () => { setPaneKey(openKey); setPhase('jenter'); setFlashPrep(null); after(JN, () => setPhase('idle')); }); }
    else { clear(); setPhase('exit'); after(EX, () => { setPaneKey(openKey); setPhase('enter'); after(EN, () => setPhase('idle')); }); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openKey]);
  useEffect(() => () => clear(), []);

  const jump = (prepId: number, fromArticleId: number) => {
    setFlashPrep(prepId);
    actionRef.current = 'jump';
    onOpen(keyOf('prep', prepId), keyOf('article', fromArticleId));
    after(reduced ? 0 : JX, () => setFlashPrep(null));
  };
  const select = (k: FKey) => { actionRef.current = 'select'; onOpen(k); };

  const paneFiche = byKey(paneKey);
  const fromFiche = byKey(fromKey);
  const paneCls = phase === 'exit' ? 'rlf-exit' : phase === 'enter' ? 'rlf-enter' : phase === 'jexit' ? 'rlf-jexit' : phase === 'jenter' ? 'rlf-jenter' : '';

  return (
    <>
      <div style={{ marginBottom: 12 }}>
        <Button variant="ghost" size="sm" onClick={onBackGrid}><ChevronLeftIcon size={14} /> Retour à la grille</Button>
      </div>
      <PageHead
        title="Fiches recettes"
        desc={`${articles.length} articles · ${preps.length} préparations`}
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {canEdit
              ? <Badge tone="neutral" style={{ height: 28, padding: '0 10px' }}><PencilIcon size={12} /> {roleName || 'Chef'} · peut modifier</Badge>
              : <Badge tone="neutral" style={{ height: 28, padding: '0 10px' }}><EyeIcon size={12} /> Lecture seule · {editor} peut modifier</Badge>}
          </div>
        }
      />
      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', border: '1px solid var(--line)', borderRadius: 'var(--r-lg)', overflow: 'hidden', minHeight: 760, background: 'var(--surface)' }}>
        <ListRail all={all} activeKey={openKey} onSelect={select} reduced={reduced} />
        <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', background: 'var(--bg)', overflow: 'hidden' }}>
          {phase === 'skeleton' || !paneFiche
            ? <PaneSkeleton />
            : <div className={`rlf-pane ${paneCls}`} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
                {paneFiche.kind === 'article'
                  ? <ArticleDetail a={paneFiche as FicheArticle} canEdit={canEdit} editor={editor} flashPrep={flashPrep} onJump={jump} onSaveSteps={onSaveSteps}
                      rid={rid} vatRate={vatRate} onRefresh={onRefresh}
                      catNames={catNames} onAssignCategory={(name) => onAssignCategory('article', (paneFiche as FicheArticle).id, name)} onCreateCategory={onCreateCategory} />
                  : <PrepDetail p={paneFiche as FichePrep} canEdit={canEdit} editor={editor} fromName={fromFiche?.name ?? null} fromKey={fromKey} onBack={() => fromKey && select(fromKey)} onOpenArticle={(id) => select(keyOf('article', id))} usedBy={whereUsed.get((paneFiche as FichePrep).id) ?? (paneFiche as FichePrep).usedBy ?? []}
                      catNames={catNames} onAssignCategory={(name) => onAssignCategory('prep', (paneFiche as FichePrep).id, name)} onCreateCategory={onCreateCategory} />}
              </div>}
        </div>
      </div>
    </>
  );
}

function ListRail({ all, activeKey, onSelect, reduced }: { all: (FicheArticle | FichePrep)[]; activeKey: string; onSelect: (k: FKey) => void; reduced: boolean }) {
  const tint = useTint();
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'article' | 'prep'>('all');
  useEffect(() => { const t = setTimeout(() => setDebounced(query.trim().toLowerCase()), 200); return () => clearTimeout(t); }, [query]);

  const contentRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [ind, setInd] = useState({ top: 0, height: 0, show: false });

  const filtered = all.filter((f) => (typeFilter === 'all' || f.kind === typeFilter) && (!debounced || f.name.toLowerCase().includes(debounced) || effCat(f).toLowerCase().includes(debounced)));
  const groups = useMemo(() => {
    const m = new Map<string, (FicheArticle | FichePrep)[]>();
    filtered.forEach((f) => { const k = effCat(f) || 'Sans catégorie'; if (!m.has(k)) m.set(k, []); m.get(k)!.push(f); });
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);
  const filterKey = filtered.map((f) => f.kind + f.id).join(',');

  useLayoutEffect(() => {
    const el = rowRefs.current[activeKey];
    if (el && contentRef.current) setInd({ top: el.offsetTop, height: el.offsetHeight, show: true });
    else setInd((s) => ({ ...s, show: false }));
  }, [activeKey, filterKey]);

  return (
    <div style={{ borderRight: '1px solid var(--line)', display: 'flex', flexDirection: 'column', minWidth: 0, background: 'var(--surface)' }}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--line)', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: 36, padding: '0 12px', background: 'var(--surface)', border: '1px solid var(--line-strong)', borderRadius: 'var(--r-md)' }}>
          <SearchIcon size={14} style={{ color: 'var(--fg-subtle)' }} />
          <input placeholder="Rechercher…" value={query} onChange={(e) => setQuery(e.target.value)} style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', color: 'var(--fg)', font: 'inherit', fontSize: 13 }} />
        </div>
        <div style={{ display: 'inline-flex', gap: 2, background: 'var(--surface-2)', padding: 4, borderRadius: 'var(--r-md)' }}>
          {(['all', 'article', 'prep'] as const).map((t) => (
            <button key={t} onClick={() => setTypeFilter(t)} style={{ ...segBtn(typeFilter === t), flex: 1 }}>{t === 'all' ? 'Tout' : t === 'article' ? 'Articles' : 'Préps'}</button>
          ))}
        </div>
      </div>
      <div ref={contentRef} style={{ flex: 1, overflowY: 'auto', padding: '8px 0', position: 'relative' }}>
        <div className="rlf-indicator" style={{ transform: `translateY(${ind.top}px)`, height: ind.height, opacity: ind.show ? 1 : 0, transition: reduced ? 'opacity .12s' : undefined }} />
        {groups.length === 0 ? (
          <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--fg-subtle)' }}>
            <SearchIcon size={20} /><div style={{ fontSize: 13, marginTop: 8 }}>Aucune fiche</div>
          </div>
        ) : groups.map(([catName, items]) => (
          <div key={catName}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '12px 16px 4px', fontSize: 10, fontWeight: 600, color: 'var(--fg-subtle)', textTransform: 'uppercase', letterSpacing: '.08em' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: tint(catName === 'Sans catégorie' ? '' : catName), flexShrink: 0 }} /> {catName} <span style={{ opacity: .6 }}>· {items.length}</span>
            </div>
            {items.map((f) => {
              const k = keyOf(f.kind, f.id);
              return (
                <div key={k} ref={(el) => { rowRefs.current[k] = el; }} className={`rlf-row ${k === activeKey ? 'active' : ''}`} onClick={() => onSelect(k)}>
                  <div style={{ width: 34, height: 34, borderRadius: 8, background: `linear-gradient(135deg, color-mix(in oklab, ${tint(effCat(f))} 40%, var(--surface-2)), var(--surface-2))`, display: 'grid', placeItems: 'center', color: 'var(--fg-muted)', flexShrink: 0 }}>
                    {f.kind === 'article' ? <ListIcon size={14} /> : <ChefHatIcon size={14} />}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 13, fontWeight: k === activeKey ? 600 : 500, color: 'var(--fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                      {f.kind === 'prep' && (f as FichePrep).critical && <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--warning-500)', flexShrink: 0 }} />}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2, fontSize: 12, color: 'var(--fg-muted)' }}>
                      <span className="num">{f.kind === 'article' ? `₪${(f as FicheArticle).price}` : (f as FichePrep).yieldLabel}</span>
                      <span>·</span>
                      <span>{f.kind === 'article' ? relForArticle(f as FicheArticle).replace('Utilise ', '').replace('préparations', 'prép.').replace('préparation', 'prép.') : `${(f as FichePrep).usedByCount} art.`}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function PaneSkeleton() {
  const Bar = ({ w, h, r }: { w: number | string; h?: number; r?: number }) => <div className="rlf-sk" style={{ width: w, height: h ?? 12, borderRadius: r ?? 6 }} />;
  return (
    <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
        <Bar w={80} h={80} r={14} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}><Bar w={120} h={18} /><Bar w={220} h={26} /><Bar w={180} h={12} /></div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>{[0, 1, 2, 3, 4].map((i) => <Bar key={i} w="100%" h={52} r={14} />)}</div>
      <Bar w={260} h={28} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>{[0, 1, 2].map((i) => <Bar key={i} w="100%" h={44} r={10} />)}</div>
    </div>
  );
}

// ─── detail KPI ──
const DetailKpi = ({ label, value, tone }: { label: string; value: React.ReactNode; tone?: 'success' | 'warn' }) => (
  <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--r-lg)', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 4 }}>
    <div style={{ fontSize: 10, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 500 }}>{label}</div>
    <div className="num" style={{ fontSize: 18, fontWeight: 600, color: tone === 'success' ? 'var(--success-500)' : tone === 'warn' ? 'var(--warning-500)' : 'var(--fg)' }}>{value}</div>
  </div>
);

function DetailHeaderActions({ canEdit, editor, onEdit, showEdit = true }: { canEdit: boolean; editor: string; onEdit: () => void; showEdit?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <Button variant="ghost" size="sm" icon title="Aperçu"><EyeIcon size={14} /></Button>
      {showEdit && (canEdit
        ? <Button variant="primary" size="sm" onClick={onEdit}><PencilIcon size={14} /> Modifier</Button>
        : <LockChip editor={editor} />)}
    </div>
  );
}

// ─── ARTICLE detail ──
function ArticleDetail({ a, canEdit, editor, flashPrep, onJump, onSaveSteps, rid, vatRate, onRefresh, catNames, onAssignCategory, onCreateCategory }: {
  a: FicheArticle; canEdit: boolean; editor: string; flashPrep: number | null; rid: number; vatRate: number; onRefresh: () => void | Promise<void>;
  onJump: (prepId: number, fromArticleId: number) => void; onSaveSteps: (id: number, method: string[]) => void | Promise<void>;
  catNames: string[]; onAssignCategory: (name: string) => void | Promise<void>; onCreateCategory: (name: string) => Promise<string | null>;
}) {
  const tint = useTint();
  const col = tint(effCat(a));
  const [tab, setTab] = useState<'compo' | 'method' | 'cost'>('compo');
  const [editorOpen, setEditorOpen] = useState(false);
  const comps = a.comps ?? [];
  const method = a.method ?? [];
  const total = a.cost ?? comps.reduce((s, x) => s + x.cost, 0);
  const costPct = a.costPct != null ? Math.round(a.costPct * 100) : null;

  return (
    <>
      <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--line)', display: 'flex', gap: 20, alignItems: 'flex-start', background: 'var(--surface)' }}>
        <div style={{ width: 80, height: 80, borderRadius: 'var(--r-lg)', background: `linear-gradient(135deg, color-mix(in oklab, ${col} 35%, var(--surface-2)), var(--surface-2))`, border: '1px solid var(--line)', position: 'relative', overflow: 'hidden', flexShrink: 0 }}>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: col }} />
          {a.image ? <img src={a.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: 'var(--fg-muted)', opacity: .5 }}><ListIcon size={22} /></div>}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <TypePill kind="article" />
            <InlineCategoryPicker value={effCat(a)} catNames={catNames} canEdit={canEdit} editor={editor} onAssign={onAssignCategory} onCreate={onCreateCategory} />
          </div>
          <h2 style={{ fontSize: 22, fontWeight: 600, color: 'var(--fg)', margin: 0, lineHeight: 1.15 }}>{a.name}</h2>
          <div style={{ fontSize: 13, color: 'var(--fg-subtle)', marginTop: 4 }}>Recette d'assemblage{a.timeMins ? ` · ${a.timeMins} min` : ''}</div>
        </div>
        <DetailHeaderActions canEdit={canEdit} editor={editor} onEdit={() => setEditorOpen(true)} />
      </div>

      <div style={{ padding: '16px 24px 0', display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
        <DetailKpi label="Prix de vente" value={money(a.price)} />
        <DetailKpi label="Coût matière" value={a.enriched ? money(total) : '…'} />
        <DetailKpi label="Marge brute" value={a.enriched ? money(a.price - total) : '…'} tone="success" />
        <DetailKpi label="% Coût" value={costPct != null ? `${costPct} %` : '…'} tone={costPct != null && costPct > 35 ? 'warn' : 'success'} />
        <DetailKpi label="Préparations" value={a.linkedPreps ? a.linkedPreps.length : '…'} />
      </div>

      <div style={{ padding: '16px 24px 0' }}>
        <div style={{ display: 'flex', gap: 20, borderBottom: '1px solid var(--line)' }}>
          {([['compo', 'Composition'], ['method', 'Méthode'], ['cost', 'Coûts']] as const).map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} style={underlineTab(tab === k)}>{l}</button>
          ))}
        </div>
      </div>

      {tab === 'cost' ? (
        // Full-width — identical to the Food Cost page's detail (cards +
        // per-ingredient breakdown + "Et si?" simulator all live in MenuItemTabCost).
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
          {a.costItem && a.costIngredients
            ? <MenuItemTabCost rid={rid} item={a.costItem} ingredients={a.costIngredients} itemOptionOverrides={a.costOverrides ?? []} vatRate={vatRate} price={a.price} onChangesApplied={onRefresh} />
            : <CostTab comps={comps} total={total} />}
        </div>
      ) : (
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'grid', gridTemplateColumns: '1fr 300px', gap: 20 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {tab === 'compo' && <CompositionTable comps={comps} total={total} flashPrep={flashPrep} onJump={(prepId) => onJump(prepId, a.id)} />}
            {(tab === 'compo' || tab === 'method') && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg)' }}>Méthode d'assemblage <span style={{ fontWeight: 400, fontSize: 12, color: 'var(--fg-subtle)', marginLeft: 6 }}>{method.length} étape(s)</span></div>
                  {canEdit && <Button variant="ghost" size="sm" onClick={() => setEditorOpen(true)}><PencilIcon size={12} /> Éditer</Button>}
                </div>
                {method.length === 0
                  ? <div style={{ border: '1px dashed var(--line-strong)', borderRadius: 'var(--r-lg)', padding: 20, color: 'var(--fg-subtle)', fontSize: 13 }}>Aucune étape. {canEdit ? 'Cliquez sur Éditer pour en ajouter.' : ''}</div>
                  : <MethodList steps={method} canEdit={canEdit} editor={editor} onSaveStep={(i, v) => onSaveSteps(a.id, method.map((s, si) => si === i ? v : s))} />}
              </div>
            )}
            {tab === 'compo' && a.note && <NoteCard text={a.note} />}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <LinkedPrepsPanel a={a} onJump={(id) => onJump(id, a.id)} />
          </div>
        </div>
      )}

      {canEdit && (
        <StepsEditor open={editorOpen} onOpenChange={setEditorOpen} name={a.name} method={method} onSave={(m) => onSaveSteps(a.id, m)} />
      )}
    </>
  );
}

function CompositionTable({ comps, total, flashPrep, onJump }: { comps: CompRow[]; total: number; flashPrep: number | null; onJump: (prepId: number) => void }) {
  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg)' }}>Composition de la boîte</div>
        <div style={{ fontSize: 12, color: 'var(--fg-subtle)' }}>Pour 1 portion vendue · ce qui part chez le client</div>
      </div>
      <div style={{ border: '1px solid var(--line)', borderRadius: 'var(--r-lg)', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead><tr>
            {['Composant', 'Type', 'Quantité', 'Coût'].map((h, i) => <th key={h} style={{ textAlign: i >= 2 ? 'right' : 'left', ...thStyle }}>{h}</th>)}
          </tr></thead>
          <tbody>
            {comps.length === 0 && <tr><td colSpan={4} style={{ ...tdStyle, color: 'var(--fg-subtle)' }}>Aucun ingrédient enregistré.</td></tr>}
            {comps.map((c, i) => {
              const isPrep = c.kind === 'prep';
              const flash = isPrep && flashPrep === c.refId;
              return (
                <tr key={i} className={isPrep ? `rlf-prep-row ${flash ? 'rlf-flash' : ''}` : ''}
                  style={{ background: isPrep ? 'color-mix(in oklab, var(--cat-8) 6%, transparent)' : 'transparent', cursor: isPrep && c.refId ? 'pointer' : 'default' }}
                  onClick={isPrep && c.refId ? () => onJump(c.refId as number) : undefined}>
                  <td style={tdStyle}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ width: 28, height: 28, borderRadius: 6, background: isPrep ? 'color-mix(in oklab, var(--cat-8) 18%, transparent)' : 'var(--surface-2)', color: isPrep ? 'var(--cat-8)' : 'var(--fg-muted)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                        {isPrep ? <ChefHatIcon size={13} /> : <BoxIcon size={13} />}
                      </div>
                      <span style={{ fontWeight: 500, color: 'var(--fg)', display: 'flex', alignItems: 'center', gap: 6 }}>
                        {c.name}
                        {isPrep && c.refId && <span className="rlf-seefiche" style={{ fontSize: 10, color: 'var(--cat-8)', fontWeight: 600 }}>Voir la fiche →</span>}
                      </span>
                    </div>
                  </td>
                  <td style={tdStyle} onClick={(e) => e.stopPropagation()}><TypePill kind={isPrep ? 'prep' : 'article'} size="sm" /></td>
                  <td className="num" style={{ ...tdStyle, textAlign: 'right' }}>{c.qty}</td>
                  <td className="num" style={{ ...tdStyle, textAlign: 'right', fontWeight: 500 }}>{money(c.cost)}</td>
                </tr>
              );
            })}
            <tr style={{ background: 'var(--surface-2)' }}>
              <td colSpan={3} style={{ ...tdStyle, textAlign: 'right', fontWeight: 600 }}>Coût matière total</td>
              <td className="num" style={{ ...tdStyle, textAlign: 'right', fontWeight: 600 }}>{money(total)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MethodList({ steps, canEdit, editor, onSaveStep, accent }: { steps: string[]; canEdit: boolean; editor: string; onSaveStep: (i: number, v: string) => void; accent?: boolean }) {
  return (
    <div style={{ border: '1px solid var(--line)', borderRadius: 'var(--r-lg)', background: 'var(--surface)', padding: '16px 20px' }}>
      <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {steps.map((s, i) => (
          <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <span style={{ width: 24, height: 24, borderRadius: '50%', background: accent ? 'color-mix(in oklab, var(--cat-8) 18%, transparent)' : 'var(--surface-2)', color: accent ? 'var(--cat-8)' : 'var(--fg-muted)', display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 600, flexShrink: 0 }} className="num">{i + 1}</span>
            <span style={{ fontSize: 13, color: 'var(--fg)', lineHeight: 1.5, flex: 1 }}>
              <EditableText value={s} canEdit={canEdit} editor={editor} multiline onSave={(v) => onSaveStep(i, v)} />
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function NoteCard({ text }: { text: string }) {
  return (
    <div style={{ border: '1px solid color-mix(in oklab, var(--warning-500) 30%, var(--line))', background: 'color-mix(in oklab, var(--warning-500) 4%, var(--surface))', borderRadius: 'var(--r-lg)', padding: '16px 20px', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
      <InfoIcon size={16} style={{ color: 'var(--warning-500)', flexShrink: 0 }} />
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--warning-500)', marginBottom: 2 }}>Note du chef</div>
        <div style={{ fontSize: 13, color: 'var(--fg)', lineHeight: 1.5 }}>{text}</div>
      </div>
    </div>
  );
}

function CostTab({ comps, total }: { comps: CompRow[]; total: number }) {
  return (
    <div style={{ border: '1px solid var(--line)', borderRadius: 'var(--r-lg)', background: 'var(--surface)', padding: '16px 20px' }}>
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Décomposition du coût</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {comps.map((c, i) => {
          const pct = total > 0 ? Math.round((c.cost / total) * 100) : 0;
          return (
            <div key={i}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 13 }}>{c.name}</span>
                <span className="num" style={{ fontSize: 12, color: 'var(--fg-muted)' }}>{money(c.cost)} · {pct} %</span>
              </div>
              <div style={{ height: 4, background: 'var(--surface-2)', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ width: `${pct}%`, height: '100%', background: c.kind === 'prep' ? 'var(--cat-8)' : 'var(--brand-500)' }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LinkedPrepsPanel({ a, onJump }: { a: FicheArticle; onJump: (id: number) => void }) {
  const preps = a.linkedPreps ?? [];
  return (
    <div style={{ border: '1px solid color-mix(in oklab, var(--cat-8) 25%, var(--line))', borderRadius: 'var(--r-lg)', overflow: 'hidden', background: 'var(--surface)' }}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid color-mix(in oklab, var(--cat-8) 25%, var(--line))', background: 'color-mix(in oklab, var(--cat-8) 5%, var(--surface))' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: 600 }}><ChefHatIcon size={14} /> {preps.length > 1 ? `${preps.length} préparations source` : 'Préparation source'}</div>
        <div style={{ fontSize: 12, color: 'var(--fg-subtle)' }}>Recettes cuisine qui alimentent cette fiche</div>
      </div>
      <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {preps.length === 0 && <div style={{ fontSize: 13, color: 'var(--fg-subtle)' }}>Aucune préparation liée — composée uniquement d'articles de stock.</div>}
        {preps.map((p) => (
          <div key={p.id} onClick={() => onJump(p.id)} style={{ padding: 12, borderRadius: 8, background: 'var(--surface)', border: '1px solid var(--line)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 8, background: 'color-mix(in oklab, var(--cat-8) 18%, transparent)', color: 'var(--cat-8)', display: 'grid', placeItems: 'center', flexShrink: 0 }}><ChefHatIcon size={14} /></div>
            <span style={{ flex: 1, fontSize: 13, fontWeight: 500, color: 'var(--fg)' }}>{p.name}</span>
            <ChevronRightIcon size={14} style={{ color: 'var(--fg-subtle)' }} />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── PREP detail ──
function PrepDetail({ p, canEdit, editor, fromName, fromKey, onBack, onOpenArticle, usedBy, catNames, onAssignCategory, onCreateCategory }: {
  p: FichePrep; canEdit: boolean; editor: string; fromName: string | null; fromKey: string | null;
  onBack: () => void; onOpenArticle: (id: number) => void; usedBy: UsedByEntry[];
  catNames: string[]; onAssignCategory: (name: string) => void | Promise<void>; onCreateCategory: (name: string) => Promise<string | null>;
}) {
  const tint = useTint();
  const col = tint(effCat(p));
  const ingredients = p.ingredients ?? [];
  const usedCount = usedBy.length || p.usedByCount;
  return (
    <>
      <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--line)', display: 'flex', gap: 20, alignItems: 'flex-start', background: 'var(--surface)' }}>
        <div style={{ width: 80, height: 80, borderRadius: 'var(--r-lg)', background: `linear-gradient(135deg, color-mix(in oklab, ${col} 35%, var(--surface-2)), var(--surface-2))`, border: '1px solid var(--line)', position: 'relative', overflow: 'hidden', flexShrink: 0 }}>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: col }} />
          <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: 'var(--fg-muted)', opacity: .5 }}><ChefHatIcon size={22} /></div>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          {fromName && fromKey && (
            <div className="rlf-backchip" style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, fontSize: 12, color: 'var(--fg-muted)' }}>
              <Button variant="ghost" size="sm" onClick={onBack} style={{ height: 22, padding: '0 8px', fontSize: 11 }}><ChevronLeftIcon size={11} /> Retour à {fromName}</Button>
              <span>· navigué depuis une composition</span>
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
            <TypePill kind="prep" />
            <InlineCategoryPicker value={effCat(p)} catNames={catNames} canEdit={canEdit} editor={editor} onAssign={onAssignCategory} onCreate={onCreateCategory} />
            {p.critical && <Badge tone="warning"><TriangleAlertIcon size={10} /> Critique · {usedCount} articles</Badge>}
          </div>
          <h2 style={{ fontSize: 22, fontWeight: 600, color: 'var(--fg)', margin: 0, lineHeight: 1.15 }}>{p.name}</h2>
          <div style={{ fontSize: 13, color: 'var(--fg-subtle)', marginTop: 4 }}>Préparation cuisine · rendement {p.yieldLabel}</div>
        </div>
        <DetailHeaderActions canEdit={canEdit} editor={editor} onEdit={onBack} showEdit={false} />
      </div>

      <div style={{ padding: '16px 24px 0', display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
        <DetailKpi label="Rendement" value={p.yieldLabel} />
        <DetailKpi label="Coût total" value={money(p.totalCost)} />
        <DetailKpi label={`Coût / ${p.unit || 'u'}`} value={money(p.costPerUnit)} />
        <DetailKpi label="Articles liés" value={usedCount} tone={p.critical ? 'warn' : undefined} />
        <DetailKpi label="DLC" value={p.shelfLifeHours ? `${p.shelfLifeHours} h` : '—'} />
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'grid', gridTemplateColumns: '1fr 300px', gap: 20 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg)', marginBottom: 12 }}>Ingrédients <span style={{ fontWeight: 400, fontSize: 12, color: 'var(--fg-subtle)', marginLeft: 6 }}>pour {p.yieldLabel}</span></div>
            <div style={{ border: '1px solid var(--line)', borderRadius: 'var(--r-lg)', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead><tr>{['Ingrédient', 'Quantité', 'Coût'].map((h, i) => <th key={h} style={{ textAlign: i ? 'right' : 'left', ...thStyle }}>{h}</th>)}</tr></thead>
                <tbody>
                  {ingredients.length === 0 && <tr><td colSpan={3} style={{ ...tdStyle, color: 'var(--fg-subtle)' }}>Chargement / aucun ingrédient.</td></tr>}
                  {ingredients.map((ing, i) => (
                    <tr key={i}>
                      <td style={tdStyle}>{ing.name}</td>
                      <td className="num" style={{ ...tdStyle, textAlign: 'right' }}>{ing.qty}</td>
                      <td className="num" style={{ ...tdStyle, textAlign: 'right' }}>{money(ing.cost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          {p.note && <NoteCard text={p.note} />}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <UsedByPanel usedBy={usedBy} count={usedCount} onOpenArticle={onOpenArticle} />
          <div style={{ border: '1px solid color-mix(in oklab, var(--warning-500) 30%, var(--line))', background: 'color-mix(in oklab, var(--warning-500) 4%, var(--surface))', borderRadius: 'var(--r-lg)', padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}><TriangleAlertIcon size={14} style={{ color: 'var(--warning-500)' }} /><span style={{ fontSize: 13, fontWeight: 600, color: 'var(--warning-500)' }}>Impact d'un changement</span></div>
            <p style={{ fontSize: 12, color: 'var(--fg)', lineHeight: 1.5, margin: 0 }}>Modifier cette préparation impactera <b>{usedCount} article{usedCount > 1 ? 's' : ''}</b>. Le coût de chacun sera recalculé automatiquement.</p>
          </div>
        </div>
      </div>
    </>
  );
}

function UsedByPanel({ usedBy, count, onOpenArticle }: { usedBy: UsedByEntry[]; count: number; onOpenArticle: (id: number) => void }) {
  return (
    <div style={{ border: '1px solid color-mix(in oklab, var(--brand-500) 22%, var(--line))', borderRadius: 'var(--r-lg)', overflow: 'hidden', background: 'var(--surface)' }}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid color-mix(in oklab, var(--brand-500) 22%, var(--line))', background: 'color-mix(in oklab, var(--brand-500) 4%, var(--surface))' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: 600 }}><ListIcon size={14} /> Articles liés <Badge tone="brand" style={{ marginLeft: 6 }}>{count}</Badge></div>
      </div>
      <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {usedBy.length === 0 && <div style={{ fontSize: 13, color: 'var(--fg-subtle)' }}>Pas encore utilisée dans un article.</div>}
        {usedBy.map((u) => (
          <div key={u.id} onClick={() => onOpenArticle(u.id)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 10, border: '1px solid var(--line)', borderRadius: 8, cursor: 'pointer' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 500 }}><ListIcon size={14} /> {u.name}</span>
            <span className="num" style={{ fontSize: 12, color: 'var(--fg-muted)' }}>{u.perPortion} <ChevronRightIcon size={12} style={{ verticalAlign: 'middle' }} /></span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── recipe-steps editor (FullScreenEditor) ──
function StepsEditor({ open, onOpenChange, name, method, onSave }: {
  open: boolean; onOpenChange: (o: boolean) => void; name: string; method: string[]; onSave: (m: string[]) => void | Promise<void>;
}) {
  const [draft, setDraft] = useState<string[]>(method);
  useEffect(() => { if (open) setDraft(method.length ? method : ['']); }, [open, method]);
  const set = (i: number, v: string) => setDraft((d) => d.map((s, si) => si === i ? v : s));
  const add = () => setDraft((d) => [...d, '']);
  const remove = (i: number) => setDraft((d) => d.filter((_, si) => si !== i));
  return (
    <FullScreenEditor
      open={open} onOpenChange={onOpenChange}
      title={`Méthode · ${name}`} subtitle="Étapes d'assemblage"
      saveLabel="Enregistrer" onSave={async () => { await onSave(draft.map((s) => s.trim()).filter(Boolean)); onOpenChange(false); }}
    >
      <div style={{ maxWidth: 720, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {draft.map((s, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <span className="num" style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--surface-2)', color: 'var(--fg-muted)', display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 600, flexShrink: 0, marginTop: 6 }}>{i + 1}</span>
            <textarea value={s} onChange={(e) => set(i, e.target.value)} placeholder={`Étape ${i + 1}`}
              style={{ flex: 1, minHeight: 52, padding: 8, borderRadius: 'var(--r-md)', border: '1px solid var(--line-strong)', background: 'var(--surface)', color: 'var(--fg)', font: 'inherit', fontSize: 13 }} />
            <Button variant="ghost" size="sm" icon onClick={() => remove(i)} title="Supprimer"><XIcon size={14} /></Button>
          </div>
        ))}
        <div><Button variant="secondary" size="sm" onClick={add}><PlusIcon size={14} /> Ajouter une étape</Button></div>
      </div>
    </FullScreenEditor>
  );
}

// ─── shared styles ──
const thStyle: React.CSSProperties = { fontWeight: 500, fontSize: 12, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--fg-subtle)', padding: '12px 16px', background: 'var(--surface-2)', borderBottom: '1px solid var(--line)', whiteSpace: 'nowrap' };
const tdStyle: React.CSSProperties = { padding: 16, borderBottom: '1px solid var(--line)', color: 'var(--fg)', verticalAlign: 'middle' };
const underlineTab = (on: boolean): React.CSSProperties => ({ padding: '12px 0', background: 'none', border: 'none', borderBottom: on ? '2px solid var(--brand-500)' : '2px solid transparent', marginBottom: -1, fontSize: 13, fontWeight: 500, color: on ? 'var(--fg)' : 'var(--fg-muted)', cursor: 'pointer' });
