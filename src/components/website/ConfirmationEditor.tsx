'use client';

import { useCallback, useMemo } from 'react';
import {
  BUILTIN_CONFIRMATION_ACTIONS,
  ConfirmationAction,
  ConfirmationConfig,
  ConfirmationFAQ,
  defaultConfirmationConfig,
} from '@/lib/api';

// Default labels for the built-in confirmation actions. Owners can override
// per-language; these are what shows up if they leave the label blank.
const ACTION_DEFAULT_LABELS: Record<string, { fr: string; en: string; he: string }> = {
  track_order:  { fr: 'Suivre ma commande',  en: 'Track my order',     he: 'מעקב הזמנה' },
  view_receipt: { fr: 'Voir le reçu',         en: 'View receipt',       he: 'הצג קבלה' },
  new_order:    { fr: 'Nouvelle commande',    en: 'Start a new order',  he: 'הזמנה חדשה' },
  whatsapp:     { fr: 'Nous contacter sur WhatsApp', en: 'Message us on WhatsApp', he: 'צרו קשר ב-WhatsApp' },
};

function actionLabel(id: string): string {
  return ACTION_DEFAULT_LABELS[id]?.fr ?? id;
}

function actionDisplayLabel(action: ConfirmationAction): string {
  return action.label?.fr || actionLabel(action.id);
}

interface ConfirmationEditorProps {
  value: ConfirmationConfig | null | undefined;
  onChange: (next: ConfirmationConfig) => void;
}

/**
 * ConfirmationEditor renders the third Commande sub-tab — the post-order
 * page builder. Owners can override title/subtitle, enable/reorder/relabel
 * built-in action buttons (track, receipt, new order, WhatsApp), add custom
 * external-link buttons, and curate an FAQ accordion.
 *
 * When `value` is null the editor opens on the default config (matching what
 * foodyweb currently shows) so the owner can edit from a real starting point;
 * nothing is persisted until they trigger an actual change.
 */
