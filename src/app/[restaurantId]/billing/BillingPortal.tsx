'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { CalendarDays, ChartNoAxesColumn, CreditCard, FileText, Layers } from 'lucide-react';
import { Badge, PageHead } from '@/components/ds';
import type { FoodyBillingOffer, FoodyBillingView } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import styles from './billing-portal.module.css';

export const portalCopy = {
  fr: {
    subscription: 'Abonnement', documents: 'Factures', usage: 'Utilisation', current: 'Votre abonnement',
    offer: 'Offre à vérifier', rates: 'Tarifs de l’offre', details: 'Détails de l’offre', detailsAccepted: 'Détails de votre abonnement',
    next: 'Prochain prélèvement', due: 'Échéance de renouvellement', paidThrough: 'Fin de la période payée', ended: 'Période terminée',
    renews: 'Renouvellement automatique', manual: 'Sans renouvellement automatique', manage: 'Gérer le renouvellement',
    last: 'Dernier paiement', history: 'Voir les factures', noAmount: 'Montant à confirmer', filters: 'Filtres',
    email: 'Envoi par e-mail', summary: 'Récapitulatif', dueNow: 'À payer maintenant', payBy: 'Paiement sécurisé par Verifone',
    selectCycle: 'Choisissez une fréquence pour voir le montant à régler.',
    method: 'Moyen de paiement', detailsPayment: 'Détails du paiement', amount: 'Montant',
  },
  en: {
    subscription: 'Subscription', documents: 'Invoices', usage: 'Usage', current: 'Your subscription',
    offer: 'Offer to review', rates: 'Offer pricing', details: 'Offer details', detailsAccepted: 'Subscription details',
    next: 'Next charge', due: 'Renewal due', paidThrough: 'Paid period ends', ended: 'Paid period ended',
    renews: 'Automatic renewal', manual: 'No automatic renewal', manage: 'Manage renewal',
    last: 'Last payment', history: 'View invoices', noAmount: 'Amount to be confirmed', filters: 'Filters',
    email: 'Email delivery', summary: 'Order summary', dueNow: 'Due now', payBy: 'Secure payment with Verifone',
    selectCycle: 'Choose a billing frequency to see the amount due.',
    method: 'Payment method', detailsPayment: 'Payment details', amount: 'Amount',
  },
  he: {
    subscription: 'מנוי', documents: 'חשבוניות', usage: 'שימוש', current: 'המנוי שלכם',
    offer: 'הצעה לבדיקה', rates: 'מחירי ההצעה', details: 'פרטי ההצעה', detailsAccepted: 'פרטי המנוי',
    next: 'החיוב הבא', due: 'מועד החידוש', paidThrough: 'סיום התקופה ששולמה', ended: 'התקופה ששולמה הסתיימה',
    renews: 'חידוש אוטומטי', manual: 'ללא חידוש אוטומטי', manage: 'ניהול החידוש',
    last: 'התשלום האחרון', history: 'לחשבוניות', noAmount: 'הסכום ממתין לאישור', filters: 'מסננים',
    email: 'שליחה בדוא״ל', summary: 'סיכום ההזמנה', dueNow: 'לתשלום כעת', payBy: 'תשלום מאובטח באמצעות Verifone',
    selectCycle: 'בחרו תדירות חיוב כדי לראות את הסכום לתשלום.',
    method: 'אמצעי תשלום', detailsPayment: 'פרטי התשלום', amount: 'סכום',
  },
};

const links = [['subscription', Layers], ['documents', FileText], ['usage', ChartNoAxesColumn]] as const;
function locationSection() {
  return links.find(([id]) => window.location.hash === '#' + id)?.[0] ?? 'subscription';
}
function subscribeLocation(notify: () => void) {
  window.addEventListener('hashchange', notify);
  return () => window.removeEventListener('hashchange', notify);
}

/** Keeps the billing navigation in sync with email links and browser history. */
export function useBillingSection() {
  const section = useSyncExternalStore(subscribeLocation, locationSection, () => 'subscription' as const);
  useEffect(() => {
    const hash = window.location.hash;
    if (hash === '#add-licences') {
      document.getElementById('add-licences')?.scrollIntoView();
    } else if (hash === '#' + section) {
      const panel = document.getElementById(section);
      panel?.focus({ preventScroll: true });
      if (panel && panel.getBoundingClientRect().top < 0) panel.scrollIntoView({ block: 'start' });
    }
  }, [section]);
  return section;
}

/** Provides direct links to the owner's agreement, invoice archive and usage. */
export function BillingHeader({ section, showUsage = true }: { section: ReturnType<typeof locationSection>; showUsage?: boolean }) {
  const { t, locale } = useI18n();
  return <>
    <PageHead className={styles.header} title={t('billing')} actions={<Badge tone="warning" dot>{t('foodyPilotSandbox')}</Badge>} />
    <nav className={styles.nav} aria-label={t('billing')}>
      {links.filter(([id]) => showUsage || id !== 'usage').map(([id, Icon]) => <a key={id} href={'#' + id} aria-current={section === id ? 'page' : undefined}>
        <Icon size={17} aria-hidden="true" />{portalCopy[locale][id]}
      </a>)}
    </nav>
  </>;
}

/** Summarizes the accepted period using its own price and renewal terms. */
export function AgreementSummary({ agreement, accepted, scheduled, money, date }: {
  agreement: NonNullable<FoodyBillingView['agreement']>; accepted: FoodyBillingOffer | null;
  scheduled: boolean; money: (minor: number) => string; date: (value: string) => string;
}) {
  const { t, locale } = useI18n();
  const c = portalCopy[locale];
  const rate = accepted?.[agreement.cycle];
  const ended = Date.parse(agreement.period_end) <= Date.now();
  return <section className={styles.agreement} aria-label={c.current}>
    <div className={styles.plan}>
      <div className={styles.kicker}><Layers size={17} aria-hidden="true" />{c.current}</div>
      <h2 dir="auto">{accepted?.title || t('subscription')}</h2>
      <div className={styles.planMeta}>
        <span>{t(agreement.cycle === 'monthly' ? 'foodyPilotMonthly' : 'foodyPilotAnnual')}</span>
        {scheduled && <span>{c.renews}</span>}
        {!agreement.renews && <span>{c.manual}</span>}
      </div>
    </div>
    <div className={styles.due}>
      <div className={styles.kicker}><CalendarDays size={17} aria-hidden="true" />{scheduled ? (ended ? c.due : c.next) : ended ? c.ended : c.paidThrough}</div>
      {scheduled ? <>
        <p className={styles.figure}>{rate ? <><bdi>{money(rate.total_minor)}</bdi> <small>{t('foodyPilotGross')}</small></> : c.noAmount}</p>
        <p className={styles.dueMeta}><bdi>{date(agreement.period_end)}</bdi></p>
      </> : <p className={styles.dateFigure}><bdi>{date(agreement.period_end)}</bdi></p>}
    </div>
  </section>;
}

/** Shows the scoped card reference already returned for the accepted agreement. */
export function PaymentMethod({ lastFour }: { lastFour: string }) {
  const { locale } = useI18n();
  return <div className={styles.item}>
    <CreditCard className={styles.itemIcon} aria-hidden="true" />
    <div><p className={styles.label}>{portalCopy[locale].method}</p><strong><bdi>•••• {lastFour}</bdi></strong></div>
  </div>;
}
