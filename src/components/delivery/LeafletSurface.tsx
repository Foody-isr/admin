'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import L from 'leaflet';
import { createLeafletContext, LeafletProvider, type LeafletContextInterface } from '@react-leaflet/core';

/** Pair each Leaflet instance with effect cleanup, including Strict Mode replay. */
export function LeafletSurface({ center, options, children }: {
  center: { lat: number; lng: number };
  options?: L.MapOptions;
  children: ReactNode;
}) {
  const container = useRef<HTMLDivElement>(null);
  const initial = useRef({ center, options });
  const [context, setContext] = useState<LeafletContextInterface | null>(null);
  useEffect(() => {
    if (!container.current) return;
    const map = L.map(container.current, initial.current.options).setView(initial.current.center, 13);
    setContext(createLeafletContext(map));
    return () => { map.remove(); };
  }, []);
  return <div ref={container} className="h-full w-full">{context && <LeafletProvider value={context}>{children}</LeafletProvider>}</div>;
}
