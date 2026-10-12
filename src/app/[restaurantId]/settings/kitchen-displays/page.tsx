'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useI18n } from '@/lib/i18n';
import { usePermissions } from '@/lib/permissions-context';
import { ConfirmDialog } from '@/components/ds';
import { KitchenStationSettingsEditor } from '@/components/settings/KitchenStationSettings';
import '@/components/settings/pos-settings.css';
/** Dedicated kitchen profiles with the same leave protection as other POS settings. */
export default function Page() {
 const {restaurantId}=useParams();
 return <KitchenDisplays key={String(restaurantId)} rid={Number(restaurantId)}/>;
}
function KitchenDisplays({rid}:{rid:number}) {
 const {t}=useI18n(),{hasAnyPermission}=usePermissions(),router=useRouter();
 const [dirty,setDirty]=useState(false),[busy,setBusy]=useState(false),[leaving,setLeaving]=useState<string|null>(null);
 useEffect(()=>{
  const navigate=(e:MouseEvent)=>{
   if((!dirty&&!busy)||e.defaultPrevented||e.button!==0||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;
   const link=(e.target as Element).closest?.('a[href]');
   if(!(link instanceof HTMLAnchorElement)||link.target==='_blank'||link.hasAttribute('download')||link.origin!==location.origin||link.href===location.href)return;
   e.preventDefault();e.stopPropagation();if(!busy)setLeaving(link.pathname+link.search+link.hash);
  };
  document.addEventListener('click',navigate,true);return()=>document.removeEventListener('click',navigate,true);
 },[dirty,busy]);
 return <div className="pos-settings"><header className="pos-settings-header"><h1>{t('kdsSettingsTitle')}</h1></header><KitchenStationSettingsEditor rid={rid} editable={hasAnyPermission('settings.edit')} onDirtyChange={setDirty} onBusyChange={setBusy}/><ConfirmDialog open={leaving!==null} onOpenChange={open=>{if(!open)setLeaving(null);}} title={t('discardUnsavedChanges')} confirmLabel={t('discardChanges')} cancelLabel={t('cancel')} onConfirm={()=>{const path=leaving;setLeaving(null);if(path)router.push(path);}}/></div>;
}
