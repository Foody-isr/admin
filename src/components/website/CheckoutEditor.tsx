'use client';

import { useCallback, useMemo, useState } from 'react';
import {
  BUILTIN_DELIVERY_FIELDS,
  BUILTIN_PICKUP_FIELDS,
  CheckoutConfig,
  CheckoutFieldConfig,
  CheckoutFieldType,
  CheckoutFormConfig,
  CheckoutVisibilityOperator,
  ConfirmationConfig,
  legacyCheckoutForm,
} from '@/lib/api';
import ConfirmationEditor from './ConfirmationEditor';

type OrderTypeKey = 'delivery' | 'pickup';
export type CheckoutSubTab = OrderTypeKey | 'confirmation';

// Default label strings for built-in fields. Owners can override per-language.
const BUILTIN_LABELS: Record<string, { en: string; fr: string; he: string }> = {
  customer_first_name: { en: 'First name',     fr: 'Prénom',            he: 'שם פרטי' },
  customer_name:    { en: 'Full name',         fr: 'Nom complet',       he: 'שם מלא' },
  customer_phone:   { en: 'Phone number',      fr: 'Téléphone',         he: 'טלפון' },
  delivery_address: { en: 'Delivery address',  fr: 'Adresse de livraison', he: 'כתובת למשלוח' },
  delivery_city:    { en: 'City',              fr: 'Ville',             he: 'עיר' },
  delivery_floor:   { en: 'Floor',             fr: 'Étage',             he: 'קומה' },
  delivery_apt:     { en: 'Apartment / unit',  fr: 'Appartement',       he: 'דירה' },
  delivery_entry_code: { en: 'Building code',  fr: 'Code immeuble',     he: 'קוד כניסה' },
  delivery_notes:   { en: 'Delivery notes',    fr: 'Notes de livraison', he: 'הערות למשלוח' },
  pickup_notes:     { en: 'Notes',             fr: 'Notes',             he: 'הערות' },
  whatsapp_number:  { en: 'WhatsApp number',   fr: 'Numéro WhatsApp',   he: 'מספר וואטסאפ' },
};

const FIELD_TYPE_OPTIONS: Array<{ value: CheckoutFieldType; label: string }> = [
  { value: 'text',     label: 'Texte court' },
  { value: 'textarea', label: 'Texte long' },
  { value: 'tel',      label: 'Téléphone' },
  { value: 'email',    label: 'E-mail' },
  { value: 'select',   label: 'Liste déroulante' },
  { value: 'checkbox', label: 'Case à cocher' },
];

const OPERATOR_OPTIONS: Array<{ value: CheckoutVisibilityOperator; label: string }> = [
  { value: 'not_empty', label: 'a une valeur' },
  { value: 'equals',    label: 'est égal à' },
  { value: 'one_of',    label: 'fait partie de' },
];

function builtinLabel(id: string): string {
  return BUILTIN_LABELS[id]?.fr ?? id;
}

function fieldDisplayLabel(field: CheckoutFieldConfig): string {
  if (field.label?.fr) return field.label.fr;
  if (field.label?.en) return field.label.en;
  if (field.kind === 'builtin') return builtinLabel(field.id);
  return field.id;
}

function newCustomFieldId(existing: ReadonlyArray<CheckoutFieldConfig>): string {
  for (let i = 1; i < 100; i++) {
    const id = `custom_field_${i}`;
    if (!existing.some((f) => f.id === id)) return id;
  }
  return `custom_field_${Date.now()}`;
}

function uniqueFieldId(base: string, existing: ReadonlyArray<CheckoutFieldConfig>): string {
  let candidate = base;
  let n = 2;
  while (existing.some((f) => f.id === candidate)) {
    candidate = `${base}_${n++}`;
  }
  return candidate;
}

// Pick a sensible default for a new form when an order type is missing from the
// stored config. Mirrors legacyCheckoutForm so the editor starts from what
// guests currently see, not an empty list.
function defaultForm(orderType: OrderTypeKey): CheckoutFormConfig {
  return legacyCheckoutForm(orderType);
}

interface CheckoutEditorProps {
  value: CheckoutConfig | null | undefined;
  onChange: (next: CheckoutConfig) => void;
  placesAvailable: boolean;
  subTab: CheckoutSubTab;
  onSubTabChange: (next: CheckoutSubTab) => void;
}

