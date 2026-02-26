// Foody Admin API client — restaurant owner/manager portal
// Calls foodyserver at /api/v1/* using JWT auth.

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';
const TOKEN_KEY = 'foody_restaurant_token';
const USER_KEY = 'foody_restaurant_user';

// ─── Types ────────────────────────────────────────────────────────────────────

export type Role = 'superadmin' | 'owner' | 'manager' | 'cashier' | 'waiter' | 'chef';
export type PlanTier = 'starter' | 'premium' | 'enterprise';
export type SubscriptionStatus = 'trial' | 'active' | 'past_due' | 'deactivated' | 'cancelled';
export type OrderStatus =
  | 'pending_review' | 'accepted' | 'in_kitchen' | 'ready'
  | 'served' | 'picked_up' | 'delivered' | 'rejected' | 'scheduled'
  | 'ready_for_pickup' | 'ready_for_delivery' | 'out_for_delivery';
export type PaymentStatus = 'unpaid' | 'pending' | 'paid' | 'refunded';

export interface User {
  id: number;
  full_name: string;
  email: string;
  phone: string;
  role: Role;
  created_at: string;
}

export interface Restaurant {
  id: number;
  owner_id: number;
  name: string;
  slug: string;
  address: string;
  timezone: string;
  logo_url: string;
  cover_url: string;
  background_color: string;
  description: string;
  phone: string;
  delivery_enabled: boolean;
  pickup_enabled: boolean;
  is_active: boolean;
  created_at: string;
}

export interface RestaurantSettings {
  id: number;
  restaurant_id: number;
  require_order_approval: boolean;
  service_mode: string;
  scheduling_enabled: boolean;
  tips_enabled: boolean;
  auto_accept_prepaid: boolean;
  auto_send_to_kitchen: boolean;
  rush_mode: boolean;
}

export interface MenuCategory {
  id: number;
  restaurant_id: number;
  name: string;
  image_url: string;
  sort_order: number;
  items?: MenuItem[];
}

export interface MenuItemModifier {
  id: number;
  menu_item_id: number;
  name: string;
  action: 'add' | 'remove';
  category: string;
  price_delta: number;
  sort_order: number;
}

export interface MenuItem {
  id: number;
  category_id: number;
  name: string;
  description: string;
  image_url: string;
  price: number;
  is_active: boolean;
  sort_order: number;
  modifiers?: MenuItemModifier[];
}

export interface OrderItem {
  id: number;
  menu_item_id: number;
  name: string;
  price: number;
  quantity: number;
}

export interface Order {
  id: number;
  restaurant_id: number;
  order_type: 'dine_in' | 'pickup' | 'delivery';
  status: OrderStatus;
  payment_status: PaymentStatus;
  customer_name: string;
  customer_phone: string;
  total_amount: number;
  items: OrderItem[];
  created_at: string;
  table_number?: string;
}

export interface StaffMember {
  id: number;
  full_name: string;
  email: string;
  phone: string;
  role: Role;
}

export interface Subscription {
  id: number;
  restaurant_id: number;
  status: SubscriptionStatus;
  plan_tier: PlanTier;
  card_last_four?: string;
  card_brand?: string;
  current_period_start?: string;
  current_period_end?: string;
  trial_ends_at?: string;
  grace_period_until?: string;
  created_at: string;
  updated_at: string;
}

export interface SubscriptionEvent {
  id: number;
  subscription_id: number;
  event_type: string;
  amount?: number;
  currency?: string;
  created_at: string;
}

export interface SubscriptionDetail extends Subscription {
  events: SubscriptionEvent[];
}

export interface TodayStats {
  total_revenue: number;
  order_count: number;
  avg_order_value: number;
  pending_orders: number;
}

export interface TopSeller {
  item_name: string;
  quantity_sold: number;
  revenue: number;
}

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

async function apiFetch<T>(
  path: string,
  restaurantId?: number,
  options?: RequestInit
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(restaurantId ? { 'X-Restaurant-ID': String(restaurantId) } : {}),
    ...(options?.headers as Record<string, string>),
  };

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || body.message || `API error ${res.status}`);
  }
  return res.json();
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export interface LoginResponse {
  token: string;
  user: User;
  restaurant_ids: number[];
}

