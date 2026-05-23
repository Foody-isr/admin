'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { PlusIcon, PencilIcon, TrashIcon } from 'lucide-react';
import {
  listAvailabilityRules,
  createAvailabilityRule,
  updateAvailabilityRule,
  deleteAvailabilityRule,
  AvailabilityRule,
  AvailabilityRuleInput,
  OutOfStockBehavior,
} from '@/lib/api';
import { Badge, Button, Drawer, Field, Input, NumberField, PageHead, Section, Select } from '@/components/ds';
import { Switch } from '@/components/ui/switch';
import { useI18n } from '@/lib/i18n';

const BLANK: AvailabilityRuleInput = {
  name: '',
  track: true,
  low_stock_threshold: 5,
  out_of_stock_behavior: 'sold_out',
  show_count: true,
  is_default: false,
  sort_order: 0,
};

export default function AvailabilityRulesPage() {
  const { restaurantId } = useParams();
  const rid = Number(restaurantId);
  const { t } = useI18n();

  const [rules, setRules] = useState<AvailabilityRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState<AvailabilityRuleInput>(BLANK);
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setRules(await listAvailabilityRules(rid));
      setError(null);
    } catch (e: any) {
      setError(e?.message || t('availabilityFailedToLoad'));
    } finally {
      setLoading(false);
    }
  }, [rid, t]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  function openNew() {
    setEditingId(null);
    setDraft({ ...BLANK, sort_order: rules.length });
    setDrawerOpen(true);
  }

  function openEdit(rule: AvailabilityRule) {
    setEditingId(rule.id);
    setDraft({
      name: rule.name,
      track: rule.track,
      low_stock_threshold: rule.low_stock_threshold,
      out_of_stock_behavior: rule.out_of_stock_behavior,
      show_count: rule.show_count,
      is_default: rule.is_default,
      sort_order: rule.sort_order,
    });
    setDrawerOpen(true);
  }

  async function save() {
    if (!draft.name.trim()) {
      setError(t('availabilityNeedName'));
      return;
    }
    setSaving(true);
    try {
      if (editingId == null) {
        await createAvailabilityRule(rid, draft);
      } else {
        await updateAvailabilityRule(rid, editingId, draft);
      }
      setDrawerOpen(false);
      await refresh();
    } catch (e: any) {
      setError(e?.message || t('availabilityCouldNotSave'));
    } finally {
      setSaving(false);
    }
  }

  async function remove(rule: AvailabilityRule) {
    if (!confirm(t('availabilityDeleteConfirm'))) return;
    try {
      await deleteAvailabilityRule(rid, rule.id);
      await refresh();
    } catch (e: any) {
      // Server returns 409 with a clear message when the rule is in use or default.
      alert(e?.message || t('availabilityCouldNotDelete'));
    }
  }

  return (
    <div className="p-4 md:p-6">
      <PageHead
        title={t('availabilityRulesTitle')}
        desc={t('availabilityRulesDesc')}
        actions={
          <Button onClick={openNew}>
            <PlusIcon className="size-4" /> {t('availabilityNewRule')}
          </Button>
        }
      />

      {error && (
        <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-fs-sm text-red-400">
          {error}
        </div>
      )}

      <Section>
        {loading ? (
          <p className="text-fs-sm text-[var(--fg-muted)]">{t('loading')}</p>
        ) : rules.length === 0 ? (
          <p className="text-fs-sm text-[var(--fg-muted)]">{t('availabilityNoRules')}</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {rules.map((rule) => (
              <div
                key={rule.id}
                className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 flex flex-col gap-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="font-semibold text-[var(--fg)]">{rule.name}</span>
                  {rule.is_default && <Badge tone="info">{t('availabilityDefaultTag')}</Badge>}
                </div>
                <div className="text-fs-xs text-[var(--fg-muted)] leading-relaxed">
                  {rule.track ? (
                    <>
                      {t('availabilityTracksStock')}
                      {rule.low_stock_threshold > 0 && (
                        <> · {t('availabilityWarnAtMost')} {rule.low_stock_threshold}</>
                      )}
                      {' · '}
                      {rule.out_of_stock_behavior === 'hide'
                        ? t('availabilityHideWhenOut')
                        : t('availabilitySoldOutBadge')}
                      {' · '}
                      {rule.show_count ? t('availabilityShowsCount') : t('availabilityGenericBadge')}
                    </>
                  ) : (
                    <>{t('availabilityAlwaysAvailableDesc')}</>
                  )}
                </div>
                <div className="mt-auto flex gap-2">
                  <Button size="sm" variant="ghost" onClick={() => openEdit(rule)}>
                    <PencilIcon className="size-3.5" /> {t('edit')}
                  </Button>
                  {!rule.is_default && (
                    <Button size="sm" variant="ghost" onClick={() => remove(rule)}>
                      <TrashIcon className="size-3.5" /> {t('delete')}
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Drawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        title={editingId == null ? t('availabilityNewRule') : t('availabilityEditRule')}
        width={460}
        onSave={save}
        saveLabel={t('save')}
        saveDisabled={saving}
      >
        <div className="flex flex-col gap-5 p-1">
          <Field label={t('availabilityRuleName')}>
            <Input
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder={t('availabilityRuleNamePlaceholder')}
            />
          </Field>

          <label className="flex items-center justify-between gap-3">
            <span className="text-fs-sm text-[var(--fg)]">{t('availabilityTrackRecipeStock')}</span>
            <Switch
              checked={draft.track}
              onCheckedChange={(v) => setDraft({ ...draft, track: v })}
            />
          </label>

          {draft.track && (
            <>
              <Field label={t('availabilityLowStockField')}>
                <NumberField
                  value={draft.low_stock_threshold}
                  min={0}
                  integer
                  onChange={(v) => setDraft({ ...draft, low_stock_threshold: Math.max(0, v) })}
                />
              </Field>

              <Field label={t('availabilityWhenOutOfStock')}>
                <Select
                  value={draft.out_of_stock_behavior}
                  onChange={(e) =>
                    setDraft({ ...draft, out_of_stock_behavior: e.target.value as OutOfStockBehavior })
                  }
                >
                  <option value="sold_out">{t('availabilityShowSoldOutBadge')}</option>
                  <option value="hide">{t('availabilityHideFromMenu')}</option>
                </Select>
              </Field>

              <label className="flex items-center justify-between gap-3">
                <span className="text-fs-sm text-[var(--fg)]">{t('availabilityShowRemainingCount')}</span>
                <Switch
                  checked={draft.show_count}
                  onCheckedChange={(v) => setDraft({ ...draft, show_count: v })}
                />
              </label>
            </>
          )}

          <label className="flex items-center justify-between gap-3 border-t border-[var(--border)] pt-4">
            <span className="text-fs-sm text-[var(--fg)]">{t('availabilityUseAsDefault')}</span>
            <Switch
              checked={draft.is_default}
              onCheckedChange={(v) => setDraft({ ...draft, is_default: v })}
            />
          </label>
        </div>
      </Drawer>
    </div>
  );
}
