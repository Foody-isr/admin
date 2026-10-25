import type { MetaTemplateKind, MetaWhatsAppTemplate, WhatsAppAttachment } from './api';

/** Check the positional variable mapping before submitting a native Meta Utility template. */
function positionalBody(body: string, count: number): boolean {
  if (!body.trim() || Array.from(body).length > 1024) return false;
  const matches = Array.from(body.matchAll(/\{\{([^{}]+)\}\}/g));
  const positions = new Set(matches.map(match => match[1]));
  return positions.size === count && Array.from({ length: count }, (_, i) => String(i + 1)).every(key => positions.has(key)) && !/[{}]/.test(body.replace(/\{\{([^{}]+)\}\}/g, ''));
}

/** Validate the current creation contract, including all variable positions. */
export function validMetaTemplateBody(kind: MetaTemplateKind, body: string): boolean {
  return positionalBody(body, { order_recap: 8, delivery_reminder: 4, order_status: 3, receipt: 4, satisfaction: 2 }[kind]);
}

/** Read the body regardless of the provider component order. */
export function metaTemplateBody(template?: MetaWhatsAppTemplate): string { return template?.components.find(component=>component.type==='BODY')?.text ?? ''; }
/** Return a supported media header format, or no attachment. */
export function metaTemplateHeader(template?: MetaWhatsAppTemplate): '' | 'IMAGE' | 'DOCUMENT' {
 const format=template?.components.find(component=>component.type==='HEADER')?.format;
 return format==='IMAGE' || format==='DOCUMENT' ? format : '';
}
/** Check that an explicit attachment choice matches the approved header. */
export function validWhatsAppAttachment(template: MetaWhatsAppTemplate,choice?: WhatsAppAttachment): boolean {
 const format=metaTemplateHeader(template);
 if(!format)return !choice?.asset_id && (!choice?.source || choice.source==='none');
 if(format==='IMAGE' && template.image_available && !choice?.asset_id && (!choice?.source || choice.source==='none' || choice.source==='meta'))return true;
 if(format==='DOCUMENT' && choice?.source==='receipt')return !choice.asset_id;
 return choice?.source==='fixed' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(choice.asset_id);
}
/** Limit selection to approved positional Utility bodies with optional photo/PDF headers. */
export function compatibleMetaTemplate(kind: MetaTemplateKind, template: MetaWhatsAppTemplate): boolean {
  if (!/^(fr|he|en)(_[A-Z]{2})?$/.test(template.language)) return false;
  if (template.status !== 'APPROVED' || template.category !== 'UTILITY' || template.parameter_format === 'NAMED' || !Array.isArray(template.components) || template.components.filter(c=>c.type==='BODY').length!==1 || template.components.filter(c=>c.type==='HEADER').length>1 || template.components.some(c=>c.type!=='BODY' && (c.type!=='HEADER' || !['IMAGE','DOCUMENT'].includes(c.format ?? '') || !!c.text))) return false;
  const body = metaTemplateBody(template);
  // Preserve imported five-variable reminder contracts alongside the current four-variable version.
  if (kind === 'delivery_reminder' && body.includes('{{5}}')) {
    return positionalBody(body, 5);
  }
  return validMetaTemplateBody(kind, body);
}

/** Prefer the image already attached to Meta's approved template when one is available. */
export function defaultWhatsAppAttachment(template?: MetaWhatsAppTemplate): WhatsAppAttachment {
 return {source:metaTemplateHeader(template)==='IMAGE' && template?.image_available?'meta':metaTemplateHeader(template)?'fixed':'none',asset_id:''};
}