export async function login(email: string, password: string): Promise<LoginResponse> {
  const data = await apiFetch<{ token: string; user: User }>('/api/v1/auth/login', undefined, {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });

  const allowedRoles: Role[] = ['owner', 'manager'];
  if (!allowedRoles.includes(data.user.role)) {
    throw new Error('Access denied. Only restaurant owners and managers can log in here.');
  }

  // Decode JWT to get restaurant_ids from claims
  const claims = parseJwtClaims(data.token);
  const restaurantIds: number[] = claims?.restaurant_ids ?? [];

  localStorage.setItem(TOKEN_KEY, data.token);
  localStorage.setItem(USER_KEY, JSON.stringify(data.user));
  localStorage.setItem('foody_restaurant_ids', JSON.stringify(restaurantIds));

  return { token: data.token, user: data.user, restaurant_ids: restaurantIds };
}

export function logout() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem('foody_restaurant_ids');
}

export function getStoredUser(): User | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(USER_KEY);
  return raw ? JSON.parse(raw) : null;
}

export function getStoredRestaurantIds(): number[] {
  if (typeof window === 'undefined') return [];
  const raw = localStorage.getItem('foody_restaurant_ids');
  return raw ? JSON.parse(raw) : [];
}

export function isAuthenticated(): boolean {
  return !!getToken();
}

function parseJwtClaims(token: string): Record<string, unknown> | null {
  try {
    const payload = token.split('.')[1];
    return JSON.parse(atob(payload));
  } catch {
    return null;
  }
}

// ─── Restaurant ───────────────────────────────────────────────────────────────

export async function getRestaurant(id: number): Promise<Restaurant> {
  const data = await apiFetch<{ restaurant: Restaurant }>(
    `/api/v1/restaurants/${id}`, id
  );
  return data.restaurant;
}

export async function updateRestaurant(id: number, input: Partial<Restaurant>): Promise<Restaurant> {
  const data = await apiFetch<{ restaurant: Restaurant }>(
    `/api/v1/restaurants/${id}`, id,
    { method: 'PUT', body: JSON.stringify(input) }
  );
  return data.restaurant;
}

export async function getRestaurantSettings(id: number): Promise<RestaurantSettings> {
  const data = await apiFetch<{ settings: RestaurantSettings }>(
    `/api/v1/restaurants/${id}/settings`, id
  );
  return data.settings;
}

export async function updateRestaurantSettings(
  id: number, input: Partial<RestaurantSettings>
): Promise<RestaurantSettings> {
  const data = await apiFetch<{ settings: RestaurantSettings }>(
    `/api/v1/restaurants/${id}/settings`, id,
    { method: 'PUT', body: JSON.stringify(input) }
  );
  return data.settings;
}

// ─── Menu ─────────────────────────────────────────────────────────────────────

export async function getMenu(restaurantId: number): Promise<MenuCategory[]> {
  const data = await apiFetch<{ categories: MenuCategory[] }>(
    `/api/v1/menu/?restaurant_id=${restaurantId}`, restaurantId
  );
  return data.categories ?? [];
}

export async function createCategory(restaurantId: number, input: { name: string; sort_order?: number }): Promise<MenuCategory> {
  const data = await apiFetch<{ category: MenuCategory }>(
    `/api/v1/menu/categories?restaurant_id=${restaurantId}`, restaurantId,
    { method: 'POST', body: JSON.stringify(input) }
  );
  return data.category;
}

export async function updateCategory(restaurantId: number, id: number, input: Partial<MenuCategory>): Promise<MenuCategory> {
  const data = await apiFetch<{ category: MenuCategory }>(
    `/api/v1/menu/categories/${id}?restaurant_id=${restaurantId}`, restaurantId,
    { method: 'PUT', body: JSON.stringify(input) }
  );
  return data.category;
}

export async function deleteCategory(restaurantId: number, id: number): Promise<void> {
  await apiFetch<void>(
    `/api/v1/menu/categories/${id}?restaurant_id=${restaurantId}`, restaurantId,
    { method: 'DELETE' }
  );
}

export async function createMenuItem(restaurantId: number, input: Partial<MenuItem> & { category_id: number; name: string; price: number }): Promise<MenuItem> {
  const data = await apiFetch<{ item: MenuItem }>(
    `/api/v1/menu/items?restaurant_id=${restaurantId}`, restaurantId,
    { method: 'POST', body: JSON.stringify(input) }
  );
  return data.item;
}

export async function updateMenuItem(restaurantId: number, id: number, input: Partial<MenuItem>): Promise<MenuItem> {
  const data = await apiFetch<{ item: MenuItem }>(
    `/api/v1/menu/items/${id}?restaurant_id=${restaurantId}`, restaurantId,
    { method: 'PUT', body: JSON.stringify(input) }
  );
  return data.item;
}

