'use client';

import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { PreparationRule, ImmediateSaleMode } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import {
  ItemPreparationDraft,
  preparationDuration,
  validPreparationDraft,
} from '@/lib/item-preparation';
import { ItemSettingsDialog } from './ItemSettingsDialog';

function DurationField({
  value,
  onChange,
  label,
}: {
  value: number;
  onChange: (value: number) => void;
  label: string;
}) {
  const { t, locale } = useI18n();
  const presets = [
    0, 5, 15, 30, 60, 90, 120, 180, 240, 360, 720, 1440, 2880, 4320, 10080,
  ];
  const [custom, setCustom] = useState(!presets.includes(value));
  return (
    <div className="item-settings-field">
      <label>
        {label}
        <select
          value={custom ? 'custom' : value}
          onChange={(event) => {
            const next = event.target.value;
            setCustom(next === 'custom');
            if (next !== 'custom') onChange(Number(next));
          }}
        >
          {presets.map((minutes) => (
            <option key={minutes} value={minutes}>
              {minutes === 0
                ? t('itemPrepImmediate')
                : preparationDuration(minutes, locale)}
            </option>
          ))}
          <option value="custom">{t('itemPrepCustomDuration')}</option>
        </select>
      </label>
      {custom && (
        <label>
          {t('itemPrepMinutes')}
          <input
            type="number"
            min={0}
            max={525600}
            step={1}
            value={Number.isNaN(value) ? '' : value}
            onChange={(event) =>
              onChange(
                event.target.value === '' ? NaN : Number(event.target.value),
              )
            }
          />
        </label>
      )}
    </div>
  );
}

