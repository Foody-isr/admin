import test from 'node:test';
import assert from 'node:assert/strict';
import { compatibleMetaTemplate, validMetaTemplateBody } from './whatsapp-meta-templates';
import { orderNotificationTemplate } from './orders/twilio-templates';
import type { MetaTemplateKind, MetaWhatsAppTemplate } from './api';

test('suggested native Meta texts preserve the required mappings for all three languages', () => {
  for (const locale of ['fr', 'en', 'he'] as const) for (const kind of ['order_recap', 'delivery_reminder', 'order_status', 'receipt', 'satisfaction'] as MetaTemplateKind[]) assert.equal(validMetaTemplateBody(kind, orderNotificationTemplate(kind, locale)), true);
  for (const body of ['Bonjour {{1}}', 'Bonjour {{1}} {{2}} {{3}} {{5}}.', 'Bonjour {{1}} {{2}} {{3}} {{4}} {oops}.']) assert.equal(validMetaTemplateBody('delivery_reminder', body), false);
});
test('template selection excludes pending, reclassified, named and multimedia templates', () => {
  const t: MetaWhatsAppTemplate = { id: '1', name: 'demo', language: 'fr', status: 'APPROVED', category: 'UTILITY', components: [{ type: 'BODY', text: orderNotificationTemplate('delivery_reminder', 'fr') }] };
  assert.equal(compatibleMetaTemplate('delivery_reminder', t), true);
  for (const patch of [{ status: 'PENDING' }, { category: 'MARKETING' }, { parameter_format: 'NAMED' }, { components: [...t.components, { type: 'BUTTONS' }] }]) assert.equal(compatibleMetaTemplate('delivery_reminder', { ...t, ...patch }), false);
});
