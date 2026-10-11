import { notFound } from 'next/navigation';

/** Edit a reusable POS mode or the restaurant defaults. */
export default async function Page({ params }: { params: Promise<{ modeId: string; section?: string[] }> }) {
 const resolved=await params;
 const section=resolved.section?.join('/')??'';
 if(!['','order-entry','covers','courses','cart','open-checks'].includes(section))notFound();
 return null;
}
