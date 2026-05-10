'use client';

import * as React from 'react';
import { Info, Package, X } from 'lucide-react';
import { Button, Input, Select, Field } from '@/components/ds';
import { createStockItem, type StockItem, type StockUnit } from '@/lib/api';
import { BRUT_COLOR } from './RecipeComposer';
import { NumberInput } from '@/components/ui/NumberInput';

const UNITS: StockUnit[] = ['kg', 'g', 'l', 'ml', 'unit', 'pack', 'box', 'bag', 'dose', 'other'];

interface Props {
  restaurantId: number;
  itemName: string;
  initialName: string;
  onCreated: (item: StockItem) => void;
  onCancel: () => void;
}

/**
 * Sub-sheet for creating an Ingrédient brut inline from the recipe composer.
 * Overlays the recipe tab (absolute, inset-0, z-20). Caller is responsible
 * for rendering this inside a relative container that bounds it.
 */
export default function CreateStockSheet({
  restaurantId,
  itemName,
  initialName,
  onCreated,
  onCancel,
}: Props) {
  const [name, setName] = React.useState(initialName);
  const [unit, setUnit] = React.useState<StockUnit>('kg');
  const [cost, setCost] = React.useState<number>(0);
  const [category, setCategory] = React.useState('');
  const [supplier, setSupplier] = React.useState('');
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

  const canSubmit = name.trim().length > 0 && !saving;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSaving(true);
    setError(null);
    try {
      const created = await createStockItem(restaurantId, {
        name: name.trim(),
        unit,
        cost_per_unit: cost,
        category: category.trim(),
        supplier: supplier.trim(),
        is_active: true,
      });
      onCreated(created);
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
        className="w-[min(560px,90%)] max-h-[85%] flex flex-col overflow-hidden rounded-r-xl bg-[var(--bg)] text-[var(--fg)] shadow-3"
        style={{ border: '1px solid var(--line)' }}
      >
        {/* Header */}
        <div className="flex items-center gap-[var(--s-3)] px-[var(--s-5)] py-[var(--s-4)] bg-[var(--surface)] border-b border-[var(--line)]">
          <span
            className="w-9 h-9 rounded-full grid place-items-center text-white shrink-0"
            style={{ background: BRUT_COLOR }}
            aria-hidden
          >
            <Package className="w-4 h-4" />
          </span>
          <div className="flex-1 min-w-0">
            <div className="text-fs-md font-semibold">Nouvel ingrédient brut</div>
            <div className="text-fs-xs text-[var(--fg-muted)]">
              Un produit acheté tel quel chez votre fournisseur.
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
        <div className="flex-1 overflow-y-auto p-[var(--s-5)] space-y-[var(--s-4)]">
          <Field label="Nom">
            <Input
              ref={firstInputRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={saving}
              required
            />
          </Field>

          <div className="grid grid-cols-2 gap-[var(--s-4)]">
            <Field label="Unité de stock">
              <Select
                value={unit}
                onChange={(e) => setUnit(e.target.value as StockUnit)}
                disabled={saving}
              >
                {UNITS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={`Coût par ${unit}`}>
              <div className="flex items-center gap-[var(--s-2)] px-[var(--s-3)] h-9 bg-[var(--surface)] border border-[var(--line-strong)] rounded-r-md focus-within:border-[var(--brand-500)] focus-within:shadow-ring">
                <span className="text-[var(--fg-subtle)] text-fs-sm">₪</span>
                <NumberInput
                  min={0}
                  value={cost}
                  onChange={setCost}
                  disabled={saving}
                  placeholder="0.00"
                  className="flex-1 h-full bg-transparent border-none outline-none text-fs-sm font-mono tabular-nums placeholder:text-[var(--fg-subtle)]"
                />
              </div>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-[var(--s-4)]">
            <Field label="Catégorie">
              <Input
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                disabled={saving}
                placeholder="Facultatif"
              />
            </Field>
            <Field label="Fournisseur">
              <Input
                value={supplier}
                onChange={(e) => setSupplier(e.target.value)}
                disabled={saving}
                placeholder="Facultatif"
              />
            </Field>
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
              Cet ingrédient sera ajouté à <strong>{itemName}</strong> après création.
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
