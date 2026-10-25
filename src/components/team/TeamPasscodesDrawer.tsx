'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { UserRound } from 'lucide-react';
import { Button, Drawer } from '@/components/ds';
import { listStaff, type StaffMember } from '@/lib/api';
import { useI18n } from '@/lib/i18n';

/** Inspect PIN setup without exposing codes; members configure their own PIN by invitation. */
export function TeamPasscodesDrawer({ restaurantId, onClose }: { restaurantId: number; onClose: () => void }) {
  const { t } = useI18n();
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const retryLoad = useCallback(() => setRetry(value => value + 1), []);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    listStaff(restaurantId).then(members => { if (active) setStaff(members); })
      .catch(reason => { if (active) setError(reason instanceof Error ? reason.message : t('staffLoadError')); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [restaurantId, retry, t]);
  return <Drawer open onOpenChange={open => { if (!open) onClose(); }} title={t('teamPasscodes')} subtitle={t('teamPasscodesHelp')} width={560} className="team-surface">
    {loading ? <p role="status">{t('loading')}</p> : error ? <div role="alert"><p>{error}</p><Button variant="secondary" className="mt-4" onClick={retryLoad}>{t('retry')}</Button></div> : <div>
      {staff.map(member => <Link key={member.id} href={`/${restaurantId}/staff?member=${member.id}`} className="team-permission-row">
        <span className="team-avatar"><UserRound aria-hidden /></span>
        <span><strong dir="auto">{member.full_name}</strong><small>{t(member.pos_pin_configured ? 'configured' : 'notConfigured')}</small></span>
      </Link>)}
      {!staff.length && <p>{t('noStaffYet')}</p>}
    </div>}
  </Drawer>;
}
