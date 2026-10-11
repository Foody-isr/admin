'use client';

import type { ReactNode } from 'react';
import { PageHead } from './ds/PageHead';

interface PageHeaderProps { title: string; subtitle?: string; actions?: ReactNode; }

/** Compatibility adapter for the shared workspace page header. */
export default function PageHeader({ title, subtitle, actions }: PageHeaderProps) {
  return <PageHead title={title} desc={subtitle} actions={actions} />;
}
