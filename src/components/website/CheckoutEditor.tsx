'use client';

import { useI18n } from '@/lib/i18n';
import { useCallback, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ChevronDown, Plus, Trash2 } from 'lucide-react';
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
import {
  detectFieldConflict,
  asBuiltinField,
  builtinLabel,
  type FieldConflict,
} from '@/lib/website/checkout-field-conflicts';
import ConfirmationEditor from './ConfirmationEditor';

type OrderTypeKey = 'delivery' | 'pickup';
export type CheckoutSubTab = OrderTypeKey | 'confirmation';

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

function fieldDisplayLabel(field: CheckoutFieldConfig, locale: 'en' | 'fr' | 'he'): string {
  return field.label?.[locale] || field.label?.en || field.label?.fr || field.label?.he ||
    (field.kind === 'builtin' ? builtinLabel(field.id, locale) : field.id);
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
  /** The V3 journey panel owns screen navigation and fulfillment rules. */
  embedded?: boolean;
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
export default function CheckoutEditor({ value, onChange, placesAvailable, subTab, onSubTabChange, embedded = false }: CheckoutEditorProps) {
  const { t, locale } = useI18n();
  const [expandedFieldId, setExpandedFieldId] = useState<string | null>(null);
  const orderType: OrderTypeKey = subTab === 'pickup' ? 'pickup' : 'delivery';

  const form = useMemo<CheckoutFormConfig>(() => {
    const fromValue = orderType === 'delivery' ? value?.delivery : value?.pickup;
    const stored = fromValue ?? defaultForm(orderType);
    // The guest checkout always requires a phone. Older drafts could still
    // store it as hidden or optional; present the effective policy here too.
    const phone = { id: 'customer_phone', kind: 'builtin' as const, enabled: true, required: true };
    const fields = stored.fields.some(field => field.id === phone.id)
      ? stored.fields.map(field => field.id === phone.id
        ? { ...field, enabled: true, required: true, visible_when: undefined }
        : field)
      : [...stored.fields, phone];
    return { ...stored, fields };
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
    const fields: CheckoutFieldConfig[] = b ? form.fields.map(field => field.id === 'delivery_address'
      ? { ...field, enabled: true, required: true, visible_when: undefined }
      : field) : form.fields;
    if (b && !fields.some(field => field.id === "delivery_address")) {
      fields.push({ id: "delivery_address", kind: "builtin", enabled: true, required: true });
    }
    writeForm({ ...form, fields, address_autocomplete: b });
  }, [form, writeForm]);

  const updateField = useCallback((idx: number, patch: Partial<CheckoutFieldConfig>) => {
    const next = form.fields.slice();
    const previous = next[idx];
    next[idx] = { ...previous, ...patch };
    if (patch.id !== undefined && patch.id !== previous.id) {
      setExpandedFieldId(patch.id);
      for (let i = idx + 1; i < next.length; i++) {
        const rule = next[i].visible_when;
        if (rule?.field === previous.id) next[i] = { ...next[i], visible_when: { ...rule, field: patch.id } };
      }
    }
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
      label: { [locale]: t('editorCheckoutNewField') },
    };
    writeForm({ ...form, fields: [...form.fields, next] });
    setExpandedFieldId(id);
  }, [form, writeForm, locale, t]);

  const addBuiltinField = useCallback((builtinId: string) => {
    const next: CheckoutFieldConfig = {
      id: builtinId,
      kind: 'builtin',
      enabled: true,
      required: false,
    };
    writeForm({ ...form, fields: [...form.fields, next] });
    setExpandedFieldId(builtinId);
  }, [form, writeForm]);

  // Rewrite a custom field as the built-in it was imitating, in place, so it
  // keeps its position in the form the owner arranged.
  const replaceWithBuiltin = useCallback((idx: number, builtinId: string) => {
    const next = form.fields.slice();
    next[idx] = asBuiltinField(next[idx], builtinId);
    writeForm({ ...form, fields: next });
    setExpandedFieldId(builtinId);
  }, [form, writeForm]);

  const enabledIdsBefore = useCallback((idx: number) => {
    return form.fields.slice(0, idx).filter((f) => f.enabled).map((f) => f.id);
  }, [form.fields]);

  const builtinCatalogue = orderType === 'delivery' ? BUILTIN_DELIVERY_FIELDS : BUILTIN_PICKUP_FIELDS;
  const usedBuiltinIds = new Set(form.fields.filter((f) => f.kind === 'builtin').map((f) => f.id));
  const missingBuiltins = builtinCatalogue.filter((b) => !usedBuiltinIds.has(b.id));

  // One conflict slot per field, positional rather than keyed by id — two
  // fields sharing an id is itself one of the conflicts.
  const builtinIds = useMemo(() => builtinCatalogue.map((b) => b.id), [builtinCatalogue]);
  const conflicts = useMemo(
    () => form.fields.map((f) => detectFieldConflict(f, form.fields, builtinIds)),
    [form.fields, builtinIds],
  );

  return (
    <div className="flex flex-col h-full">
      {!embedded && <>
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

      </>}
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
            title={t('editorCheckoutOtp')}
            description={t('editorCheckoutOtpHint')}
          >
            <Toggle title={t('editorCheckoutOtp')} checked={form.require_auth} onChange={setRequireAuth} />
          </Row>

          {orderType === 'delivery' && (
            <Row
              title={t("addressAutocompleteTitle")}
              description={placesAvailable
                ? t('addressAutocompleteDescription')
                : t('addressAutocompleteUnavailable')}
              disabled={!placesAvailable && !form.address_autocomplete}
            >
              <Toggle
                title={t("addressAutocompleteTitle")}
                checked={!!form.address_autocomplete}
                onChange={setAutocomplete}
                disabled={!placesAvailable && !form.address_autocomplete}
              />
            </Row>
          )}
        </section>

        <section className="sqe-checkout-fields">
          <div className="sqe-checkout-fields-heading">
            <h3>{t('editorCheckoutFields')}</h3>
            <button type="button" className="sqe-checkout-add" onClick={addCustomField}>
              <Plus size={16} aria-hidden="true" />{t('editorCheckoutAddCustom')}
            </button>
          </div>

          <ul className="sqe-checkout-field-list">
            {form.fields.map((field, idx) => {
              const expanded = expandedFieldId === field.id;
              const conflict = conflicts[idx];
              const phone = field.id === 'customer_phone';
              const verifiedAddress = field.id === 'delivery_address' && !!form.address_autocomplete;
              const locked = phone || verifiedAddress;
              const label = fieldDisplayLabel(field, locale);
              const status = !field.enabled ? t('editorCheckoutHidden') : field.required ? t('editorCheckoutRequired') : t('editorCheckoutOptional');
              return (
                <li key={idx} data-checkout-field={field.id}>
                  <div className="sqe-checkout-field-row">
                    <button type="button" className="sqe-checkout-field-details" aria-expanded={expanded}
                      onClick={() => setExpandedFieldId(expanded ? null : field.id)}>
                      <ChevronDown size={16} aria-hidden="true" />
                      <span>
                        <strong>{label}</strong>
                        <small>
                          {status}
                          {field.visible_when && ` · ${t('editorCheckoutConditional')}`}
                          {conflict && <span className="text-amber-700"> · {conflictTitle(conflict)}</span>}
                        </small>
                      </span>
                    </button>
                    {!locked && <Toggle title={`${t('editorCheckoutShowField')} : ${label}`}
                      checked={field.enabled} onChange={enabled => updateField(idx, { enabled })} />}
                  </div>

                  {expanded && (
                    <FieldEditor
                      field={field}
                      lockedReason={phone ? t('editorCheckoutPhoneRequired') : verifiedAddress ? t('editorCheckoutAddressRequired') : undefined}
                      earlierFieldIds={enabledIdsBefore(idx)}
                      conflict={conflict}
                      onChange={(patch) => updateField(idx, patch)}
                      onUseBuiltin={(builtinId) => replaceWithBuiltin(idx, builtinId)}
                      onRemove={() => removeField(idx)}
                      fieldActions={<>
                        <button type="button" aria-label={t('editorCheckoutMoveUp')} disabled={idx === 0} onClick={() => moveField(idx, -1)}>
                          <ArrowUp size={16} aria-hidden="true" />
                        </button>
                        <button type="button" aria-label={t('editorCheckoutMoveDown')} disabled={idx === form.fields.length - 1} onClick={() => moveField(idx, 1)}>
                          <ArrowDown size={16} aria-hidden="true" />
                        </button>
                        {field.kind === 'custom' && <button type="button" aria-label={t('editorCheckoutRemove')} onClick={() => removeField(idx)}>
                          <Trash2 size={16} aria-hidden="true" />
                        </button>}
                      </>}
                    />
                  )}
                </li>
              );
            })}
          </ul>

          {missingBuiltins.length > 0 && (
            <div className="sqe-checkout-builtins">
              <p>{t('editorCheckoutAddBuiltin')}</p>
              <div className="flex flex-wrap gap-2">
                {missingBuiltins.map((b) => (
                  <button key={b.id} type="button" className="sqe-checkout-add" onClick={() => addBuiltinField(b.id)}>
                    <Plus size={14} aria-hidden="true" />{builtinLabel(b.id, locale)}
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>
      )}
    </div>
  );
}

// ─── Field conflicts ────────────────────────────────────────────────────
//
// The whole point is the ACTION. A warning the owner cannot act on is a
// warning they learn to scroll past; every case below except the duplicate id
// resolves in one click, and the duplicate id is fixed by typing.

function conflictTitle(c: FieldConflict): string {
  if (c.kind === 'duplicate_id') return 'Identifiant en double';
  if (c.kind === 'reserved_id') return 'Identifiant réservé';
  return c.builtinAlreadyInForm ? 'Ce champ fait doublon' : 'Un champ intégré fait déjà ça';
}

function ConflictCallout({
  conflict, fieldId, onUseBuiltin, onRemove,
}: {
  conflict: FieldConflict;
  fieldId: string;
  onUseBuiltin: (builtinId: string) => void;
  onRemove: () => void;
}) {
  const name = conflict.builtinId ? builtinLabel(conflict.builtinId) : '';

  let body: string;
  let action: { label: string; run: () => void } | null = null;

  if (conflict.kind === 'duplicate_id') {
    body = `Un autre champ porte déjà l'identifiant « ${fieldId} ». Une seule des deux réponses sera enregistrée. Renommez-en un.`;
  } else if (conflict.kind === 'reserved_id') {
    // This one already works — foodyweb routes by id, so the answer does reach
    // the typed column. It is declared wrong, not wired wrong.
    body = `« ${fieldId} » est l'identifiant du champ intégré ${name}. La réponse arrive au bon endroit, mais le champ est déclaré comme personnalisé.`;
    action = conflict.builtinAlreadyInForm
      ? { label: 'Supprimer ce champ', run: onRemove }
      : { label: 'Convertir en champ intégré', run: () => onUseBuiltin(conflict.builtinId) };
  } else if (conflict.builtinAlreadyInForm) {
    body = `Le champ intégré ${name} est déjà dans ce formulaire. Le client verra la même question deux fois.`;
    action = { label: 'Supprimer ce champ', run: onRemove };
  } else {
    // The case this guard was built for.
    body = `${name} existe comme champ intégré. Lui seul alimente l'adresse de livraison, le répartiteur, la fiche client et le récap WhatsApp. Un champ personnalisé reste isolé dans la commande.`;
    action = { label: 'Remplacer par le champ intégré', run: () => onUseBuiltin(conflict.builtinId) };
  }

  return (
    <div
      className="p-2.5 rounded-md space-y-2"
      style={{
        background: 'color-mix(in oklab, var(--warning-500) 10%, var(--surface))',
        border: '1px solid color-mix(in oklab, var(--warning-500) 30%, var(--divider))',
      }}
    >
      <p className="text-[12px] font-medium text-fg-primary">{conflictTitle(conflict)}</p>
      <p className="text-[11px] text-fg-secondary leading-relaxed">{body}</p>
      {action && (
        <>
          <button
            type="button"
            onClick={action.run}
            className="text-[12px] px-2.5 py-1 rounded-md border text-fg-primary hover:bg-surface-subtle"
            style={{ borderColor: 'var(--divider)', background: 'var(--surface)' }}
          >
            {action.label}
          </button>
          {/* Said out loud because it is the obvious wrong assumption: this
              changes the form, not the orders already taken. */}
          <p className="text-[10px] text-fg-secondary">
            Les commandes déjà passées gardent l&apos;ancien champ.
          </p>
        </>
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
    <input className="sqe-checkout-switch" type="checkbox" role="switch"
      aria-label={title} checked={checked} disabled={disabled}
      onChange={event => onChange(event.target.checked)} />
  );
}

function FieldEditor({
  field, lockedReason, earlierFieldIds, conflict, onChange, onUseBuiltin, onRemove, fieldActions,
}: {
  field: CheckoutFieldConfig;
  lockedReason?: string;
  fieldActions: React.ReactNode;
  earlierFieldIds: string[];
  /** Set when this field duplicates or shadows another. See
   *  lib/website/checkout-field-conflicts.ts for what each kind means. */
  conflict: FieldConflict | null;
  onChange: (patch: Partial<CheckoutFieldConfig>) => void;
  onUseBuiltin: (builtinId: string) => void;
  onRemove: () => void;
}) {
  const { t, locale } = useI18n();
  const isCustom = field.kind === 'custom';

  return (
    <div className="sqe-checkout-field-properties">
      <div className="sqe-checkout-field-actions">{fieldActions}</div>
      <FormRow label={t('editorCheckoutRequirement')}>
        <select className="sqe-checkout-control" value={field.required ? 'required' : 'optional'}
          disabled={!!lockedReason || !field.enabled}
          onChange={event => onChange({ required: event.target.value === 'required' })}>
          <option value="optional">{t('editorCheckoutOptional')}</option>
          <option value="required">{t('editorCheckoutRequired')}</option>
        </select>
      </FormRow>
      {lockedReason && <p className="text-xs text-fg-secondary">{lockedReason}</p>}
      {/* First thing in the panel: the owner opened this field, so this is the
          moment they are thinking about it. */}
      {conflict && (
        <ConflictCallout
          conflict={conflict}
          fieldId={field.id}
          onUseBuiltin={onUseBuiltin}
          onRemove={onRemove}
        />
      )}

      <FormRow label={t('editorCheckoutLabel')}>
        <input
          type="text"
          value={field.label?.[locale] ?? ''}
          onChange={(e) => onChange({ label: { ...(field.label ?? {}), [locale]: e.target.value } })}
          placeholder={fieldDisplayLabel(field, locale)}
          className="sqe-checkout-control"
        />
      </FormRow>

      <FormRow label={t('editorCheckoutPlaceholder')}>
        <input
          type="text"
          value={field.placeholder?.[locale] ?? ''}
          onChange={(e) => onChange({ placeholder: { ...(field.placeholder ?? {}), [locale]: e.target.value } })}
          className="sqe-checkout-control"
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
              className="sqe-checkout-control font-mono"
            />
            <p className="text-[10px] text-fg-secondary mt-1">
              Clef interne, lettres minuscules, chiffres et underscores. Apparaît dans la commande au POS.
            </p>
          </FormRow>

          <FormRow label="Type de champ">
            <select
              value={field.type ?? 'text'}
              onChange={(e) => onChange({ type: e.target.value as CheckoutFieldType })}
              className="sqe-checkout-control"
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
                className="sqe-checkout-control"
              />
            </FormRow>
          )}
        </>
      )}

      {!lockedReason && <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs text-fg-primary">{t('editorCheckoutCondition')}</span>
          <Toggle
            title={t('editorCheckoutCondition')}
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
              className="sqe-checkout-control"
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
              className="sqe-checkout-control"
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
                className="sqe-checkout-control"
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
                className="sqe-checkout-control"
              />
            )}
          </div>
        )}
        {earlierFieldIds.length === 0 && (
          <p className="text-[10px] text-fg-secondary">
            Ajoutez d&apos;autres champs avant celui-ci pour pouvoir le conditionner.
          </p>
        )}
      </div>}
    </div>
  );
}

function FormRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-fg-secondary">
        {label}
      </span>
      {children}
    </label>
  );
}