export default function ConfirmationEditor({ value, onChange }: ConfirmationEditorProps) {
  const config = useMemo<ConfirmationConfig>(() => value ?? defaultConfirmationConfig(), [value]);

  const update = useCallback((patch: Partial<ConfirmationConfig>) => {
    onChange({ ...config, ...patch });
  }, [config, onChange]);

  const setTitle = useCallback((v: string) => {
    update({ title: { ...(config.title ?? {}), fr: v } });
  }, [config.title, update]);

  const setSubtitle = useCallback((v: string) => {
    update({ subtitle: { ...(config.subtitle ?? {}), fr: v } });
  }, [config.subtitle, update]);

  const updateAction = useCallback((idx: number, patch: Partial<ConfirmationAction>) => {
    const next = (config.actions ?? []).slice();
    next[idx] = { ...next[idx], ...patch };
    update({ actions: next });
  }, [config.actions, update]);

  const moveAction = useCallback((idx: number, dir: -1 | 1) => {
    const arr = (config.actions ?? []).slice();
    const j = idx + dir;
    if (j < 0 || j >= arr.length) return;
    [arr[idx], arr[j]] = [arr[j], arr[idx]];
    update({ actions: arr });
  }, [config.actions, update]);

  const removeAction = useCallback((idx: number) => {
    const arr = (config.actions ?? []).slice();
    const a = arr[idx];
    if (a.kind === 'builtin') return;
    arr.splice(idx, 1);
    update({ actions: arr });
  }, [config.actions, update]);

  const addCustomAction = useCallback(() => {
    const arr = config.actions ?? [];
    let i = 1;
    while (arr.some((a) => a.id === `link_${i}`)) i++;
    const next: ConfirmationAction = {
      id: `link_${i}`,
      kind: 'custom',
      enabled: true,
      label: { fr: 'Lien externe' },
      config: { url: '' },
    };
    update({ actions: [...arr, next] });
  }, [config.actions, update]);

  const builtinIds = new Set((config.actions ?? []).filter((a) => a.kind === 'builtin').map((a) => a.id));
  const missingBuiltins = BUILTIN_CONFIRMATION_ACTIONS.filter((b) => !builtinIds.has(b.id));

  const addBuiltinAction = useCallback((id: string) => {
    const arr = config.actions ?? [];
    const next: ConfirmationAction = { id, kind: 'builtin', enabled: true };
    update({ actions: [...arr, next] });
  }, [config.actions, update]);

  // FAQ helpers
  const updateFAQ = useCallback((idx: number, patch: Partial<ConfirmationFAQ>) => {
    const arr = (config.faq ?? []).slice();
    arr[idx] = { ...arr[idx], ...patch };
    update({ faq: arr });
  }, [config.faq, update]);

  const addFAQ = useCallback(() => {
    update({ faq: [...(config.faq ?? []), { question: { fr: '' }, answer: { fr: '' } }] });
  }, [config.faq, update]);

  const removeFAQ = useCallback((idx: number) => {
    const arr = (config.faq ?? []).slice();
    arr.splice(idx, 1);
    update({ faq: arr });
  }, [config.faq, update]);

  return (
    <div className="px-4 py-4 space-y-6">
      {/* ─── Header ────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <h3 className="text-[11px] uppercase tracking-[0.12em] text-fg-secondary font-semibold">
          En-tête
        </h3>
        <FormRow label="Titre">
          <input
            type="text"
            value={config.title?.fr ?? ''}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Merci pour votre commande"
            className="admin-input"
          />
        </FormRow>
        <FormRow label="Sous-titre">
          <input
            type="text"
            value={config.subtitle?.fr ?? ''}
            onChange={(e) => setSubtitle(e.target.value)}
            placeholder="Votre commande est confirmée"
            className="admin-input"
          />
        </FormRow>
      </section>

      {/* ─── Actions ───────────────────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-[11px] uppercase tracking-[0.12em] text-fg-secondary font-semibold">
            Boutons d&apos;action
          </h3>
          <button
            type="button"
            onClick={addCustomAction}
            className="text-[12px] text-brand-500 hover:text-brand-600 font-medium"
          >
            + Lien personnalisé
          </button>
        </div>

        <ul className="space-y-1.5">
          {(config.actions ?? []).map((action, idx) => (
            <li
              key={action.id}
              className="rounded-lg border"
              style={{ borderColor: 'var(--divider)', background: 'var(--surface)' }}
            >
              <div className="flex items-center gap-2 px-3 py-2">
                <div className="flex flex-col">
                  <button type="button" onClick={() => moveAction(idx, -1)} disabled={idx === 0}
                    className="w-5 h-3 text-fg-secondary hover:text-fg-primary disabled:opacity-30 leading-none">▲</button>
                  <button type="button" onClick={() => moveAction(idx, 1)} disabled={idx === (config.actions?.length ?? 0) - 1}
                    className="w-5 h-3 text-fg-secondary hover:text-fg-primary disabled:opacity-30 leading-none">▼</button>
                </div>
                <div className="flex-1 text-[13px] text-fg-primary truncate">
                  {actionDisplayLabel(action)}
                  <span className="ml-2 text-[10px] text-fg-secondary uppercase tracking-wide">
                    {action.kind === 'builtin' ? 'intégré' : 'lien'}
                  </span>
                </div>
                <Toggle
                  checked={action.enabled}
                  onChange={(b) => updateAction(idx, { enabled: b })}
                  title={action.enabled ? 'Désactiver' : 'Activer'}
                />
                {action.kind === 'custom' && (
                  <button type="button" onClick={() => removeAction(idx)}
                    className="w-6 h-6 text-fg-secondary hover:text-red-500" title="Supprimer">×</button>
                )}
              </div>

              <ActionEditor
                action={action}
                onChange={(patch) => updateAction(idx, patch)}
              />
            </li>
          ))}
        </ul>

        {missingBuiltins.length > 0 && (
          <div className="mt-3 p-3 rounded-lg" style={{ background: 'var(--surface-subtle)' }}>
            <p className="text-[11px] uppercase tracking-[0.12em] text-fg-secondary mb-2 font-semibold">
              Ajouter un bouton intégré
            </p>
            <div className="flex flex-wrap gap-1.5">
              {missingBuiltins.map((b) => (
                <button key={b.id} type="button" onClick={() => addBuiltinAction(b.id)}
                  className="text-[12px] px-2.5 py-1 rounded-md border text-fg-primary hover:bg-surface-subtle"
                  style={{ borderColor: 'var(--divider)' }}>
                  + {actionLabel(b.id)}
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* ─── FAQ ───────────────────────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-[11px] uppercase tracking-[0.12em] text-fg-secondary font-semibold">
            Questions fréquentes
          </h3>
          <button type="button" onClick={addFAQ}
            className="text-[12px] text-brand-500 hover:text-brand-600 font-medium">
            + Ajouter
          </button>
        </div>

        {(config.faq ?? []).length === 0 ? (
          <p className="text-[11px] text-fg-secondary">
            Aucune question. Ajoutez-en pour aider vos clients après leur commande.
          </p>
        ) : (
          <ul className="space-y-2">
            {(config.faq ?? []).map((item, idx) => (
              <li key={idx} className="rounded-lg border p-3 space-y-2"
                style={{ borderColor: 'var(--divider)', background: 'var(--surface)' }}>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] uppercase tracking-[0.12em] text-fg-secondary font-semibold">
                    Question {idx + 1}
                  </span>
                  <button type="button" onClick={() => removeFAQ(idx)}
                    className="text-fg-secondary hover:text-red-500 text-sm" title="Supprimer">×</button>
                </div>
                <input
                  type="text"
                  value={item.question?.fr ?? ''}
                  onChange={(e) => updateFAQ(idx, { question: { ...(item.question ?? {}), fr: e.target.value } })}
                  placeholder="Question"
                  className="admin-input"
                />
                <textarea
                  value={item.answer?.fr ?? ''}
                  onChange={(e) => updateFAQ(idx, { answer: { ...(item.answer ?? {}), fr: e.target.value } })}
                  placeholder="Réponse"
                  rows={3}
                  className="admin-input"
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────

function ActionEditor({
  action, onChange,
}: { action: ConfirmationAction; onChange: (patch: Partial<ConfirmationAction>) => void }) {
  const labelFr = action.label?.fr ?? '';
  return (
    <div className="px-3 pb-3 pt-1 space-y-2 border-t" style={{ borderColor: 'var(--divider)' }}>
      <FormRow label="Libellé">
        <input
          type="text"
          value={labelFr}
          onChange={(e) => onChange({ label: { ...(action.label ?? {}), fr: e.target.value } })}
          placeholder={actionLabel(action.id)}
          className="admin-input"
        />
      </FormRow>

      {action.kind === 'builtin' && action.id === 'whatsapp' && (
        <>
          <FormRow label="Numéro WhatsApp">
            <input
              type="tel"
              value={String((action.config?.phone as string) ?? '')}
              onChange={(e) => onChange({ config: { ...(action.config ?? {}), phone: e.target.value } })}
              placeholder="+972501234567"
              className="admin-input"
            />
            <p className="text-[10px] text-fg-secondary mt-1">
              Format international avec indicatif. Le bouton ouvrira wa.me/&lt;numéro&gt;.
            </p>
          </FormRow>
          <FormRow label="Message pré-rempli">
            <textarea
              value={String((action.config?.message as string) ?? '')}
              onChange={(e) => onChange({ config: { ...(action.config ?? {}), message: e.target.value } })}
              placeholder="Bonjour, j&apos;ai une question sur ma commande #{order_id}"
              rows={2}
              className="admin-input"
            />
            <p className="text-[10px] text-fg-secondary mt-1">
              Utilisez {'{order_id}'} pour insérer le numéro de commande.
            </p>
          </FormRow>
        </>
      )}

      {action.kind === 'custom' && (
        <FormRow label="URL">
          <input
            type="url"
            value={String((action.config?.url as string) ?? '')}
            onChange={(e) => onChange({ config: { ...(action.config ?? {}), url: e.target.value } })}
            placeholder="https://..."
            className="admin-input"
          />
        </FormRow>
      )}
    </div>
  );
}

function Toggle({
  checked, onChange, title,
}: { checked: boolean; onChange: (b: boolean) => void; title?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      title={title}
      className={`relative w-9 h-5 rounded-full transition flex-shrink-0 ${checked ? 'bg-brand-500' : ''}`}
      style={!checked ? { background: 'var(--divider)' } : undefined}
    >
      <span
        className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform"
        style={{ transform: checked ? 'translateX(18px)' : 'translateX(2px)' }}
      />
    </button>
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
