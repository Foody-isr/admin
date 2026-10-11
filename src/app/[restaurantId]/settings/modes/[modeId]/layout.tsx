 'use client';
import { useParams } from 'next/navigation';
import { POSSettingsWorkspace } from '@/components/settings/POSSettingsWorkspace';
/** Keep one staged policy while navigating between checkout sections. */
export default function Layout({children}:{children:React.ReactNode}) {
 const params=useParams<{modeId:string;section?:string[]}>();
 return <>{children}<POSSettingsWorkspace view="mode" modeId={params.modeId} section={params.section?.join('/')??''}/></>;
}