export async function deleteMenuItem(restaurantId: number, id: number): Promise<void> {
  await apiFetch<void>(
    `/api/v1/menu/items/${id}?restaurant_id=${restaurantId}`, restaurantId,
    { method: 'DELETE' }
  );
}

// ─── Orders ───────────────────────────────────────────────────────────────────

export async function listOrders(restaurantId: number, params?: { status?: string; active?: boolean }): Promise<Order[]> {
  const qs = new URLSearchParams({ restaurant_id: String(restaurantId) });
  if (params?.status) qs.set('status', params.status);
  if (params?.active) qs.set('active', 'true');
  const data = await apiFetch<{ orders: Order[] }>(
    `/api/v1/orders?${qs.toString()}`, restaurantId
  );
  return data.orders ?? [];
}

export async function getOrder(restaurantId: number, orderId: number): Promise<Order> {
  const data = await apiFetch<{ order: Order }>(
    `/api/v1/orders/${orderId}?restaurant_id=${restaurantId}`, restaurantId
  );
  return data.order;
}

export async function acceptOrder(restaurantId: number, orderId: number): Promise<void> {
  await apiFetch<void>(`/api/v1/orders/${orderId}/accept?restaurant_id=${restaurantId}`, restaurantId, { method: 'POST' });
}

export async function rejectOrder(restaurantId: number, orderId: number): Promise<void> {
  await apiFetch<void>(`/api/v1/orders/${orderId}/reject?restaurant_id=${restaurantId}`, restaurantId, { method: 'POST' });
}

// ─── Analytics ───────────────────────────────────────────────────────────────

export async function getAnalyticsToday(restaurantId: number): Promise<TodayStats> {
  return apiFetch<TodayStats>(
    `/api/v1/analytics/today?restaurant_id=${restaurantId}`, restaurantId
  );
}

export async function getTopSellers(restaurantId: number): Promise<TopSeller[]> {
  const data = await apiFetch<{ items: TopSeller[] }>(
    `/api/v1/analytics/top-sellers?restaurant_id=${restaurantId}`, restaurantId
  );
  return data.items ?? [];
}

// ─── Staff ────────────────────────────────────────────────────────────────────

export async function listStaff(restaurantId: number): Promise<StaffMember[]> {
  const data = await apiFetch<{ staff: StaffMember[] }>(
    `/api/v1/restaurants/${restaurantId}/staff`, restaurantId
  );
  return data.staff ?? [];
}

export async function inviteStaff(restaurantId: number, input: {
  full_name: string;
  email: string;
  phone?: string;
  password: string;
  role: Role;
}): Promise<StaffMember> {
  const data = await apiFetch<{ staff_member: StaffMember }>(
    `/api/v1/restaurants/${restaurantId}/staff/invite`, restaurantId,
    { method: 'POST', body: JSON.stringify(input) }
  );
  return data.staff_member;
}

export async function updateStaffRole(restaurantId: number, userId: number, role: Role): Promise<void> {
  await apiFetch<void>(
    `/api/v1/restaurants/${restaurantId}/staff/${userId}/role`, restaurantId,
    { method: 'PUT', body: JSON.stringify({ role }) }
  );
}

export async function removeStaff(restaurantId: number, userId: number): Promise<void> {
  await apiFetch<void>(
    `/api/v1/restaurants/${restaurantId}/staff/${userId}`, restaurantId,
    { method: 'DELETE' }
  );
}

// ─── Subscription ─────────────────────────────────────────────────────────────

export async function getSubscription(restaurantId: number): Promise<SubscriptionDetail> {
  const data = await apiFetch<{ subscription: SubscriptionDetail }>(
    `/api/v1/restaurants/${restaurantId}/subscription`, restaurantId
  );
  return data.subscription;
}

export async function setupBilling(restaurantId: number): Promise<{ payment_url: string }> {
  return apiFetch<{ payment_url: string }>(
    `/api/v1/restaurants/${restaurantId}/subscription/setup-billing`, restaurantId,
    { method: 'POST' }
  );
}

export async function changePlan(restaurantId: number, planTier: PlanTier): Promise<void> {
  await apiFetch<void>(
    `/api/v1/restaurants/${restaurantId}/subscription/change-plan`, restaurantId,
    { method: 'POST', body: JSON.stringify({ plan_tier: planTier }) }
  );
}
