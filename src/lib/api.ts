// Foody Admin API client — restaurant owner/manager portal
// Calls foodyserver at /api/v1/* using JWT auth.

export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';
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
  require_dine_in_prepayment: boolean;
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

export interface OrderItemModifier {
  id: number;
  order_item_id: number;
  menu_item_modifier_id: number;
  name: string;
  action: string;
  price_delta: number;
}

export interface OrderItem {
  id: number;
  menu_item_id: number;
  name: string;
  price: number;
  quantity: number;
  notes?: string;
  target_station?: string;
  modifiers?: OrderItemModifier[];
}

export interface Order {
  id: number;
  restaurant_id: number;
  order_type: 'dine_in' | 'pickup' | 'delivery';
  order_source?: string;
  status: OrderStatus;
  payment_status: PaymentStatus;
  customer_name: string;
  customer_phone: string;
  total_amount: number;
  items: OrderItem[];
  created_at: string;
  table_number?: string;
  table_code?: string;
  is_scheduled?: boolean;
  scheduled_for?: string;
  accepted_at?: string;
  in_kitchen_at?: string;
  ready_at?: string;
  completed_at?: string;
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
  payplus_recurring_uid?: string;
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

export interface WebsiteConfig {
  id: number;
  restaurant_id: number;
  primary_color: string;
  secondary_color: string;
  background_color: string;
  font_family: string;
  hero_layout: string;
  welcome_text: string;
  tagline: string;
  social_links: Record<string, string>;
  show_address: boolean;
  show_phone: boolean;
  show_hours: boolean;
  theme_mode: string;
  favicon_url: string;
  menu_layout: string;
  cart_style: string;
}

export interface TodayStats {
  total_revenue: number;
  total_orders: number;
}

export interface TopSeller {
  name: string;
  quantity: number;
  revenue: number;
}

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

export function getToken(): string | null {
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
    if (res.status === 401 && typeof window !== 'undefined') {
      // Token expired or revoked — clear stored auth and force re-login
      logout();
      window.location.href = '/login';
      // Stop execution — don't throw, which could trigger competing redirects
      return new Promise<never>(() => {});
    }
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
  const restaurantIds: number[] = (claims?.restaurant_ids as number[]) ?? [];

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

// ─── Account Setup (invite flow) ─────────────────────────────────────────────

export interface ValidateInviteResponse {
  valid: boolean;
  user: { email: string; full_name: string; phone: string };
  restaurant?: {
    id: number;
    name: string;
    slug: string;
    address: string;
    phone: string;
    pos_platform: string;
  };
}

/** Check if an invite token is valid before showing the setup form. */
export async function validateInviteToken(token: string): Promise<ValidateInviteResponse> {
  return apiFetch<ValidateInviteResponse>(`/api/v1/auth/validate-invite?token=${encodeURIComponent(token)}`);
}

/** Check if a password reset token is valid before showing the reset form. */
export async function validateResetToken(token: string): Promise<ValidateInviteResponse> {
  return apiFetch<ValidateInviteResponse>(`/api/v1/auth/validate-reset-token?token=${encodeURIComponent(token)}`);
}

/** Reset password using a reset token. Returns JWT so user is auto-logged in. */
export async function resetPassword(input: {
  token: string;
  password: string;
}): Promise<LoginResponse> {
  const data = await apiFetch<{ token: string; user: User }>('/api/v1/auth/reset-password', undefined, {
    method: 'POST',
    body: JSON.stringify(input),
  });

  const claims = parseJwtClaims(data.token);
  const restaurantIds: number[] = (claims?.restaurant_ids as number[]) ?? [];

  localStorage.setItem(TOKEN_KEY, data.token);
  localStorage.setItem(USER_KEY, JSON.stringify(data.user));
  localStorage.setItem('foody_restaurant_ids', JSON.stringify(restaurantIds));

  return { token: data.token, user: data.user, restaurant_ids: restaurantIds };
}

/** Complete account setup: set password, profile, restaurant details, and POS choice. */
export async function setupAccount(input: {
  token: string;
  password: string;
  full_name?: string;
  phone?: string;
  restaurant_name?: string;
  restaurant_slug?: string;
  restaurant_address?: string;
  restaurant_phone?: string;
  pos_platform?: string;
}): Promise<LoginResponse> {
  const data = await apiFetch<{ token: string; user: User }>('/api/v1/auth/setup-account', undefined, {
    method: 'POST',
    body: JSON.stringify(input),
  });

  // Store auth just like login
  const claims = parseJwtClaims(data.token);
  const restaurantIds: number[] = (claims?.restaurant_ids as number[]) ?? [];

  localStorage.setItem(TOKEN_KEY, data.token);
  localStorage.setItem(USER_KEY, JSON.stringify(data.user));
  localStorage.setItem('foody_restaurant_ids', JSON.stringify(restaurantIds));

  return { token: data.token, user: data.user, restaurant_ids: restaurantIds };
}

function parseJwtClaims(token: string): Record<string, unknown> | null {
  try {
    const payload = token.split('.')[1];
    return JSON.parse(atob(payload));
  } catch {
    return null;
  }
}

// ─── POS Downloads ────────────────────────────────────────────────────────────

export interface POSPlatformDownload {
  url: string;
  name: string;
  version?: string;
}

export interface POSDownloads {
  ipad?: POSPlatformDownload;
  macos?: POSPlatformDownload;
}

/** Fetch POS download URLs from the server (public, no auth). */
export async function getPosDownloads(): Promise<POSDownloads> {
  const res = await fetch(`${API_URL}/api/v1/public/pos-downloads`);
  if (!res.ok) return {};
  return res.json();
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

// ─── Modifiers ────────────────────────────────────────────────────────────────

export interface ModifierInput {
  menu_item_id: number;
  name: string;
  action: 'add' | 'remove';
  category: string;
  price_delta: number;
  is_active?: boolean;
  sort_order?: number;
}

export async function createModifier(restaurantId: number, input: ModifierInput): Promise<MenuItemModifier> {
  const data = await apiFetch<{ modifier: MenuItemModifier }>(
    `/api/v1/menu/modifiers?restaurant_id=${restaurantId}`, restaurantId,
    { method: 'POST', body: JSON.stringify(input) }
  );
  return data.modifier;
}

export async function updateModifier(restaurantId: number, id: number, input: Partial<ModifierInput>): Promise<MenuItemModifier> {
  const data = await apiFetch<{ modifier: MenuItemModifier }>(
    `/api/v1/menu/modifiers/${id}?restaurant_id=${restaurantId}`, restaurantId,
    { method: 'PUT', body: JSON.stringify(input) }
  );
  return data.modifier;
}

export async function deleteModifier(restaurantId: number, id: number): Promise<void> {
  await apiFetch<void>(
    `/api/v1/menu/modifiers/${id}?restaurant_id=${restaurantId}`, restaurantId,
    { method: 'DELETE' }
  );
}

// ─── AI Menu Import ──────────────────────────────────────────────────────────

export interface ExtractedItem {
  name: string;
  description: string;
  price: number;
}

export interface ExtractedCategory {
  name: string;
  items: ExtractedItem[];
}

export interface MenuExtraction {
  categories: ExtractedCategory[];
}

export async function importMenuAI(restaurantId: number, file: File): Promise<MenuExtraction> {
  const token = getToken();
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch(`${API_URL}/api/v1/menu/import?restaurant_id=${restaurantId}`, {
    method: 'POST',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'X-Restaurant-ID': String(restaurantId),
    },
    body: formData,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || body.message || `Import failed (${res.status})`);
  }
  const data = await res.json();
  return data.extraction;
}

export async function confirmMenuImport(restaurantId: number, extraction: MenuExtraction): Promise<MenuCategory[]> {
  const data = await apiFetch<{ categories: MenuCategory[] }>(
    `/api/v1/menu/import/confirm?restaurant_id=${restaurantId}`, restaurantId,
    { method: 'POST', body: JSON.stringify(extraction) }
  );
  return data.categories;
}

// ─── Orders ───────────────────────────────────────────────────────────────────

export interface ListOrdersParams {
  status?: string;
  active?: boolean;
  q?: string;
  type?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
  sort_by?: string;
  sort_dir?: string;
  payment_status?: string;
}

export interface ListOrdersResult {
  orders: Order[];
  total: number;
}

export async function listOrders(restaurantId: number, params?: ListOrdersParams): Promise<ListOrdersResult> {
  const qs = new URLSearchParams({ restaurant_id: String(restaurantId) });
  if (params?.status) qs.set('status', params.status);
  if (params?.active) qs.set('active', 'true');
  if (params?.q) qs.set('q', params.q);
  if (params?.type) qs.set('type', params.type);
  if (params?.from) qs.set('from', params.from);
  if (params?.to) qs.set('to', params.to);
  if (params?.limit != null) qs.set('limit', String(params.limit));
  if (params?.offset != null) qs.set('offset', String(params.offset));
  if (params?.sort_by) qs.set('sort_by', params.sort_by);
  if (params?.sort_dir) qs.set('sort_dir', params.sort_dir);
  if (params?.payment_status) qs.set('payment_status', params.payment_status);
  const data = await apiFetch<{ orders: Order[]; total: number }>(
    `/api/v1/orders?${qs.toString()}`, restaurantId
  );
  return { orders: data.orders ?? [], total: data.total ?? 0 };
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

export async function updateOrderStatus(restaurantId: number, orderId: number, status: OrderStatus): Promise<Order> {
  const data = await apiFetch<{ order: Order }>(`/api/v1/orders/${orderId}/status?restaurant_id=${restaurantId}`, restaurantId, {
    method: 'PUT',
    body: JSON.stringify({ status }),
  });
  return data.order;
}

// ─── Analytics ───────────────────────────────────────────────────────────────

export async function getAnalyticsToday(restaurantId: number): Promise<TodayStats> {
  const data = await apiFetch<{ summary: TodayStats }>(
    `/api/v1/analytics/today?restaurant_id=${restaurantId}`, restaurantId
  );
  return data.summary;
}

export async function getTopSellers(restaurantId: number): Promise<TopSeller[]> {
  const data = await apiFetch<{ top_items: TopSeller[] }>(
    `/api/v1/analytics/top-sellers?restaurant_id=${restaurantId}`, restaurantId
  );
  return data.top_items ?? [];
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

// ─── Website Config ──────────────────────────────────────────────────────────

export async function getWebsiteConfig(restaurantId: number): Promise<WebsiteConfig> {
  const data = await apiFetch<{ website_config: WebsiteConfig }>(
    `/api/v1/restaurants/${restaurantId}/website-config`, restaurantId
  );
  return data.website_config;
}

export async function updateWebsiteConfig(
  restaurantId: number, input: Partial<WebsiteConfig>
): Promise<WebsiteConfig> {
  const data = await apiFetch<{ website_config: WebsiteConfig }>(
    `/api/v1/restaurants/${restaurantId}/website-config`, restaurantId,
    { method: 'PUT', body: JSON.stringify(input) }
  );
  return data.website_config;
}

export async function resetWebsiteConfig(restaurantId: number): Promise<WebsiteConfig> {
  const data = await apiFetch<{ website_config: WebsiteConfig }>(
    `/api/v1/restaurants/${restaurantId}/website-config/reset`, restaurantId,
    { method: 'POST' }
  );
  return data.website_config;
}

// ─── Restaurant Branding Uploads ─────────────────────────────────────────────

export async function uploadRestaurantLogo(restaurantId: number, file: File): Promise<string> {
  const token = getToken();
  const formData = new FormData();
  formData.append('image', file);
  const res = await fetch(`${API_URL}/api/v1/restaurants/${restaurantId}/logo`, {
    method: 'POST',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'X-Restaurant-ID': String(restaurantId),
    },
    body: formData,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || body.message || `Upload failed (${res.status})`);
  }
  const data = await res.json();
  return data.image_url;
}

export async function uploadRestaurantBackground(restaurantId: number, file: File): Promise<string> {
  const token = getToken();
  const formData = new FormData();
  formData.append('image', file);
  const res = await fetch(`${API_URL}/api/v1/restaurants/${restaurantId}/background`, {
    method: 'POST',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'X-Restaurant-ID': String(restaurantId),
    },
    body: formData,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || body.message || `Upload failed (${res.status})`);
  }
  const data = await res.json();
  return data.image_url;
}

// ─── Website Sections ───────────────────────────────────────────────────────

export interface WebsiteSection {
  id: number;
  restaurant_id: number;
  section_type: string;
  page: string;
  sort_order: number;
  is_visible: boolean;
  layout: string;
  content: Record<string, any>;
  settings: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface SiteStylePreset {
  id: string;
  name: string;
  primary_color: string;
  secondary_color: string;
  font_family: string;
}

export async function listWebsiteSections(restaurantId: number): Promise<WebsiteSection[]> {
  const data = await apiFetch<{ sections: WebsiteSection[] }>(
    `/api/v1/restaurants/${restaurantId}/website-sections`, restaurantId
  );
  return data.sections || [];
}

export async function createWebsiteSection(
  restaurantId: number, input: Partial<WebsiteSection>
): Promise<WebsiteSection> {
  const data = await apiFetch<{ section: WebsiteSection }>(
    `/api/v1/restaurants/${restaurantId}/website-sections`, restaurantId,
    { method: 'POST', body: JSON.stringify(input) }
  );
  return data.section;
}

export async function updateWebsiteSection(
  restaurantId: number, sectionId: number, input: Partial<WebsiteSection>
): Promise<WebsiteSection> {
  const data = await apiFetch<{ section: WebsiteSection }>(
    `/api/v1/restaurants/${restaurantId}/website-sections/${sectionId}`, restaurantId,
    { method: 'PUT', body: JSON.stringify(input) }
  );
  return data.section;
}

export async function deleteWebsiteSection(
  restaurantId: number, sectionId: number
): Promise<void> {
  await apiFetch(
    `/api/v1/restaurants/${restaurantId}/website-sections/${sectionId}`, restaurantId,
    { method: 'DELETE' }
  );
}

export async function reorderWebsiteSections(
  restaurantId: number, order: { id: number; sort_order: number }[]
): Promise<WebsiteSection[]> {
  const data = await apiFetch<{ sections: WebsiteSection[] }>(
    `/api/v1/restaurants/${restaurantId}/website-sections-reorder`, restaurantId,
    { method: 'PUT', body: JSON.stringify(order) }
  );
  return data.sections || [];
}

export async function listSiteStyles(): Promise<SiteStylePreset[]> {
  const res = await fetch(`${API_URL}/api/v1/public/site-styles`);
  if (!res.ok) return [];
  const data = await res.json();
  return data.styles || [];
}
