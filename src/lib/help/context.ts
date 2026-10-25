/** Maps a workspace route to a public topic without sending restaurant IDs or account data. */
export function supportTopicForPath(pathname: string): string {
  const [, , area, section] = pathname.split('/');
  if (area === 'delivery' || area === 'settings' && section === 'delivery') return 'delivery';
  return ({ menu: 'menu', kitchen: 'kitchen', orders: 'orders', website: 'website-qr', 'website-v3': 'website-qr',
    staff: 'staff', team: 'staff', analytics: 'analytics', reports: 'analytics', settings: 'settings',
    tables: 'tables-floors', restaurant: 'tables-floors', clients: 'customers', customers: 'customers', promotions: 'marketing', catering: 'catering', chain: 'chains', billing: 'account', calendar: 'orders', dashboard: 'getting-started' } as Record<string, string>)[area] || '';
}

/** Keeps completed exchanges within the public support transport budget, including Hebrew UTF-8. */
export function boundedSupportHistory(turns: { role: 'user' | 'assistant'; content: string }[]): { role: 'user' | 'assistant'; content: string }[] {
  const history = turns.slice(-8).map(({ role, content }) => ({ role, content }));
  while (history.length && (new TextEncoder().encode(JSON.stringify(history)).length > 24000 || history.reduce((sum, turn) => sum + turn.content.length, 0) > 20000)) history.splice(0, 2);
  return history;
}
