'use client';

import {useEffect, useState} from 'react';
import {BooleanInput} from '@/components/ds/Selection';
import {Button, ConfirmDialog, Field, Section} from '@/components/ds';
import {useI18n} from '@/lib/i18n';
import {
  assignKitchenTablet, issueKitchenCode, registerKitchenTablet, revokeKitchenTablet, setKdsPilot,
  type KdsConfiguration, type KitchenTablet, type TabletAssignment,
} from '@/lib/kds-tablets';

const inputClass = 'w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3';

type Props = {
  rid: number;
  config: KdsConfiguration;
  editable: boolean;
  refresh: () => Promise<void>;
};

/** Links a tablet to its permitted profiles and shows its last confirmed contact. */
export function KitchenTablets({rid, config, editable, refresh}: Props) {
  const {t} = useI18n();
  const [id, setId] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const tablets = config.devices.filter(d => d.kind === 'tablet' || d.kind === 'display');
  async function update(action: () => Promise<void>) {
    setBusy(true);
    setError(false);
    try { await action(); await refresh(); }
    catch { setError(true); }
    finally { setBusy(false); }
  }
  return <Section title={t('kdsDedicatedTablets')}>
    <div className="space-y-4">
      <label className="flex items-center justify-between gap-4">{t('kdsRestaurantPilot')}
        <BooleanInput disabled={!editable || busy} checked={config.enabled}
          onChange={event => void update(() => setKdsPilot(rid, event.target.checked))}/>
      </label>
      {editable && config.enabled && <form className="flex flex-wrap items-end gap-3" onSubmit={event => {
        event.preventDefault();
        if (!name.trim() || busy) return;
        void update(async () => {const row = await registerKitchenTablet(rid, name.trim()); setId(row.device_id); setName('');});
      }}>
        <Field label={t('kdsNewTabletName')}><input className={inputClass} value={name} maxLength={120} onChange={e => setName(e.target.value)}/></Field>
        <Button type="submit" disabled={!name.trim() || busy}>{t('kdsAddTablet')}</Button>
      </form>}
      {tablets.length > 0 && <Field label={t('kdsDevice')}>
        <select className={inputClass} value={id} onChange={e => setId(e.target.value)} disabled={busy}>
          <option value="">{t('kdsChooseTablet')}</option>
          {tablets.map(d => <option value={d.id} key={d.id}>{d.display_name || d.system_name}{d.os_name && ` · ${d.os_name}`}</option>)}
        </select>
      </Field>}
      {id && tablets.some(d => d.id === id) &&
        <TabletEditor key={id} {...{rid, id, config, editable, refresh}} current={config.tablets.find(d => d.device_id === id)}/>}
      {error && <p role="alert">{t('tableSettingsSaveFailed')}</p>}
    </div>
  </Section>;
}

