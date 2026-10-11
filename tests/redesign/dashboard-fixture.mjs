import { createFixture } from './fixtures.mjs';

/** In-memory preordering scenario; all names, orders and amounts are synthetic. */
export function createDashboardFixture({ empty = false, denied = false, permissions, referenceDate = new Date() } = {}) {
  const base = createFixture({ empty, denied, permissions });
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(referenceDate);
  const shift = (date, days) => new Date(Date.parse(`${date}T12:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
  const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();
  const service = shift(today, (5 - weekday + 7) % 7);
  const prior = shift(service, -7);
  const names = ['Client démo A', 'Client démo B', 'Client démo C', 'Client démo D', 'Client démo E'];
  const makeOrders = (date, previous) => Array.from({ length: previous ? 16 : 14 }, (_, i) => ({
    ...base.orders[i % Math.max(1, base.orders.length)],
    id: (previous ? 2100 : 2200) + i, restaurant_id: 1,
    customer_name: names[i % names.length], customer_phone: '',
    order_type: i % 5 === 0 ? 'pickup' : 'delivery',
    status: 'accepted', payment_status: !previous && i === 13 ? 'unpaid' : 'paid',
    total_amount: previous ? 640 : i === 13 ? 685 : 680,
    created_at: `${shift(date, i < 2 ? -4 : i < 6 ? -3 : -2)}T${String(9 + i % 8).padStart(2, '0')}:00:00Z`,
    is_scheduled: true, scheduled_for: `${date}T00:00:00Z`,
    items: [{ id: 3000 + i, menu_item_id: 1, name: 'Plat de démonstration', quantity: previous ? (i < 12 ? 12 : 11) : (i < 7 ? 13 : 12), unit_price: 48, total_price: 680, modifiers: [] }],
  }));
  const orders = empty ? [] : [...makeOrders(service, false), ...makeOrders(prior, true)];
  let preferences = { dashboard_date_basis: 'serie', orders_date_basis: 'serie', orders_default_tab: 'scheduled', dashboard_restaurant_default: 'serie', orders_restaurant_default: 'serie' };
  const scopeOrders = (q, previous = false) => {
    const from = q.get(previous ? 'prev_from' : 'from');
    const to = q.get(previous ? 'prev_to' : 'to');
    const serie = q.get('basis') === 'serie' || q.get('date_field') === 'serie';
    return orders.filter(order => {
      const date = (serie ? order.scheduled_for : order.created_at).slice(0, 10);
      return (!from || date >= from) && (!to || date <= to);
    });
  };
  const summary = list => ({ total_revenue: list.reduce((sum, order) => sum + order.total_amount, 0), total_orders: list.length,
    avg_ticket: list.length ? list.reduce((sum, order) => sum + order.total_amount, 0) / list.length : 0,
    items_sold: list.reduce((sum, order) => sum + order.items.reduce((n, item) => n + item.quantity, 0), 0) });
  function response(url, method = 'GET', body = {}, restaurantId = 1) {
    const { pathname: path, searchParams: q } = new URL(url, 'http://fixture.local');
    if (path === '/api/v1/display-preferences') {
      if (method === 'PUT') preferences = { ...preferences, ...body };
      return { json: preferences };
    }
    if (path === '/api/v1/restaurants/1' && method === 'GET') {
      const result = base.response(url, method, body, restaurantId);
      return { json: { restaurant: { ...result.json.restaurant, name: 'Mamie · Démonstration', dashboard_default_date_basis: 'serie', dashboard_revenue_mode: 'accepted_orders' } } };
    }
    if (path === '/api/v1/orders/series') return { json: { series: empty ? [] : [service, prior].map(date => ({ date, order_count: date === service ? 14 : 16, revenue: date === service ? 9525 : 10240 })) } };
    if (path === '/api/v1/orders') {
      let list = scopeOrders(q).filter(order => (!q.get('status') || q.get('status').split(',').includes(order.status)) && (!q.get('payment_status') || q.get('payment_status').split(',').includes(order.payment_status)));
      if (q.get('sort_dir') === 'desc') list.sort((a, b) => b.created_at.localeCompare(a.created_at));
      const offset = Number(q.get('offset') || 0);
      return { json: { orders: list.slice(offset, offset + Number(q.get('limit') || 25)), total: list.length } };
    }
    const detail = path.match(/^\/api\/v1\/orders\/(\d+)$/);
    if (detail && method === 'GET') return { json: { order: orders.find(order => order.id === Number(detail[1])) } };
    if (path === '/api/v1/analytics/comparison') {
      const day = date => {
        const stats = summary(orders.filter(order => order.created_at.startsWith(date)));
        return { date, gross_sales: stats.total_revenue, net_sales: stats.total_revenue, transactions: stats.total_orders, avg_sale: stats.avg_ticket, items_sold: stats.items_sold };
      };
      return { json: { current: day(q.get('date') || today), previous: day(q.get('compare') || shift(today, -7)), hourly: Array.from({ length: 24 }, (_, hour) => ({
        hour, current_count: orders.filter(order => order.created_at.startsWith(q.get('date') || today) && new Date(order.created_at).getUTCHours() + 3 === hour).length,
        previous_count: orders.filter(order => order.created_at.startsWith(q.get('compare') || shift(today, -7)) && new Date(order.created_at).getUTCHours() + 3 === hour).length,
      })) } };
    }
    if (path === '/api/v1/analytics/period') return { json: { current: summary(scopeOrders(q)), previous: summary(scopeOrders(q, true)) } };
    if (path === '/api/v1/analytics/daily') {
      const list = scopeOrders(q);
      if (q.get('basis') !== 'serie') {
        const end = q.get('date') || today;
        const start = shift(end, -(Math.min(Number(q.get('days') || 7), 90) - 1));
        list.splice(0, list.length, ...orders.filter(order => order.created_at.slice(0, 10) >= start && order.created_at.slice(0, 10) <= end));
      }
      const dates = [...new Set(list.map(order => order.created_at.slice(0, 10)))].sort();
      return { json: { days: dates.map(date => {
        const stats = summary(list.filter(order => order.created_at.startsWith(date)));
        return { date, gross_sales: stats.total_revenue, transactions: stats.total_orders, avg_sale: stats.avg_ticket, items_sold: stats.items_sold };
      }) } };
    }
    return base.response(url, method, body, restaurantId);
  }
  return { ...base, response, orders, service, prior };
}
