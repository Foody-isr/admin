import test from 'node:test';
import assert from 'node:assert/strict';
import { compatibleMetaTemplate, validMetaTemplateBody, metaTemplateBody, validWhatsAppAttachment } from './whatsapp-meta-templates';
import { orderNotificationTemplate } from './orders/twilio-templates';
import type { MetaTemplateKind, MetaWhatsAppTemplate } from './api';

test('suggested native Meta texts preserve the required mappings for all three languages', () => {
  for (const locale of ['fr', 'en', 'he'] as const) for (const kind of ['order_recap', 'delivery_reminder', 'order_status', 'receipt', 'satisfaction'] as MetaTemplateKind[]) assert.equal(validMetaTemplateBody(kind, orderNotificationTemplate(kind, locale)), true);
  for (const body of ['Bonjour {{1}}', 'Bonjour {{1}} {{2}} {{3}} {{5}}.', 'Bonjour {{1}} {{2}} {{3}} {{4}} {oops}.']) assert.equal(validMetaTemplateBody('delivery_reminder', body), false);
});
test('template selection excludes pending, reclassified, named and unsupported components', () => {
  const t: MetaWhatsAppTemplate = { id: '1', name: 'demo', language: 'fr', status: 'APPROVED', category: 'UTILITY', components: [{ type: 'BODY', text: orderNotificationTemplate('delivery_reminder', 'fr') }] };
  assert.equal(compatibleMetaTemplate('delivery_reminder', t), true);
  for (const patch of [{ status: 'PENDING' }, { category: 'MARKETING' }, { parameter_format: 'NAMED' }, { components: [...t.components, { type: 'BUTTONS' }] }]) assert.equal(compatibleMetaTemplate('delivery_reminder', { ...t, ...patch }), false);
});

test('media headers retain the body mapping and require a compatible explicit source',()=>{
 const body=orderNotificationTemplate('order_recap','fr');
 const template: MetaWhatsAppTemplate={id:'2',name:'photo',language:'fr',status:'APPROVED',category:'UTILITY',components:[{type:'HEADER',format:'IMAGE'},{type:'BODY',text:body}]};
 assert.equal(compatibleMetaTemplate('order_recap',template),true);assert.equal(metaTemplateBody(template),body);
 assert.equal(validWhatsAppAttachment(template),false);
 assert.equal(validWhatsAppAttachment(template,{source:'receipt',asset_id:''}),false);
 assert.equal(validWhatsAppAttachment(template,{source:'fixed',asset_id:'11111111-1111-4111-8111-111111111111'}),true);
 const pdf={...template,components:[{type:'HEADER',format:'DOCUMENT'},{type:'BODY',text:body}]};
 assert.equal(compatibleMetaTemplate('order_recap',pdf),true);
 assert.equal(validWhatsAppAttachment(pdf,{source:'receipt',asset_id:''}),true);
 assert.equal(validWhatsAppAttachment(pdf,{source:'receipt',asset_id:'foreign'}),false);
 assert.equal(compatibleMetaTemplate('order_recap',{...pdf,components:[{type:'HEADER',format:'VIDEO'},{type:'BODY',text:body}]}),false);
});

test('approved Meta images work automatically and preserve explicit local overrides', () => {
 const template: MetaWhatsAppTemplate={id:'3',name:'meta_photo',language:'fr',status:'APPROVED',category:'UTILITY',image_available:true,components:[{type:'HEADER',format:'IMAGE'},{type:'BODY',text:orderNotificationTemplate('order_recap','fr')}]};
 for (const source of ['', 'none', 'meta'] as const) assert.equal(validWhatsAppAttachment(template,{source,asset_id:''}),true);
 assert.equal(validWhatsAppAttachment(template),true);
 assert.equal(validWhatsAppAttachment(template,{source:'fixed',asset_id:''}),false);
 assert.equal(validWhatsAppAttachment(template,{source:'meta',asset_id:'11111111-1111-4111-8111-111111111111'}),false);
 assert.equal(validWhatsAppAttachment({...template,image_available:false},{source:'meta',asset_id:''}),false);
});
