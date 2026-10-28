'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { usePermissions } from '@/lib/permissions-context';
import { useI18n } from '@/lib/i18n';
import { listCouriers, type StaffMember } from '@/lib/api';
import { Button } from '@/components/ds';
import CourierItineraryView from '@/components/delivery/CourierItineraryView';
import styles from '@/components/delivery/CourierItinerary.module.css';

/** Selects a restaurant courier without replacing the owner's or superadmin's session. */
function SelectedCourierMode({ rid }: { rid: number }) {
  const { t } = useI18n();
  const [couriers, setCouriers] = useState<StaffMember[] | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let current = true;
    setError(false);
    setCouriers(null);
    listCouriers(rid)
      .then((staff) => {
        if (!current) return;
        setCouriers(staff);
        setSelectedId((previous) => staff.some((courier) => courier.id === previous)
          ? previous : staff[0]?.id ?? null);
      })
      .catch(() => { if (current) setError(true); });
    return () => { current = false; };
  }, [rid, retry]);

  return (
    <div className={styles.preview}>
      <div className={styles.courierPicker}>
        <label htmlFor="courier-mode-selection">{t('courierViewAs')}</label>
        <select
          id="courier-mode-selection"
          value={selectedId ?? ''}
          onChange={(event) => setSelectedId(Number(event.target.value))}
          disabled={!couriers?.length}
        >
          {!couriers?.length && <option value="">{t('courierSelectCourier')}</option>}
          {couriers?.map((courier) => (
            <option key={courier.id} value={courier.id}>{courier.full_name || courier.email}</option>
          ))}
        </select>
      </div>
      {error ? (
        <div className="p-4">
          <p role="alert">{t('couldNotLoad')}</p>
          <Button variant="secondary" onClick={() => setRetry((value) => value + 1)}>{t('retry')}</Button>
        </div>
      ) : couriers === null ? (
        <p role="status" className="p-4">{t('loading')}</p>
      ) : couriers.length === 0 ? (
        <p role="status" className="p-4">{t('courierNoCouriers')}</p>
      ) : selectedId !== null && (
        <div className={styles.previewBody}>
          <CourierItineraryView key={`${rid}:${selectedId}`} rid={rid} courierId={selectedId} />
        </div>
      )}
    </div>
  );
}

/** Reuses the courier workflow, with courier switching for restaurant owners and superadmins. */
export default function CourierModePage() {
  const { restaurantId } = useParams();
  const { isOwner, loading } = usePermissions();
  const { t } = useI18n();
  const rid = Number(restaurantId);

  if (loading) return <p role="status" className="p-4">{t('loading')}</p>;

  return isOwner
    ? <SelectedCourierMode key={rid} rid={rid} />
    : <CourierItineraryView key={rid} rid={rid} />;
}
