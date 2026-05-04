'use client';

import * as React from 'react';
import { FlaskConical, Info, Package, Plus, Trash2, X } from 'lucide-react';
import { Button, Input, Select, Field } from '@/components/ds';
import {
  createPrepItem,
  setPrepIngredients,
  type PrepItem,
  type PrepIngredientInput,
  type StockItem,
  type StockUnit,
} from '@/lib/api';
import { BRUT_COLOR, PREP_COLOR } from './RecipeComposer';
import { NumberInput } from '@/components/ui/NumberInput';

const UNITS: StockUnit[] = ['kg', 'g', 'l', 'ml', 'unit', 'portion' as StockUnit];
// `portion` isn't in StockUnit but the API accepts it for preps — we cast.

interface Draft {
  id: string;
  stock_item_id: number | null;
  quantity: number;
}

interface Props {
  restaurantId: number;
  menuItemName: string;
  initialName: string;
  stockItems: StockItem[];
  onCreated: (prep: PrepItem) => void;
  onCancel: () => void;
}

/**
 * Sub-sheet for creating a Préparation inline from the recipe composer.
 * Matches the reference CreatePrepSheet. Creates the prep, sets its
 * ingredients, and returns the new prep so the caller can auto-select it.
 */
export default function CreatePrepSheet({
  restaurantId,
  menuItemName,
  initialName,
  stockItems,
  onCreated,
  onCancel,
}: Props) {
  const [name, setName] = React.useState(initialName);
  const [yieldQty, setYieldQty] = React.useState<number>(1);
  const [unit, setUnit] = React.useState<StockUnit>('kg');
  const [dlcDays, setDlcDays] = React.useState<number>(3);
  const [drafts, setDrafts] = React.useState<Draft[]>([
    { id: crypto.randomUUID(), stock_item_id: null, quantity: 0 },
  ]);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const firstInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    firstInputRef.current?.focus();
    firstInputRef.current?.select();
  }, []);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCancel();
      }
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, [onCancel]);

  const validDrafts = drafts.filter(
    (d) => d.stock_item_id !== null && d.quantity > 0,
  );

  // Live cost preview: sum of (ingredient qty × cost/unit).
  const totalCost = validDrafts.reduce((sum, d) => {
    const item = stockItems.find((s) => s.id === d.stock_item_id);
    if (!item) return sum;
    return sum + d.quantity * (item.cost_per_unit || 0);
  }, 0);
  const yieldNum = Math.max(yieldQty, 0.00001);
  const costPerUnit = totalCost / yieldNum;

  const canSubmit = name.trim().length > 0 && yieldQty > 0 && !saving;

  const addDraft = () =>
    setDrafts((d) => [...d, { id: crypto.randomUUID(), stock_item_id: null, quantity: 0 }]);

  const updateDraft = (id: string, patch: Partial<Draft>) =>
    setDrafts((arr) => arr.map((d) => (d.id === id ? { ...d, ...patch } : d)));

  const removeDraft = (id: string) =>
    setDrafts((arr) => (arr.length > 1 ? arr.filter((d) => d.id !== id) : arr));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSaving(true);
    setError(null);
    try {
      const prep = await createPrepItem(restaurantId, {
        name: name.trim(),
        unit,
        yield_per_batch: yieldQty,
        shelf_life_hours: dlcDays > 0 ? dlcDays * 24 : 0,
        is_active: true,
      });
      if (validDrafts.length > 0) {
        const payload: PrepIngredientInput[] = validDrafts.map((d) => ({
          stock_item_id: d.stock_item_id as number,
          quantity_needed: d.quantity,
        }));
        await setPrepIngredients(restaurantId, prep.id, payload);
      }
      onCreated(prep);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Création impossible.');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/45" role="dialog">
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="w-[min(720px,90%)] max-h-[85%] flex flex-col overflow-hidden rounded-r-xl bg-[var(--bg)] text-[var(--fg)] shadow-3"
        style={{ border: '1px solid var(--line)' }}
      >
        {/* Header */}
        <div className="flex items-center gap-[var(--s-3)] px-[var(--s-5)] py-[var(--s-4)] bg-[var(--surface)] border-b border-[var(--line)]">
          <span
            className="w-9 h-9 rounded-full grid place-items-center text-white shrink-0"
            style={{ background: PREP_COLOR }}
            aria-hidden
          >
            <FlaskConical className="w-4 h-4" />
          </span>
          <div className="flex-1 min-w-0">
            <div className="text-fs-md font-semibold">Nouvelle préparation</div>
            <div className="text-fs-xs text-[var(--fg-muted)]">
              Une recette fabriquée en cuisine — utilisable comme ingrédient d&apos;autres plats.
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="md"
            icon
            onClick={onCancel}
            aria-label="Fermer"
          >
            <X />
          </Button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-[var(--s-5)] space-y-[var(--s-5)]">
          {/* Basics */}
          <div className="grid gap-[var(--s-4)]" style={{ gridTemplateColumns: '2fr 1fr 1fr' }}>
            <Field label="Nom">
              <Input
                ref={firstInputRef}
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={saving}
                required
              />
            </Field>
            <Field label="Rendement">
              <div className="flex items-center gap-[var(--s-2)] px-[var(--s-3)] h-9 bg-[var(--surface)] border border-[var(--line-strong)] rounded-r-md focus-within:border-[var(--brand-500)] focus-within:shadow-ring">
                <NumberInput
                  min={0}
                  value={yieldQty}
                  onChange={setYieldQty}
                  disabled={saving}
                  className="flex-1 h-full w-0 bg-transparent border-none outline-none text-fs-sm font-mono tabular-nums"
                />
                <Select
                  value={unit}
                  onChange={(e) => setUnit(e.target.value as StockUnit)}
                  disabled={saving}
                  className="h-7 w-20 text-fs-xs border-none shadow-none bg-transparent px-0"
                >
                  {UNITS.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </Select>
              </div>
            </Field>
            <Field label="DLC">
              <div className="flex items-center gap-[var(--s-2)] px-[var(--s-3)] h-9 bg-[var(--surface)] border border-[var(--line-strong)] rounded-r-md focus-within:border-[var(--brand-500)] focus-within:shadow-ring">
                <NumberInput
                  integer
                  min={0}
                  value={dlcDays}
                  onChange={setDlcDays}
                  disabled={saving}
                  className="flex-1 h-full w-0 bg-transparent border-none outline-none text-fs-sm font-mono tabular-nums"
                />
                <span className="text-[var(--fg-muted)] text-fs-sm">jours</span>
              </div>
            </Field>
          </div>

          {/* Ingredients */}
          <div>
            <div className="flex items-center justify-between mb-[var(--s-3)]">
              <div className="text-fs-sm font-semibold">Ingrédients de la préparation</div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={addDraft}
                disabled={saving}
                className="text-[var(--brand-500)]"
              >
                <Plus />
                Ajouter
              </Button>
            </div>
            <div className="flex flex-col gap-[var(--s-2)]">
              {drafts.map((d) => {
                const picked = stockItems.find((s) => s.id === d.stock_item_id);
                return (
                  <div
                    key={d.id}
                    className="flex items-center gap-[var(--s-3)] px-[var(--s-3)] py-[var(--s-2)] rounded-r-md border border-[var(--line)] bg-[var(--surface)]"
                  >
                    <span
                      className="w-7 h-7 rounded-full grid place-items-center text-white shrink-0"
                      style={{ background: BRUT_COLOR }}
                      aria-hidden
                    >
                      <Package className="w-3 h-3" />
                    </span>
                    <Select
                      value={d.stock_item_id ?? ''}
                      onChange={(e) =>
                        updateDraft(d.id, {
                          stock_item_id: e.target.value ? Number(e.target.value) : null,
                        })
                      }
                      disabled={saving}
                      className="flex-1 min-w-0"
                    >
                      <option value="">Choisir un ingrédient brut…</option>
                      {stockItems
                        .filter((s) => s.is_active !== false)
                        .map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                    </Select>
                    <div className="flex items-center gap-[var(--s-2)] px-[var(--s-3)] h-9 w-[140px] bg-[var(--surface)] border border-[var(--line-strong)] rounded-r-md focus-within:border-[var(--brand-500)] focus-within:shadow-ring">
                      <NumberInput
                        min={0}
                        value={d.quantity}
                        onChange={(v) => updateDraft(d.id, { quantity: v })}
                        disabled={saving}
                        placeholder="0"
                        className="flex-1 h-full w-0 bg-transparent border-none outline-none text-end text-fs-sm font-mono tabular-nums placeholder:text-[var(--fg-subtle)]"
                      />
                      <span className="text-[var(--fg-muted)] text-fs-sm">
                        {picked?.unit ?? '—'}
                      </span>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      icon
                      onClick={() => removeDraft(d.id)}
                      disabled={saving || drafts.length <= 1}
                      className="text-[var(--danger-500)]"
                      aria-label="Retirer"
                    >
                      <Trash2 />
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Cost preview */}
          <div
            className="flex items-center justify-between px-[var(--s-4)] py-[var(--s-3)] rounded-r-md"
            style={{ background: 'var(--surface-2)' }}
          >
            <div>
              <div className="text-fs-xs text-[var(--fg-subtle)]">Coût de la préparation</div>
              <div
                className="text-fs-lg font-semibold font-mono tabular-nums"
                style={{ color: 'var(--brand-500)' }}
              >
                ₪{totalCost.toFixed(2)}
              </div>
            </div>
            <div className="text-end">
              <div className="text-fs-xs text-[var(--fg-subtle)]">Coût au {unit}</div>
              <div className="text-fs-lg font-semibold font-mono tabular-nums">
                ₪{costPerUnit.toFixed(2)} / {unit}
              </div>
            </div>
          </div>

          {error && (
            <div className="text-fs-xs text-[var(--danger-500)] bg-[var(--danger-50)] px-[var(--s-3)] py-[var(--s-2)] rounded-r-sm">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-[var(--s-3)] px-[var(--s-5)] py-[var(--s-4)] bg-[var(--surface)] border-t border-[var(--line)]">
          <div className="flex items-center gap-1.5 text-fs-xs text-[var(--fg-subtle)]">
            <Info className="w-3 h-3" />
            <span>
              Cette préparation sera ajoutée à <strong>{menuItemName}</strong> après création.
            </span>
          </div>
          <div className="flex items-center gap-[var(--s-2)]">
            <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={saving}>
              Annuler
            </Button>
            <Button type="submit" variant="primary" size="sm" disabled={!canSubmit}>
              {saving ? 'Création…' : 'Créer et utiliser'}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
