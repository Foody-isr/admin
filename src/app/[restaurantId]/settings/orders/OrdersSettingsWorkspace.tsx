'use client';

import { useParams } from 'next/navigation';
import { useI18n } from '@/lib/i18n';
import { usePermissions } from '@/lib/permissions-context';
import { Section } from '@/components/ds';
import { SettingsWorkspace } from '@/components/settings/SettingsWorkspace';
import { OrderWorkflowBuilder } from './OrderWorkflowBuilder';
import AvailabilitySettings from './AvailabilitySettings';
import ProcessingSettings from './ProcessingSettings';
import PreorderSettings from './PreorderSettings';
import OrdersOverview from './OrdersOverview';
import { ordersSettingsNavigation } from './navigation';

export type OrdersSettingsView = 'overview' | 'availability' | 'preorders' | 'processing' | 'workflow';

/** Route each ordering settings task to its dedicated editor. */
export default function OrdersSettingsPage({ view = 'overview' }: { view?: OrdersSettingsView }) {
  if (view === 'availability') return <AvailabilitySettings />;
  if (view === 'processing') return <ProcessingSettings />;
  if (view === 'preorders') return <PreorderSettings />;
  if (view === 'workflow') return <WorkflowSettings />;
  return <OrdersOverview />;
}
function WorkflowSettings() {
  const { restaurantId } = useParams(), rid = Number(restaurantId);
  const { t } = useI18n(); const { hasAnyPermission } = usePermissions();
  return <SettingsWorkspace title={t('orderWorkflow')} description={t('ordersWorkflowDesc')} activeId="workflow" navLabel={t('ordersSettingsNavigation')} items={ordersSettingsNavigation(rid,t)}>
    <Section title={t('orderWorkflow')} desc={t('workflowBuilderSectionDesc')}><OrderWorkflowBuilder key={rid} rid={rid} canEdit={hasAnyPermission('settings.edit')} /></Section>
  </SettingsWorkspace>;
}
