'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { labListDrafts } from '@/lib/api';
import { useWs } from '@/lib/ws-context';
import type { Draft } from '../types';

export interface DraftQueueState {
  drafts: Draft[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  add: (drafts: Draft[]) => void;
  remove: (id: number) => void;
}

/** Share one restaurant-scoped queue, refreshed by polling and Lab events. */
export function useDraftQueue(restaurantId: number): DraftQueueState {
  const [drafts,setDrafts] = useState<Draft[]>([]);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState<string | null>(null);
  const request = useRef({sequence:0});
  const {lastEvent} = useWs();
  const refetch = useCallback(async () => {
    const sequence = ++request.current.sequence;
    try { const data=await labListDrafts(restaurantId,{status:['generating','ready','error']});if(sequence===request.current.sequence){setDrafts(data);setError(null);} }
    catch(cause){if(sequence===request.current.sequence)setError(cause instanceof Error?cause.message:String(cause));}
    finally{if(sequence===request.current.sequence)setLoading(false);}
  },[restaurantId]);
  useEffect(()=>{const scope=request.current;setLoading(true);void refetch();return()=>{scope.sequence+=1;};},[refetch]);
  const generating=drafts.some(d=>d.status==='generating');
  useEffect(()=>{if(!generating)return;const timer=setInterval(()=>{void refetch();},3000);return()=>clearInterval(timer);},[generating,refetch]);
  useEffect(()=>{if(!lastEvent?.type?.startsWith('lab.draft.'))return;const rid=lastEvent.payload?.restaurant_id;if(rid!=null&&Number(rid)!==restaurantId)return;void refetch();},[lastEvent,restaurantId,refetch]);
  const add=useCallback((items:Draft[])=>{request.current.sequence+=1;setDrafts(current=>[...items,...current.filter(d=>!items.some(n=>n.id===d.id))]);},[]);
  const remove=useCallback((id:number)=>{request.current.sequence+=1;setDrafts(current=>current.filter(d=>d.id!==id));},[]);
  return {drafts,loading,error,refetch,add,remove};
}