/** Edits preparation and weekly deadlines without adding fields to the item page. */
export function ItemPreparationDialog({
  value,
  defaultLeadMinutes,
  readyStockEligible,
  onApply,
  onClose,
}: {
  value: ItemPreparationDraft;
  defaultLeadMinutes: number;
  readyStockEligible: boolean;
  onApply: (draft: ItemPreparationDraft) => void;
  onClose: () => void;
}) {
  const { t, locale } = useI18n();
  const [draft, setDraft] = useState<ItemPreparationDraft>(() =>
    structuredClone(value),
  );
  const [previousCustom, setPreviousCustom] = useState(
    value.leadMinutes ?? defaultLeadMinutes,
  );
  const [previousSchedule, setPreviousSchedule] = useState(value.schedule);
  const base = draft.leadMinutes ?? defaultLeadMinutes;
  const inherited = draft.leadMinutes == null && draft.schedule == null;
  const updateRule = (index: number, patch: Partial<PreparationRule>) =>
    setDraft((current) => ({
      ...current,
      schedule: current.schedule!.map((rule, i) =>
        i === index ? { ...rule, ...patch } : rule,
      ),
    }));
  const dayName = (day: number, short = false) =>
    new Intl.DateTimeFormat(locale, {
      weekday: short ? 'short' : 'long',
      timeZone: 'UTC',
    }).format(new Date(Date.UTC(2026, 0, 4 + day)));
  const week = locale === 'he' ? [0, 1, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5, 6, 0];
  const usedDays = new Set(draft.schedule?.flatMap((rule) => rule.days));
  const valid =
    validPreparationDraft(draft) && (!draft.saleMode || readyStockEligible);
  return (
    <ItemSettingsDialog
      title={t('itemPrepTitle')}
      description={t('itemPrepDescription')}
      onClose={onClose}
      onApply={() => onApply(draft)}
      applyDisabled={!valid}
    >
      <div className="item-settings-row">
        <div>
          <label htmlFor="item-prep-inherit">{t('itemPrepUseDefault')}</label>
          <p>
            {defaultLeadMinutes
              ? preparationDuration(defaultLeadMinutes, locale)
              : t('itemPrepImmediate')}
          </p>
        </div>
        <button
          id="item-prep-inherit"
          type="button"
          className="item-settings-switch"
          role="switch"
          aria-checked={inherited}
          aria-label={t('itemPrepUseDefault')}
          onClick={() => {
            if (inherited)
              setDraft({
                ...draft,
                leadMinutes: previousCustom,
                schedule: previousSchedule,
              });
            else {
              setPreviousCustom(base);
              setPreviousSchedule(draft.schedule);
              setDraft({ ...draft, leadMinutes: null, schedule: null });
            }
          }}
        >
          <span />
        </button>
      </div>
      {!inherited && (
        <div className="item-settings-stack">
          {!draft.schedule && (
            <DurationField
              value={base}
              onChange={(leadMinutes) => setDraft({ ...draft, leadMinutes })}
              label={t('itemPreparationDelay')}
            />
          )}
          {!draft.schedule ? (
            <button
              type="button"
              className="item-settings-link"
              onClick={() => setDraft({ ...draft, schedule: [{ days: week }] })}
            >
              {t('itemPrepCustomizeDays')}
            </button>
          ) : (
            <>
              <div className="item-settings-row item-settings-row-plain">
                <div>
                  <h3>{t('itemPrepCalendar')}</h3>
                  <p>{t('itemPrepCalendarHint')}</p>
                </div>
                <button
                  type="button"
                  className="item-settings-link"
                  onClick={() => setDraft({ ...draft, schedule: null })}
                >
                  {t('itemPrepEveryDay')}
                </button>
              </div>
              {draft.schedule.map((rule, index) => (
                <fieldset key={index} className="item-prep-rule">
                  <legend>
                    {t('itemPrepGroup').replace('{number}', String(index + 1))}
                  </legend>
                  <div className="item-prep-rule-heading">
                    <span>{t('itemPrepReceptionDays')}</span>
                    <button
                      type="button"
                      className="item-settings-icon"
                      aria-label={t('itemPrepRemoveGroup').replace(
                        '{number}',
                        String(index + 1),
                      )}
                      onClick={() =>
                        setDraft({
                          ...draft,
                          schedule: draft.schedule!.filter(
                            (_, i) => i !== index,
                          ),
                        })
                      }
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                  <div className="item-prep-week">
                    {week.map((day) => (
                      <button
                        key={day}
                        type="button"
                        aria-label={dayName(day)}
                        aria-pressed={rule.days.includes(day)}
                        disabled={usedDays.has(day) && !rule.days.includes(day)}
                        onClick={() =>
                          updateRule(index, {
                            days: rule.days.includes(day)
                              ? rule.days.filter((value) => value !== day)
                              : week.filter(
                                  (value) =>
                                    value === day || rule.days.includes(value),
                                ),
                          })
                        }
                      >
                        {dayName(day, true)}
                      </button>
                    ))}
                  </div>
                  <DurationField
                    value={rule.lead_time_minutes ?? base}
                    onChange={(lead_time_minutes) =>
                      updateRule(index, { lead_time_minutes })
                    }
                    label={t('itemPreparationDelay')}
                  />
                  <div className="item-prep-deadline">
                    <label>
                      {t('itemPrepOrderBefore')}
                      <select
                        value={rule.cutoff_days_before ?? ''}
                        onChange={(event) =>
                          updateRule(
                            index,
                            event.target.value === ''
                              ? {
                                  cutoff_days_before: undefined,
                                  cutoff_time: undefined,
                                }
                              : {
                                  cutoff_days_before: Number(
                                    event.target.value,
                                  ),
                                  cutoff_time: rule.cutoff_time || '12:00',
                                },
                          )
                        }
                      >
                        <option value="">{t('itemPrepNoDeadline')}</option>
                        {Array.from(
                          new Set([
                            0,
                            1,
                            2,
                            3,
                            4,
                            5,
                            6,
                            7,
                            14,
                            ...(rule.cutoff_days_before != null
                              ? [rule.cutoff_days_before]
                              : []),
                          ]),
                        )
                          .sort((a, b) => a - b)
                          .map((days) => (
                            <option key={days} value={days}>
                              {days === 0
                                ? t('itemPrepSameDay')
                                : days === 1
                                  ? t('itemPrepPreviousDay')
                                  : t('itemPrepDaysBefore').replace(
                                      '{days}',
                                      String(days),
                                    )}
                            </option>
                          ))}
                      </select>
                    </label>
                    {rule.cutoff_days_before != null && (
                      <label>
                        {t('itemPrepCutoffTime')}
                        <input
                          type="time"
                          value={rule.cutoff_time ?? ''}
                          onChange={(event) =>
                            updateRule(index, {
                              cutoff_time: event.target.value,
                            })
                          }
                        />
                      </label>
                    )}
                  </div>
                </fieldset>
              ))}
              {usedDays.size < 7 && (
                <button
                  type="button"
                  className="item-settings-link item-settings-add"
                  onClick={() =>
                    setDraft({
                      ...draft,
                      schedule: [
                        ...draft.schedule!,
                        { days: week.filter((day) => !usedDays.has(day)) },
                      ],
                    })
                  }
                >
                  <Plus size={18} />
                  {t('itemPrepAddGroup')}
                </button>
              )}
              {!draft.schedule.length && (
                <p className="item-settings-error" role="alert">
                  {t('itemPrepNeedDays')}
                </p>
              )}
            </>
          )}
        </div>
      )}
      {(readyStockEligible || draft.saleMode) && (
        <div className="item-settings-stack item-settings-separated">
          <label>
            {t('itemPrepReadyStock')}
            <select
              value={draft.saleMode}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  saleMode: event.target.value as ImmediateSaleMode,
                })
              }
            >
              <option value="">{t('itemPrepRespectDelay')}</option>
              <option value="surplus" disabled={!readyStockEligible}>
                {t('itemPrepAllowReady')}
              </option>
              <option value="standalone" disabled={!readyStockEligible}>
                {t('saleModeStandalone')}
              </option>
            </select>
          </label>
          <p className="item-settings-description">
            {t(
              readyStockEligible
                ? 'itemPrepReadyHint'
                : 'saleModeNeedsCountStock',
            )}
          </p>
        </div>
      )}
      <p className="item-settings-footnote">{t('itemPrepHoursHint')}</p>
    </ItemSettingsDialog>
  );
}