/**
 * CheckoutEditor renders the foodyadmin Checkout tab.
 *
 * Layout: a single scrollable column with delivery/pickup sub-tabs at the top.
 * Each sub-tab shows OTP toggle, autocomplete toggle (delivery only), and a
 * reorderable list of fields. Selecting a field opens its property panel
 * inline beneath the row so the editor fits in the existing left-rail width.
 *
 * orderType is controlled by the page so the live preview iframe can stay in
 * sync with the sub-tab the owner is editing.
 */
export default function CheckoutEditor({ value, onChange, placesAvailable, subTab, onSubTabChange }: CheckoutEditorProps) {
  const [expandedFieldId, setExpandedFieldId] = useState<string | null>(null);
  const orderType: OrderTypeKey = subTab === 'pickup' ? 'pickup' : 'delivery';

  const form = useMemo<CheckoutFormConfig>(() => {
    const fromValue = orderType === 'delivery' ? value?.delivery : value?.pickup;
    return fromValue ?? defaultForm(orderType);
  }, [orderType, value]);

  const updateConfirmation = useCallback((next: ConfirmationConfig) => {
    onChange({ ...(value ?? {}), confirmation: next });
  }, [value, onChange]);

  // Materialise a config write. Calling this for the first time replaces
  // null/undefined with a structured CheckoutConfig — that is the moment the
  // restaurant opts in to the builder (legacy fallback no longer applies).
  const writeForm = useCallback((next: CheckoutFormConfig) => {
    const base: CheckoutConfig = { ...(value ?? {}) };
    if (orderType === 'delivery') base.delivery = next;
    else base.pickup = next;
    onChange(base);
  }, [orderType, value, onChange]);

  const setRequireAuth = useCallback((b: boolean) => {
    writeForm({ ...form, require_auth: b });
  }, [form, writeForm]);

  const setAutocomplete = useCallback((b: boolean) => {
    writeForm({ ...form, address_autocomplete: b });
  }, [form, writeForm]);

  const updateField = useCallback((idx: number, patch: Partial<CheckoutFieldConfig>) => {
    const next = form.fields.slice();
    next[idx] = { ...next[idx], ...patch };
    writeForm({ ...form, fields: next });
  }, [form, writeForm]);

  const moveField = useCallback((idx: number, dir: -1 | 1) => {
    const j = idx + dir;
    if (j < 0 || j >= form.fields.length) return;
    const next = form.fields.slice();
    [next[idx], next[j]] = [next[j], next[idx]];
    writeForm({ ...form, fields: next });
  }, [form, writeForm]);

  const removeField = useCallback((idx: number) => {
    const field = form.fields[idx];
    if (field.kind === 'builtin') return; // safety: built-ins are disabled, not removed
    const next = form.fields.slice();
    next.splice(idx, 1);
    writeForm({ ...form, fields: next });
    if (expandedFieldId === field.id) setExpandedFieldId(null);
  }, [form, writeForm, expandedFieldId]);

  const addCustomField = useCallback(() => {
    const id = uniqueFieldId(newCustomFieldId(form.fields), form.fields);
    const next: CheckoutFieldConfig = {
      id,
      kind: 'custom',
      type: 'text',
      enabled: true,
      required: false,
      label: { fr: 'Nouveau champ' },
    };
    writeForm({ ...form, fields: [...form.fields, next] });
    setExpandedFieldId(id);
  }, [form, writeForm]);

  const addBuiltinField = useCallback((builtinId: string, fieldType: CheckoutFieldType) => {
    const next: CheckoutFieldConfig = {
      id: builtinId,
      kind: 'builtin',
      enabled: true,
      required: false,
    };
    writeForm({ ...form, fields: [...form.fields, next] });
    setExpandedFieldId(builtinId);
    void fieldType;
  }, [form, writeForm]);

  const enabledIdsBefore = useCallback((idx: number) => {
    return form.fields.slice(0, idx).filter((f) => f.enabled).map((f) => f.id);
  }, [form.fields]);

  const builtinCatalogue = orderType === 'delivery' ? BUILTIN_DELIVERY_FIELDS : BUILTIN_PICKUP_FIELDS;
  const usedBuiltinIds = new Set(form.fields.filter((f) => f.kind === 'builtin').map((f) => f.id));
  const missingBuiltins = builtinCatalogue.filter((b) => !usedBuiltinIds.has(b.id));

  return (
    <div className="flex flex-col h-full">
      {/* Sub-tabs: Livraison · Retrait · Confirmation */}
      <div className="px-4 pt-4">
        <div className="flex p-1 rounded-xl text-[13px]" style={{ background: 'var(--surface-subtle)' }}>
          {(['delivery', 'pickup', 'confirmation'] as CheckoutSubTab[]).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => { onSubTabChange(k); setExpandedFieldId(null); }}
              className={`flex-1 py-1.5 rounded-lg font-medium transition ${
                subTab === k ? 'text-fg-primary shadow-sm' : 'text-fg-secondary hover:text-fg-primary'
              }`}
              style={subTab === k ? { background: 'var(--surface)' } : undefined}
            >
              {k === 'delivery' ? 'Livraison' : k === 'pickup' ? 'Retrait' : 'Confirmation'}
            </button>
          ))}
        </div>
      </div>

      {/* Global checkout behaviour — applies to all order types. When on, the
          guest order page's fulfilment chip is read-only (no "Modifier" button
          or arrow) and the customer picks pickup vs delivery only here at
          checkout. Takes effect after Publier. */}
      <div className="px-4 pt-4">
        <Row
          title="Choix du mode au paiement uniquement"
          description="Sur la page du menu, le sélecteur (à emporter / livraison) devient non cliquable, sans bouton Modifier. Le client choisit son mode à l'étape paiement."
        >
          <Toggle
            checked={!!value?.lock_order_type}
            onChange={(b) => onChange({ ...(value ?? {}), lock_order_type: b })}
          />
        </Row>
      </div>

      {subTab === 'confirmation' ? (
        <div className="flex-1 overflow-y-auto">
          <ConfirmationEditor
            value={value?.confirmation ?? null}
            onChange={updateConfirmation}
          />
        </div>
      ) : (
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6">
        <section className="space-y-3">
          <Row
            title="Vérification par OTP"
            description="Demander un code SMS avant de finaliser la commande."
          >
            <Toggle checked={form.require_auth} onChange={setRequireAuth} />
          </Row>

          {orderType === 'delivery' && (
            <Row
              title="Autocomplétion d'adresse"
              description={placesAvailable
                ? 'Suggère des adresses via Google Places et remplit la ville.'
                : 'Indisponible — clé Google Places non configurée.'}
              disabled={!placesAvailable}
            >
              <Toggle
                checked={!!form.address_autocomplete}
                onChange={setAutocomplete}
                disabled={!placesAvailable}
              />
            </Row>
          )}
        </section>

        <section>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-[11px] uppercase tracking-[0.12em] text-fg-secondary font-semibold">
              Champs du formulaire
            </h3>
            <button
              type="button"
              onClick={addCustomField}
              className="text-[12px] text-brand-500 hover:text-brand-600 font-medium"
            >
              + Champ personnalisé
            </button>
          </div>

          <ul className="space-y-1.5">
            {form.fields.map((field, idx) => {
              const expanded = expandedFieldId === field.id;
              return (
                <li
                  key={field.id}
                  className="rounded-lg border"
                  style={{ borderColor: 'var(--divider)', background: 'var(--surface)' }}
                >
                  <div className="flex items-center gap-2 px-3 py-2">
                    <div className="flex flex-col">
                      <button
                        type="button"
                        onClick={() => moveField(idx, -1)}
                        disabled={idx === 0}
                        className="w-5 h-3 text-fg-secondary hover:text-fg-primary disabled:opacity-30 leading-none"
                        title="Monter"
                      >▲</button>
                      <button
                        type="button"
                        onClick={() => moveField(idx, 1)}
                        disabled={idx === form.fields.length - 1}
                        className="w-5 h-3 text-fg-secondary hover:text-fg-primary disabled:opacity-30 leading-none"
                        title="Descendre"
                      >▼</button>
                    </div>
                    <button
                      type="button"
                      onClick={() => setExpandedFieldId(expanded ? null : field.id)}
                      className="flex-1 text-left text-[13px] text-fg-primary truncate"
                    >
                      {fieldDisplayLabel(field)}
                      <span className="ml-2 text-[10px] text-fg-secondary uppercase tracking-wide">
                        {field.kind === 'builtin' ? 'intégré' : 'personnalisé'}
                      </span>
                      {field.required && (
                        <span className="ml-2 text-[10px] text-amber-600 font-semibold">*</span>
                      )}
                      {field.visible_when && (
                        <span className="ml-2 text-[10px] text-fg-secondary">conditionnel</span>
                      )}
                    </button>
                    <Toggle
                      checked={field.enabled}
                      onChange={(b) => updateField(idx, { enabled: b })}
                      title={field.enabled ? 'Désactiver' : 'Activer'}
                    />
                    {field.kind === 'custom' && (
                      <button
                        type="button"
                        onClick={() => removeField(idx)}
                        className="w-6 h-6 text-fg-secondary hover:text-red-500"
                        title="Supprimer"
                      >×</button>
                    )}
                  </div>

                  {expanded && (
                    <FieldEditor
                      field={field}
                      orderType={orderType}
                      earlierFieldIds={enabledIdsBefore(idx)}
                      onChange={(patch) => updateField(idx, patch)}
                    />
                  )}
                </li>
              );
            })}
          </ul>

          {missingBuiltins.length > 0 && (
            <div className="mt-3 p-3 rounded-lg" style={{ background: 'var(--surface-subtle)' }}>
              <p className="text-[11px] uppercase tracking-[0.12em] text-fg-secondary mb-2 font-semibold">
                Ajouter un champ intégré
              </p>
              <div className="flex flex-wrap gap-1.5">
                {missingBuiltins.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => addBuiltinField(b.id, b.type)}
                    className="text-[12px] px-2.5 py-1 rounded-md border text-fg-primary hover:bg-surface-subtle"
                    style={{ borderColor: 'var(--divider)' }}
                  >
                    + {builtinLabel(b.id)}
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>

        <p className="text-[11px] text-fg-secondary leading-relaxed">
          {value ? null : (
            <>Les valeurs affichées sont celles du flux par défaut. Vos modifications ne seront enregistrées qu&apos;après publication.</>
          )}
        </p>
      </div>
      )}
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────

function Row({
  title, description, disabled, children,
}: { title: string; description?: string; disabled?: boolean; children: React.ReactNode }) {
  return (
    <div
      className="flex items-start justify-between gap-3 p-3 rounded-lg"
      style={{ background: 'var(--surface-subtle)', opacity: disabled ? 0.55 : 1 }}
    >
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-medium text-fg-primary">{title}</p>
        {description && <p className="text-[11px] text-fg-secondary mt-0.5">{description}</p>}
      </div>
      {children}
    </div>
  );
}

function Toggle({
  checked, onChange, disabled, title,
}: { checked: boolean; onChange: (b: boolean) => void; disabled?: boolean; title?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      title={title}
      className={`relative w-9 h-5 rounded-full transition flex-shrink-0 ${
        checked ? 'bg-brand-500' : 'bg-divider'
      } ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
      style={!checked ? { background: 'var(--divider)' } : undefined}
    >
      <span
        className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform"
        style={{ transform: checked ? 'translateX(18px)' : 'translateX(2px)' }}
      />
    </button>
  );
}

function FieldEditor({
  field, orderType, earlierFieldIds, onChange,
}: {
  field: CheckoutFieldConfig;
  orderType: OrderTypeKey;
  earlierFieldIds: string[];
  onChange: (patch: Partial<CheckoutFieldConfig>) => void;
}) {
  const labelFr = field.label?.fr ?? '';
  const placeholderFr = field.placeholder?.fr ?? '';
  const isCustom = field.kind === 'custom';

  void orderType;

  return (
    <div className="px-3 pb-3 pt-1 space-y-3 border-t" style={{ borderColor: 'var(--divider)' }}>
      <FormRow label="Libellé">
        <input
          type="text"
          value={labelFr}
          onChange={(e) => onChange({ label: { ...(field.label ?? {}), fr: e.target.value } })}
          placeholder={field.kind === 'builtin' ? builtinLabel(field.id) : 'Nom du champ'}
          className="admin-input"
        />
      </FormRow>

      <FormRow label="Indication (placeholder)">
        <input
          type="text"
          value={placeholderFr}
          onChange={(e) => onChange({ placeholder: { ...(field.placeholder ?? {}), fr: e.target.value } })}
          placeholder="Ex. 50-123-4567"
          className="admin-input"
        />
      </FormRow>

      {isCustom && (
        <>
          <FormRow label="Identifiant">
            <input
              type="text"
              value={field.id}
              onChange={(e) => {
                const v = e.target.value
                  .toLowerCase()
                  .replace(/[^a-z0-9_]/g, '_')
                  .replace(/^[^a-z]+/, '');
                onChange({ id: v });
              }}
              className="admin-input font-mono"
            />
            <p className="text-[10px] text-fg-secondary mt-1">
              Clef interne, lettres minuscules, chiffres et underscores. Apparaît dans la commande au POS.
            </p>
          </FormRow>

          <FormRow label="Type de champ">
            <select
              value={field.type ?? 'text'}
              onChange={(e) => onChange({ type: e.target.value as CheckoutFieldType })}
              className="admin-input"
            >
              {FIELD_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </FormRow>

          {field.type === 'select' && (
            <FormRow label="Options (une par ligne)">
              <textarea
                value={(field.options ?? []).map((o) => o.value).join('\n')}
                onChange={(e) => {
                  const values = e.target.value.split('\n').map((s) => s.trim()).filter(Boolean);
                  onChange({ options: values.map((v) => ({ value: v })) });
                }}
                rows={3}
                className="admin-input"
              />
            </FormRow>
          )}
        </>
      )}

      <div className="flex items-center justify-between p-2 rounded-md" style={{ background: 'var(--surface-subtle)' }}>
        <span className="text-[12px] text-fg-primary">Champ obligatoire</span>
        <Toggle checked={field.required} onChange={(b) => onChange({ required: b })} />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[12px] text-fg-primary">N&apos;afficher que sous condition</span>
          <Toggle
            checked={!!field.visible_when}
            onChange={(b) => {
              if (!b) onChange({ visible_when: null });
              else if (earlierFieldIds.length > 0) {
                onChange({
                  visible_when: { field: earlierFieldIds[0], operator: 'not_empty' },
                });
              }
            }}
            disabled={earlierFieldIds.length === 0}
          />
        </div>
        {field.visible_when && (
          <div className="grid grid-cols-1 gap-2 p-2 rounded-md" style={{ background: 'var(--surface-subtle)' }}>
            <select
              value={field.visible_when.field}
              onChange={(e) => onChange({
                visible_when: { ...(field.visible_when as NonNullable<typeof field.visible_when>), field: e.target.value },
              })}
              className="admin-input"
            >
              {earlierFieldIds.map((id) => (
                <option key={id} value={id}>{builtinLabel(id) || id}</option>
              ))}
            </select>
            <select
              value={field.visible_when.operator}
              onChange={(e) => onChange({
                visible_when: { ...(field.visible_when as NonNullable<typeof field.visible_when>), operator: e.target.value as CheckoutVisibilityOperator },
              })}
              className="admin-input"
            >
              {OPERATOR_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            {field.visible_when.operator === 'equals' && (
              <input
                type="text"
                value={String(field.visible_when.value ?? '')}
                onChange={(e) => onChange({
                  visible_when: { ...(field.visible_when as NonNullable<typeof field.visible_when>), value: e.target.value },
                })}
                placeholder="Valeur"
                className="admin-input"
              />
            )}
            {field.visible_when.operator === 'one_of' && (
              <input
                type="text"
                value={(field.visible_when.values ?? []).join(', ')}
                onChange={(e) => onChange({
                  visible_when: {
                    ...(field.visible_when as NonNullable<typeof field.visible_when>),
                    values: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
                  },
                })}
                placeholder="Ex. coffret, basique, prestige"
                className="admin-input"
              />
            )}
          </div>
        )}
        {earlierFieldIds.length === 0 && (
          <p className="text-[10px] text-fg-secondary">
            Ajoutez d&apos;autres champs avant celui-ci pour pouvoir le conditionner.
          </p>
        )}
      </div>
    </div>
  );
}

function FormRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[10px] uppercase tracking-[0.12em] text-fg-secondary mb-1 font-semibold">
        {label}
      </span>
      {children}
    </label>
  );
}