function TabletEditor({rid, id, config, editable, current, refresh}: Props & {id: string; current?: KitchenTablet}) {
  const {t, locale} = useI18n();
  const first = config.stations.find(s => s.device_id === id) ?? config.stations[0];
  const [draft, setDraft] = useState<TabletAssignment>(() => current ? {
    enabled: current.enabled, can_act: current.can_act, all_stations: current.all_stations,
    default_station_id: current.default_station_id, station_ids: current.station_ids ?? [],
  } : {
    enabled: true, can_act: true, all_stations: false,
    default_station_id: first?.device_id ?? '', station_ids: first ? [first.device_id] : [],
  });
  const [code, setCode] = useState<{code: string; expires_at: string} | null>(null);
  const [confirm, setConfirm] = useState<'replace'|'revoke'|null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (code && (Date.parse(code.expires_at) <= now || current?.paired_at || current?.revoked_at)) setCode(null);
  }, [code, now, current?.paired_at, current?.revoked_at]);
  const patch = (value: Partial<TabletAssignment>) => setDraft(d => ({...d, ...value}));
  const chooseDefault = (value: string) => patch({
    default_station_id: value,
    station_ids: draft.all_stations || draft.station_ids.includes(value) ? draft.station_ids : [...draft.station_ids,value],
  });
  async function save(action: 'assignment'|'issue'|'revoke'|'refresh') {
    if (busy) return;
    setBusy(true); setError(false); setConfirm(null);
    try {
      let issued: typeof code = null;
      if (action === 'assignment') await assignKitchenTablet(rid, id, draft);
      if (action === 'issue') issued = await issueKitchenCode(rid, id);
      if (action === 'revoke') { await revokeKitchenTablet(rid, id); patch({enabled: false}); }
      await refresh();
      if (action !== 'refresh') setCode(issued);
    } catch { setError(true); } finally { setBusy(false); }
  }
  const lastSeen = current?.last_seen_at;
  const state = current?.revoked_at ? 'kdsRevoked' : !current?.paired_at ? 'kdsAwaitingPair'
    : lastSeen && now - Date.parse(lastSeen) <= 60000 ? 'kdsConnected' : 'kdsDisconnected';
  const dirty = !current || draft.enabled !== current.enabled || draft.can_act !== current.can_act ||
    draft.all_stations !== current.all_stations || draft.default_station_id !== current.default_station_id ||
    (!draft.all_stations && (draft.station_ids.length !== current.station_ids.length || draft.station_ids.some(s => !current.station_ids.includes(s))));
  return <div className="space-y-4">
    <div className="flex flex-wrap items-center gap-3">
      <p role="status">{t(state)}{lastSeen && <> · {t('kdsLastContact')} {new Date(lastSeen).toLocaleString(locale)}</>}</p>
      <Button disabled={busy} onClick={() => void save('refresh')}>{t('kdsRefresh')}</Button>
    </div>
    {config.stations.length === 0 ? <p>{t('kdsCreateProfileFirst')}</p> : <fieldset disabled={!editable || busy} className="space-y-4">
      <label className="flex items-center gap-3"><BooleanInput checked={draft.enabled} onChange={e => patch({enabled:e.target.checked})}/>{t('kdsTabletEnabled')}</label>
      <Field label={t('kdsDefaultStation')}><select className={inputClass} value={draft.default_station_id} onChange={e => chooseDefault(e.target.value)}>
        {!draft.default_station_id && <option value="">{t('kdsChooseStation')}</option>}
        {config.stations.map(s => <option key={s.device_id} value={s.device_id}>{s.name}</option>)}
      </select></Field>
      <label className="flex items-center gap-3"><BooleanInput checked={draft.all_stations} onChange={e => patch({all_stations:e.target.checked, station_ids:Array.from(new Set([...draft.station_ids, draft.default_station_id])).filter(Boolean)})}/>{t('kdsEveryStation')}</label>
      {!draft.all_stations && <Field label={t('kdsAllowedStations')}><div className="flex flex-wrap gap-5">
        {config.stations.map(s => <label key={s.device_id} className="flex items-center gap-2">
          <input type="checkbox" disabled={draft.default_station_id === s.device_id} checked={draft.station_ids.includes(s.device_id)}
            onChange={e => patch({station_ids:e.target.checked?[...draft.station_ids,s.device_id]:draft.station_ids.filter(v=>v!==s.device_id)})}/>
          {s.name}
        </label>)}
      </div></Field>}
      <label className="flex items-center gap-3"><BooleanInput checked={draft.can_act} onChange={e => patch({can_act:e.target.checked})}/>{t('kdsMayAct')}</label>
      <Button disabled={!dirty || !draft.default_station_id} onClick={() => void save('assignment')}>{t('saveChanges')}</Button>
    </fieldset>}
    {editable && current && <div className="flex flex-wrap gap-3">
      <Button disabled={busy || dirty || !config.enabled || !current.enabled} onClick={() => current.paired_at && !current.revoked_at ? setConfirm('replace') : void save('issue')}>{t('kdsIssueCode')}</Button>
      {(current.paired_at || current.code_expiry) && !current.revoked_at && <Button disabled={busy} onClick={() => setConfirm('revoke')}>{t('kdsRevoke')}</Button>}
    </div>}
    {code && <p role="status">{t('kdsPairCode')} <strong dir="ltr">{code.code}</strong> · {new Date(code.expires_at).toLocaleTimeString(locale)}</p>}
    {error && <p role="alert">{t('tableSettingsSaveFailed')}</p>}
    <ConfirmDialog open={confirm!==null} onOpenChange={open=>{if(!open)setConfirm(null);}}
      title={t(confirm==='revoke'?'kdsConfirmRevoke':'kdsConfirmReplace')} confirmLabel={t(confirm==='revoke'?'kdsRevoke':'kdsIssueCode')} cancelLabel={t('cancel')}
      onConfirm={()=>void save(confirm==='revoke'?'revoke':'issue')}/>
  </div>;
}
