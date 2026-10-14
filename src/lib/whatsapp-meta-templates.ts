import type { MetaTemplateKind, MetaWhatsAppTemplate } from './api';

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

/** Limit selection to approved positional body-only Utility templates supported by Foody. */
export function compatibleMetaTemplate(kind: MetaTemplateKind, template: MetaWhatsAppTemplate): boolean {
  if (!/^(fr|he|en)(_[A-Z]{2})?$/.test(template.language)) return false;
  if (template.status !== 'APPROVED' || template.category !== 'UTILITY' || template.parameter_format === 'NAMED' || !Array.isArray(template.components) || template.components.length !== 1 || template.components[0].type !== 'BODY') return false;
  const body = template.components[0].text ?? '';
  // Preserve imported five-variable reminder contracts alongside the current four-variable version.
  if (kind === 'delivery_reminder' && body.includes('{{5}}')) {
    return positionalBody(body, 5);
  }
  return validMetaTemplateBody(kind, body);
}
