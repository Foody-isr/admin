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
  cover_display_mode: string;
  description: string;
  phone: string;
  delivery_enabled: boolean;
  pickup_enabled: boolean;
  is_active: boolean;
  opening_hours_config?: OpeningHoursConfig;
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
  floor_plan_color_indicators: boolean;
  table_yellow_after_minutes: number;
  table_red_after_minutes: number;
  pickup_prep_time_minutes?: number;
}

export interface MenuAvailabilityHour {
  id: number;
  menu_id: number;
  day_of_week: number; // 0=Sun … 6=Sat
  open_time: string;   // "HH:MM" 24h
  close_time: string;  // "HH:MM" 24h
  is_closed: boolean;
}

export interface CategoryAvailabilityHour {
  id: number;
  category_id: number;
  day_of_week: number;
  open_time: string;
  close_time: string;
  is_closed: boolean;
}

export interface Location {
  id: number;
  restaurant_id: number;
  name: string;
  address: string;
  is_active: boolean;
  created_at: string;
}

export interface Menu {
  id: number;
  restaurant_id: number;
  name: string;
  sort_order: number;
  is_active: boolean;
  pos_enabled: boolean;
  web_enabled: boolean;
  follows_restaurant_hours: boolean;
  availability_hours?: MenuAvailabilityHour[];
  groups?: MenuGroup[];
  categories?: MenuCategory[]; // Deprecated: use groups
  locations?: Location[];
}

export interface GroupAvailabilityHour {
  id: number;
  menu_group_id: number;
  day_of_week: number;
  open_time: string;
  close_time: string;
  is_closed: boolean;
}

export interface MenuGroup {
  id: number;
  restaurant_id: number;
  menu_id: number;
  parent_id?: number;
  name: string;
  image_url: string;
  sort_order: number;
  pos_enabled: boolean;
  web_enabled: boolean;
  follows_menu_hours: boolean;
  is_hidden: boolean;
  items?: MenuItem[];
  availability_hours?: GroupAvailabilityHour[];
}

export interface MenuCategory {
  id: number;
  restaurant_id: number;
  menu_id?: number;
  parent_id?: number;
  name: string;
  image_url: string;
  sort_order: number;
  pos_enabled: boolean;
  web_enabled: boolean;
  follows_menu_hours: boolean;
  is_hidden: boolean;
  availability_hours?: CategoryAvailabilityHour[];
  items?: MenuItem[];
}

export interface MenuItemModifier {
  id: number;
  menu_item_id?: number;
  modifier_set_id?: number;
  name: string;
  kitchen_name: string;
  action: 'add' | 'remove';
  category: string;
  price_delta: number;
  is_active: boolean;
  is_preselected: boolean;
  hide_online: boolean;
  is_required: boolean;
  sort_order: number;
}

export interface ModifierSet {
  id: number;
  restaurant_id: number;
  name: string;
  display_name: string;
  is_required: boolean;
  allow_multiple: boolean;
  min_selections: number;
  max_selections: number;
  hide_on_receipt: boolean;
  use_conversational: boolean;
  sort_order: number;
  modifiers: MenuItemModifier[];
  menu_items?: { id: number; name: string }[];
  created_at: string;
}

export interface MenuItemVariant {
  id: number;
  group_id: number;
  name: string;
  price: number;
  online_price?: number | null;
  sku?: string;
  portion_size?: number;
  portion_size_unit?: string;
  is_active: boolean;
  sort_order: number;
}

export interface ItemVariantGroup {
  id: number;
  menu_item_id: number;
  title: string;
  sort_order: number;
  variants: MenuItemVariant[];
}

export type ItemType = 'food_and_beverage' | 'combo';

export interface ComboStepItem {
  id?: number;
  combo_step_id?: number;
  menu_item_id: number;
  option_id?: number | null;
  price_delta: number;
  menu_item?: MenuItem;
}

export interface ComboStep {
  id?: number;
  menu_item_id?: number;
  combo_menu_id?: number;
  name: string;
  min_picks: number;
  max_picks: number;
  sort_order: number;
  fixed_modifier_name?: string;
  items: ComboStepItem[];
}

export interface ComboStepInput {
  name: string;
  min_picks: number;
  max_picks: number;
  sort_order: number;
  fixed_modifier_name?: string;
  items: { menu_item_id: number; option_id?: number | null; price_delta: number }[];
}

export interface MenuItem {
  id: number;
  category_id: number;
  name: string;
  description: string;
  image_url: string;
  price: number;
  is_active: boolean;
  item_type: ItemType;
  sort_order: number;
  rotation_group?: string;
  recipe_yield?: number;
  recipe_yield_unit?: string;
  portion_size?: number;
  portion_size_unit?: string;
  modifiers?: MenuItemModifier[];
  modifier_sets?: ModifierSet[];
  variant_groups?: ItemVariantGroup[];
  option_sets?: OptionSet[];
  combo_steps?: ComboStep[];
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
  selected_variant_id?: number;
  selected_variant_name?: string;
  selected_variant_price?: number;
  modifiers?: OrderItemModifier[];
  combo_menu_id?: number;
  combo_item_id?: number;
  combo_group?: string;
  combo_name?: string;
  combo_price?: number;
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
  role_id?: number;
  role_name?: string;
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
  navbar_style: string;
  navbar_color: string;
  logo_size: number;
  hide_navbar_name: boolean;
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

// ─── Customer Insights Types ────────────────────────────────────────────────

export interface FavoriteItem {
  menu_item_id: number;
  name: string;
  quantity: number;
}

export interface CustomerInsight {
  customer_phone: string;
  customer_name: string;
  total_orders: number;
  total_spent: number;
  avg_order_value: number;
  first_order_date: string;
  last_order_date: string;
  days_since_last_order: number;
  favorite_items: FavoriteItem[];
  order_type_breakdown: Record<string, number>;
  payment_method_breakdown: Record<string, number>;
  order_source_breakdown: Record<string, number>;
  preferred_day_of_week: string;
  preferred_hour: number;
}

export interface CustomerListResult {
  customers: CustomerInsight[];
  total: number;
  page: number;
  per_page: number;
  total_active: number;
  total_at_risk: number;
  total_churned: number;
}

export interface OrderBrief {
  id: number;
  order_type: string;
  total_amount: number;
  payment_method: string;
  status: string;
  created_at: string;
  item_count: number;
}

export interface ProductBreakdown {
  menu_item_id: number;
  name: string;
  times_ordered: number;
  total_quantity: number;
  total_spent: number;
}

export interface MonthlySpend {
  month: string;
  total_spent: number;
  order_count: number;
}

export interface CustomerDetailResponse extends CustomerInsight {
  orders: OrderBrief[];
  product_breakdown: ProductBreakdown[];
  monthly_spending: MonthlySpend[];
}

// ─── Stock & Kitchen Types ───────────────────────────────────────────────────

export type StockUnit = 'kg' | 'g' | 'l' | 'ml' | 'unit' | 'pack' | 'box' | 'bag' | 'dose' | 'other';
export type StockTransactionType = 'receive' | 'waste' | 'adjust' | 'deduct' | 'produce';
export type PrepTransactionType = 'produce' | 'waste' | 'adjust' | 'deduct';

export interface StockItemAlias {
  id: number;
  stock_item_id: number;
  alias: string;
  language: string;
  created_at: string;
}

export interface StockItem {
  id: number;
  restaurant_id: number;
  name: string;
  unit: StockUnit;
  quantity: number;
  reorder_threshold: number;
  cost_per_unit: number;
  supplier: string;
  category: string;
  notes: string;
  unit_content?: number;
  unit_content_unit?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  aliases?: StockItemAlias[];
}

export interface StockCategory {
  name: string;
  color: string;
}

export interface StockTransaction {
  id: number;
  stock_item_id: number;
  restaurant_id: number;
  type: StockTransactionType;
  quantity_delta: number;
  notes: string;
  created_by_id: number;
  created_at: string;
  stock_item?: StockItem;
}

export interface StockItemInput {
  name: string;
  unit: StockUnit;
  quantity?: number;
  reorder_threshold?: number;
  cost_per_unit?: number;
  supplier?: string;
  category?: string;
  notes?: string;
  unit_content?: number;
  unit_content_unit?: string;
  is_active?: boolean;
}

export interface StockTransactionInput {
  stock_item_id: number;
  type: StockTransactionType;
  quantity_delta: number;
  notes?: string;
}

export interface PrepItemIngredient {
  id: number;
  prep_item_id: number;
  stock_item_id: number;
  quantity_needed: number;
  created_at: string;
  stock_item?: StockItem;
}

export interface PrepItem {
  id: number;
  restaurant_id: number;
  name: string;
  unit: StockUnit;
  quantity: number;
  yield_per_batch: number;
  reorder_threshold: number;
  shelf_life_hours: number;
  category: string;
  notes: string;
  is_active: boolean;
  cost_per_unit: number;
  created_at: string;
  updated_at: string;
  ingredients?: PrepItemIngredient[];
}

export interface PrepItemInput {
  name: string;
  unit: StockUnit;
  quantity?: number;
  yield_per_batch?: number;
  reorder_threshold?: number;
  shelf_life_hours?: number;
  category?: string;
  notes?: string;
  is_active?: boolean;
}

export interface PrepTransaction {
  id: number;
  prep_item_id: number;
  restaurant_id: number;
  type: PrepTransactionType;
  quantity_delta: number;
  notes: string;
  created_by_id: number;
  created_at: string;
  prep_item?: PrepItem;
}

export interface PrepTransactionInput {
  prep_item_id: number;
  type: PrepTransactionType;
  quantity_delta: number;
  notes?: string;
}

export interface ProduceBatchInput {
  quantity?: number;
  batches?: number;
}

export interface IngredientUsed {
  stock_item_id: number;
  stock_item_name: string;
  quantity_used: number;
  remaining: number;
}

export interface Shortage {
  stock_item_id: number;
  stock_item_name: string;
  required: number;
  available: number;
}

export interface ProduceBatchResult {
  prep_item: PrepItem;
  produced: number;
  ingredients: IngredientUsed[];
  insufficient: Shortage[];
}

export interface MenuItemIngredient {
  id: number;
  menu_item_id: number;
  stock_item_id?: number;
  prep_item_id?: number;
  quantity_needed: number;
  unit?: string;
  created_at: string;
  stock_item?: StockItem;
  prep_item?: PrepItem;
}

export interface IngredientInput {
  stock_item_id?: number;
  prep_item_id?: number;
  quantity_needed: number;
  unit?: string;
}

export interface PrepIngredientInput {
  stock_item_id: number;
  quantity_needed: number;
}

export interface DeliveryItem {
  original_name: string;
  translated_name: string;
  quantity: number;
  unit: string;
  pack_count: number;
  unit_size: number;
  unit_size_unit: string;
  category: string;
  estimated_cost: number;
  price_per_pack: number;
  total_price: number;
  matched_item_id?: number;
  matched_item_name: string;
  confidence: number;
  is_new: boolean;
}

export interface DeliveryExtraction {
  supplier_name: string;
  delivery_date: string;
  items: DeliveryItem[];
  raw_notes: string;
}

export interface ConfirmDeliveryItemInput {
  stock_item_id?: number;
  name: string;
  original_name: string;
  quantity: number;
  unit: string;
  category: string;
  cost_per_unit: number;
  pack_count?: number;
  price_per_pack?: number;
  total_price?: number;
  unit_size?: number;
  unit_size_unit?: string;
}

export interface ConfirmDeliveryInput {
  supplier_name: string;
  items: ConfirmDeliveryItemInput[];
}

export interface DailyPlanItem {
  prep_item: PrepItem;
  current_stock: number;
  predicted_demand: number;
  recommended_batches: number;
  ingredients_needed: { stock_item_id: number; stock_item_name: string; quantity_needed: number; available: number }[];
}

export interface DemandForecastItem {
  menu_item_id: number;
  menu_item_name: string;
  predicted_quantity: number;
  day_of_week: number;
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
  if (res.status === 204 || res.headers.get('content-length') === '0') {
    return undefined as T;
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

export async function getMenu(restaurantId: number): Promise<Menu[]> {
  const data = await apiFetch<{ menus: Menu[] }>(
    `/api/v1/menu/?restaurant_id=${restaurantId}`, restaurantId
  );
  return data.menus ?? [];
}

/** Flattens all categories from all menus — for pages that work with a global category list. */
/** Returns all item categories for a restaurant (global, independent of menus). */
export async function getAllCategories(restaurantId: number): Promise<MenuCategory[]> {
  const data = await apiFetch<{ categories: MenuCategory[] }>(
    `/api/v1/menu/item-categories?restaurant_id=${restaurantId}`, restaurantId
  );
  return data.categories ?? [];
}

/** Returns all items for a restaurant (global, independent of menus). */
export async function listAllItems(restaurantId: number): Promise<MenuItem[]> {
  const data = await apiFetch<{ items: MenuItem[] }>(
    `/api/v1/menu/items?restaurant_id=${restaurantId}`, restaurantId
  );
  return data.items ?? [];
}

export async function listMenus(restaurantId: number): Promise<Menu[]> {
  const data = await apiFetch<{ menus: Menu[] }>(
    `/api/v1/menu/menus?restaurant_id=${restaurantId}`, restaurantId
  );
  return data.menus ?? [];
}

export async function createMenu(restaurantId: number, input: Partial<Menu>): Promise<Menu> {
  const data = await apiFetch<{ menu: Menu }>(
    `/api/v1/menu/menus?restaurant_id=${restaurantId}`, restaurantId,
    { method: 'POST', body: JSON.stringify(input) }
  );
  return data.menu;
}

export async function updateMenu(restaurantId: number, id: number, input: Partial<Menu>): Promise<Menu> {
  const data = await apiFetch<{ menu: Menu }>(
    `/api/v1/menu/menus/${id}?restaurant_id=${restaurantId}`, restaurantId,
    { method: 'PUT', body: JSON.stringify(input) }
  );
  return data.menu;
}

export async function deleteMenu(restaurantId: number, id: number): Promise<void> {
  await apiFetch<void>(
    `/api/v1/menu/menus/${id}?restaurant_id=${restaurantId}`, restaurantId,
    { method: 'DELETE' }
  );
}

export async function getMenuHours(restaurantId: number, menuId: number): Promise<MenuAvailabilityHour[]> {
  const data = await apiFetch<{ hours: MenuAvailabilityHour[] }>(
    `/api/v1/menu/menus/${menuId}/hours?restaurant_id=${restaurantId}`, restaurantId
  );
  return data.hours ?? [];
}

export async function setMenuHours(restaurantId: number, menuId: number, hours: Omit<MenuAvailabilityHour, 'id' | 'menu_id'>[]): Promise<MenuAvailabilityHour[]> {
  const data = await apiFetch<{ hours: MenuAvailabilityHour[] }>(
    `/api/v1/menu/menus/${menuId}/hours?restaurant_id=${restaurantId}`, restaurantId,
    { method: 'PUT', body: JSON.stringify(hours) }
  );
  return data.hours ?? [];
}

export async function createCategory(restaurantId: number, input: { name: string; sort_order?: number; menu_id?: number; parent_id?: number; image_url?: string; pos_enabled?: boolean; web_enabled?: boolean; follows_menu_hours?: boolean; is_hidden?: boolean }): Promise<MenuCategory> {
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

export async function uploadCategoryImage(restaurantId: number, categoryId: number, file: File): Promise<string> {
  const form = new FormData();
  form.append('image', file);
  const token = getToken();
  const res = await fetch(`${API_URL}/api/v1/menu/categories/${categoryId}/image?restaurant_id=${restaurantId}`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Upload failed' }));
    throw new Error(err.error || 'Upload failed');
  }
  const data = await res.json();
  return data.image_url as string;
}

export async function getCategoryHours(restaurantId: number, categoryId: number): Promise<CategoryAvailabilityHour[]> {
  const data = await apiFetch<{ hours: CategoryAvailabilityHour[] }>(
    `/api/v1/menu/categories/${categoryId}/hours?restaurant_id=${restaurantId}`, restaurantId
  );
  return data.hours ?? [];
}

export async function setCategoryHours(restaurantId: number, categoryId: number, hours: Omit<CategoryAvailabilityHour, 'id' | 'category_id'>[]): Promise<CategoryAvailabilityHour[]> {
  const data = await apiFetch<{ hours: CategoryAvailabilityHour[] }>(
    `/api/v1/menu/categories/${categoryId}/hours?restaurant_id=${restaurantId}`, restaurantId,
    { method: 'PUT', body: JSON.stringify(hours) }
  );
  return data.hours ?? [];
}

// ─── Menu Groups ─────────────────────────────────────────────────────────────

export async function createGroup(restaurantId: number, input: Partial<MenuGroup> & { menu_id: number; name: string }): Promise<MenuGroup> {
  const data = await apiFetch<{ group: MenuGroup }>(
    `/api/v1/menu/groups?restaurant_id=${restaurantId}`, restaurantId,
    { method: 'POST', body: JSON.stringify(input) }
  );
  return data.group;
}

export async function updateGroup(restaurantId: number, id: number, input: Partial<MenuGroup>): Promise<MenuGroup> {
  const data = await apiFetch<{ group: MenuGroup }>(
    `/api/v1/menu/groups/${id}?restaurant_id=${restaurantId}`, restaurantId,
    { method: 'PUT', body: JSON.stringify(input) }
  );
  return data.group;
}

export async function deleteGroup(restaurantId: number, id: number): Promise<void> {
  await apiFetch<void>(
    `/api/v1/menu/groups/${id}?restaurant_id=${restaurantId}`, restaurantId,
    { method: 'DELETE' }
  );
}

export async function addItemsToGroup(restaurantId: number, groupId: number, itemIds: number[]): Promise<void> {
  await apiFetch<void>(
    `/api/v1/menu/groups/${groupId}/items?restaurant_id=${restaurantId}`, restaurantId,
    { method: 'POST', body: JSON.stringify({ item_ids: itemIds }) }
  );
}

export async function removeItemFromGroup(restaurantId: number, groupId: number, itemId: number): Promise<void> {
  await apiFetch<void>(
    `/api/v1/menu/groups/${groupId}/items/${itemId}?restaurant_id=${restaurantId}`, restaurantId,
    { method: 'DELETE' }
  );
}

export async function getGroupHours(restaurantId: number, groupId: number): Promise<GroupAvailabilityHour[]> {
  const data = await apiFetch<{ hours: GroupAvailabilityHour[] }>(
    `/api/v1/menu/groups/${groupId}/hours?restaurant_id=${restaurantId}`, restaurantId
  );
  return data.hours ?? [];
}

export async function setGroupHours(restaurantId: number, groupId: number, hours: Omit<GroupAvailabilityHour, 'id' | 'menu_group_id'>[]): Promise<GroupAvailabilityHour[]> {
  const data = await apiFetch<{ hours: GroupAvailabilityHour[] }>(
    `/api/v1/menu/groups/${groupId}/hours?restaurant_id=${restaurantId}`, restaurantId,
    { method: 'PUT', body: JSON.stringify(hours) }
  );
  return data.hours ?? [];
}

// --- Locations ---

export async function getLocations(restaurantId: number): Promise<Location[]> {
  const data = await apiFetch<{ locations: Location[] }>(
    `/api/v1/locations?restaurant_id=${restaurantId}`, restaurantId
  );
  return data.locations ?? [];
}

export async function createLocation(restaurantId: number, input: { name: string; address?: string; is_active?: boolean }): Promise<Location> {
  return apiFetch<Location>(
    `/api/v1/locations?restaurant_id=${restaurantId}`, restaurantId,
    { method: 'POST', body: JSON.stringify(input) }
  );
}

export async function updateLocation(restaurantId: number, id: number, input: { name: string; address?: string; is_active?: boolean }): Promise<Location> {
  return apiFetch<Location>(
    `/api/v1/locations/${id}?restaurant_id=${restaurantId}`, restaurantId,
    { method: 'PUT', body: JSON.stringify(input) }
  );
}

export async function deleteLocation(restaurantId: number, id: number): Promise<void> {
  await apiFetch<void>(
    `/api/v1/locations/${id}?restaurant_id=${restaurantId}`, restaurantId,
    { method: 'DELETE' }
  );
}

export async function getMenuLocations(restaurantId: number, menuId: number): Promise<Location[]> {
  const data = await apiFetch<{ locations: Location[] }>(
    `/api/v1/menu/menus/${menuId}/locations?restaurant_id=${restaurantId}`, restaurantId
  );
  return data.locations ?? [];
}

export async function setMenuLocations(restaurantId: number, menuId: number, locationIds: number[]): Promise<Location[]> {
  const data = await apiFetch<{ locations: Location[] }>(
    `/api/v1/menu/menus/${menuId}/locations?restaurant_id=${restaurantId}`, restaurantId,
    { method: 'PUT', body: JSON.stringify({ location_ids: locationIds }) }
  );
  return data.locations ?? [];
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

export async function uploadMenuItemImage(restaurantId: number, itemId: number, file: File): Promise<string> {
  const form = new FormData();
  form.append('image', file);
  const token = getToken();
  const res = await fetch(`${API_URL}/api/v1/menu/items/${itemId}/image?restaurant_id=${restaurantId}`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Upload failed' }));
    throw new Error(err.error || 'Upload failed');
  }
  const data = await res.json();
  return data.image_url as string;
}

// ─── Modifiers ────────────────────────────────────────────────────────────────

export interface ModifierInput {
  menu_item_id: number;
  name: string;
  action: 'add' | 'remove';
  category: string;
  price_delta: number;
  is_active?: boolean;
  is_required?: boolean;
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

// ─── Modifier Sets ────────────────────────────────────────────────────────────

export interface ModifierInSetInput {
  name: string;
  kitchen_name?: string;
  action?: 'add' | 'remove';
  price_delta?: number;
  is_active?: boolean;
  is_preselected?: boolean;
  hide_online?: boolean;
  sort_order?: number;
}

export interface ModifierSetInput {
  name: string;
  display_name?: string;
  is_required?: boolean;
  allow_multiple?: boolean;
  min_selections?: number;
  max_selections?: number;
  hide_on_receipt?: boolean;
  use_conversational?: boolean;
  sort_order?: number;
  modifiers?: ModifierInSetInput[];
}

export async function listModifierSets(restaurantId: number): Promise<ModifierSet[]> {
  const data = await apiFetch<{ modifier_sets: ModifierSet[] }>(
    `/api/v1/menu/modifier-sets?restaurant_id=${restaurantId}`, restaurantId
  );
  return data.modifier_sets;
}

export async function getModifierSet(restaurantId: number, id: number): Promise<ModifierSet> {
  const data = await apiFetch<{ modifier_set: ModifierSet }>(
    `/api/v1/menu/modifier-sets/${id}?restaurant_id=${restaurantId}`, restaurantId
  );
  return data.modifier_set;
}

export async function createModifierSet(restaurantId: number, input: ModifierSetInput): Promise<ModifierSet> {
  const data = await apiFetch<{ modifier_set: ModifierSet }>(
    `/api/v1/menu/modifier-sets?restaurant_id=${restaurantId}`, restaurantId,
    { method: 'POST', body: JSON.stringify(input) }
  );
  return data.modifier_set;
}

export async function updateModifierSet(restaurantId: number, id: number, input: ModifierSetInput): Promise<ModifierSet> {
  const data = await apiFetch<{ modifier_set: ModifierSet }>(
    `/api/v1/menu/modifier-sets/${id}?restaurant_id=${restaurantId}`, restaurantId,
    { method: 'PUT', body: JSON.stringify(input) }
  );
  return data.modifier_set;
}

export async function deleteModifierSet(restaurantId: number, id: number): Promise<void> {
  await apiFetch<void>(
    `/api/v1/menu/modifier-sets/${id}?restaurant_id=${restaurantId}`, restaurantId,
    { method: 'DELETE' }
  );
}

export async function attachModifierSetToItems(restaurantId: number, setId: number, menuItemIds: number[]): Promise<void> {
  await apiFetch<void>(
    `/api/v1/menu/modifier-sets/${setId}/items?restaurant_id=${restaurantId}`, restaurantId,
    { method: 'POST', body: JSON.stringify({ menu_item_ids: menuItemIds }) }
  );
}

export async function detachModifierSetFromItem(restaurantId: number, setId: number, menuItemId: number): Promise<void> {
  await apiFetch<void>(
    `/api/v1/menu/modifier-sets/${setId}/items/${menuItemId}?restaurant_id=${restaurantId}`, restaurantId,
    { method: 'DELETE' }
  );
}

export async function reorderModifierSetModifiers(restaurantId: number, setId: number, modifierIds: number[]): Promise<void> {
  await apiFetch<void>(
    `/api/v1/menu/modifier-sets/${setId}/modifiers/reorder?restaurant_id=${restaurantId}`, restaurantId,
    { method: 'PUT', body: JSON.stringify({ modifier_ids: modifierIds }) }
  );
}

export async function createModifierInSet(restaurantId: number, setId: number, input: ModifierInSetInput): Promise<MenuItemModifier> {
  const data = await apiFetch<{ modifier: MenuItemModifier }>(
    `/api/v1/menu/modifier-sets/${setId}/modifiers?restaurant_id=${restaurantId}`, restaurantId,
    { method: 'POST', body: JSON.stringify(input) }
  );
  return data.modifier;
}

export async function migrateLegacyModifiers(restaurantId: number): Promise<{ sets_created: number }> {
  return apiFetch<{ sets_created: number }>(
    `/api/v1/menu/modifier-sets/migrate-legacy?restaurant_id=${restaurantId}`, restaurantId,
    { method: 'POST' }
  );
}

// ─── Option Sets (reusable variant groups — Square "Item Options") ───────────

export interface OptionSetOption {
  id: number;
  option_set_id: number;
  name: string;
  price: number;
  online_price?: number | null;
  sku?: string;
  is_active: boolean;
  sort_order: number;
}

export interface OptionSet {
  id: number;
  restaurant_id: number;
  name: string;
  sort_order: number;
  options?: OptionSetOption[];
  menu_items?: MenuItem[];
}

export interface OptionInSetInput {
  name: string;
  price: number;
  online_price?: number | null;
  sku?: string;
  is_active: boolean;
  sort_order: number;
}

export interface OptionSetInput {
  name: string;
  sort_order?: number;
  options?: OptionInSetInput[];
}

export async function listOptionSets(restaurantId: number): Promise<OptionSet[]> {
  const data = await apiFetch<{ option_sets: OptionSet[] }>(
    `/api/v1/menu/option-sets?restaurant_id=${restaurantId}`, restaurantId
  );
  return data.option_sets ?? [];
}

export async function getOptionSet(restaurantId: number, id: number): Promise<OptionSet> {
  const data = await apiFetch<{ option_set: OptionSet }>(
    `/api/v1/menu/option-sets/${id}?restaurant_id=${restaurantId}`, restaurantId
  );
  return data.option_set;
}

export async function createOptionSet(restaurantId: number, input: OptionSetInput): Promise<OptionSet> {
  const data = await apiFetch<{ option_set: OptionSet }>(
    `/api/v1/menu/option-sets?restaurant_id=${restaurantId}`, restaurantId,
    { method: 'POST', body: JSON.stringify(input) }
  );
  return data.option_set;
}

export async function updateOptionSet(restaurantId: number, id: number, input: OptionSetInput): Promise<OptionSet> {
  const data = await apiFetch<{ option_set: OptionSet }>(
    `/api/v1/menu/option-sets/${id}?restaurant_id=${restaurantId}`, restaurantId,
    { method: 'PUT', body: JSON.stringify(input) }
  );
  return data.option_set;
}

export async function deleteOptionSet(restaurantId: number, id: number): Promise<void> {
  await apiFetch<void>(
    `/api/v1/menu/option-sets/${id}?restaurant_id=${restaurantId}`, restaurantId,
    { method: 'DELETE' }
  );
}

export async function attachOptionSetToItems(restaurantId: number, setId: number, menuItemIds: number[]): Promise<void> {
  await apiFetch<void>(
    `/api/v1/menu/option-sets/${setId}/items?restaurant_id=${restaurantId}`, restaurantId,
    { method: 'POST', body: JSON.stringify({ menu_item_ids: menuItemIds }) }
  );
}

export async function detachOptionSetFromItem(restaurantId: number, setId: number, itemId: number): Promise<void> {
  await apiFetch<void>(
    `/api/v1/menu/option-sets/${setId}/items/${itemId}?restaurant_id=${restaurantId}`, restaurantId,
    { method: 'DELETE' }
  );
}

export async function createOptionInSet(restaurantId: number, setId: number, input: OptionInSetInput): Promise<OptionSetOption> {
  const data = await apiFetch<{ option: OptionSetOption }>(
    `/api/v1/menu/option-sets/${setId}/options?restaurant_id=${restaurantId}`, restaurantId,
    { method: 'POST', body: JSON.stringify(input) }
  );
  return data.option;
}

// ─── Per-item option pricing ────────────────────────────────────────────────

export interface ItemOptionOverride {
  id: number;
  option_set_id: number;
  menu_item_id: number;
  option_id: number;
  price: number;
  online_price?: number | null;
  sku: string;
  portion_size?: number;
  portion_size_unit?: string;
  is_active: boolean;
}

export interface ItemOptionPriceInput {
  price: number;
  online_price?: number | null;
  sku?: string;
  portion_size?: number;
  portion_size_unit?: string;
  is_active: boolean;
}

export async function setItemOptionPrice(restaurantId: number, setId: number, itemId: number, optionId: number, input: ItemOptionPriceInput): Promise<ItemOptionOverride> {
  const data = await apiFetch<{ item_option: ItemOptionOverride }>(
    `/api/v1/menu/option-sets/${setId}/items/${itemId}/options/${optionId}?restaurant_id=${restaurantId}`, restaurantId,
    { method: 'PUT', body: JSON.stringify(input) }
  );
  return data.item_option;
}

export async function getItemOptionPrices(restaurantId: number, itemId: number): Promise<ItemOptionOverride[]> {
  const data = await apiFetch<{ item_options: ItemOptionOverride[] }>(
    `/api/v1/menu/items/${itemId}/option-prices?restaurant_id=${restaurantId}`, restaurantId
  );
  return data.item_options ?? [];
}

export async function migrateVariantsToOptionSets(restaurantId: number): Promise<number> {
  const data = await apiFetch<{ sets_created: number }>(
    `/api/v1/menu/option-sets/migrate-variants?restaurant_id=${restaurantId}`, restaurantId,
    { method: 'POST' }
  );
  return data.sets_created;
}

// ─── Item Variants (legacy per-item — prefer Option Sets) ───────────────────

export interface VariantInput {
  name: string;
  price: number;
  online_price?: number | null;
  sku?: string;
  is_active: boolean;
  sort_order: number;
}

export interface VariantGroupInput {
  title: string;
  sort_order: number;
  variants?: VariantInput[];
}

export async function listVariantGroups(restaurantId: number, itemId: number): Promise<ItemVariantGroup[]> {
  const data = await apiFetch<{ variant_groups: ItemVariantGroup[] }>(
    `/api/v1/menu/items/${itemId}/variants?restaurant_id=${restaurantId}`, restaurantId
  );
  return data.variant_groups;
}

export async function createVariantGroup(restaurantId: number, itemId: number, input: VariantGroupInput): Promise<ItemVariantGroup> {
  const data = await apiFetch<{ variant_group: ItemVariantGroup }>(
    `/api/v1/menu/items/${itemId}/variants?restaurant_id=${restaurantId}`, restaurantId,
    { method: 'POST', body: JSON.stringify(input) }
  );
  return data.variant_group;
}

export async function updateVariantGroup(restaurantId: number, itemId: number, groupId: number, input: VariantGroupInput): Promise<ItemVariantGroup> {
  const data = await apiFetch<{ variant_group: ItemVariantGroup }>(
    `/api/v1/menu/items/${itemId}/variants/${groupId}?restaurant_id=${restaurantId}`, restaurantId,
    { method: 'PUT', body: JSON.stringify(input) }
  );
  return data.variant_group;
}

export async function deleteVariantGroup(restaurantId: number, itemId: number, groupId: number): Promise<void> {
  await apiFetch<void>(
    `/api/v1/menu/items/${itemId}/variants/${groupId}?restaurant_id=${restaurantId}`, restaurantId,
    { method: 'DELETE' }
  );
}

export async function createVariant(restaurantId: number, itemId: number, groupId: number, input: VariantInput): Promise<MenuItemVariant> {
  const data = await apiFetch<{ variant: MenuItemVariant }>(
    `/api/v1/menu/items/${itemId}/variants/${groupId}/items?restaurant_id=${restaurantId}`, restaurantId,
    { method: 'POST', body: JSON.stringify(input) }
  );
  return data.variant;
}

export async function updateVariant(restaurantId: number, itemId: number, groupId: number, variantId: number, input: VariantInput): Promise<MenuItemVariant> {
  const data = await apiFetch<{ variant: MenuItemVariant }>(
    `/api/v1/menu/items/${itemId}/variants/${groupId}/items/${variantId}?restaurant_id=${restaurantId}`, restaurantId,
    { method: 'PUT', body: JSON.stringify(input) }
  );
  return data.variant;
}

export async function deleteVariant(restaurantId: number, itemId: number, groupId: number, variantId: number): Promise<void> {
  await apiFetch<void>(
    `/api/v1/menu/items/${itemId}/variants/${groupId}/items/${variantId}?restaurant_id=${restaurantId}`, restaurantId,
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

export async function importMenuAI(restaurantId: number, file: File, lang?: string): Promise<MenuExtraction> {
  const token = getToken();
  const formData = new FormData();
  formData.append('file', file);
  const params = new URLSearchParams({ restaurant_id: String(restaurantId) });
  if (lang) params.set('lang', lang);
  const res = await fetch(`${API_URL}/api/v1/menu/import?${params}`, {
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

// ─── Customer Insights ──────────────────────────────────────────────────────

export async function getAnalyticsCustomers(
  restaurantId: number,
  params?: { sort_by?: string; sort_dir?: string; search?: string; page?: number; per_page?: number }
): Promise<CustomerListResult> {
  const query = new URLSearchParams({ restaurant_id: String(restaurantId) });
  if (params?.sort_by) query.set('sort_by', params.sort_by);
  if (params?.sort_dir) query.set('sort_dir', params.sort_dir);
  if (params?.search) query.set('search', params.search);
  if (params?.page) query.set('page', String(params.page));
  if (params?.per_page) query.set('per_page', String(params.per_page));
  return apiFetch<CustomerListResult>(`/api/v1/analytics/customers?${query}`, restaurantId);
}

export async function getAnalyticsCustomerDetail(
  restaurantId: number,
  phone: string
): Promise<CustomerDetailResponse> {
  const data = await apiFetch<{ customer: CustomerDetailResponse }>(
    `/api/v1/analytics/customers/${encodeURIComponent(phone)}?restaurant_id=${restaurantId}`,
    restaurantId
  );
  return data.customer;
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
  role?: Role;
  role_id?: number;
}): Promise<StaffMember> {
  const data = await apiFetch<{ staff_member: StaffMember }>(
    `/api/v1/restaurants/${restaurantId}/staff/invite`, restaurantId,
    { method: 'POST', body: JSON.stringify(input) }
  );
  return data.staff_member;
}

export async function updateStaffRole(
  restaurantId: number, userId: number, update: { role?: Role; role_id?: number }
): Promise<void> {
  await apiFetch<void>(
    `/api/v1/restaurants/${restaurantId}/staff/${userId}/role`, restaurantId,
    { method: 'PUT', body: JSON.stringify(update) }
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

export async function resetWebsiteConfig(restaurantId: number): Promise<{ website_config: WebsiteConfig; sections: WebsiteSection[] }> {
  const data = await apiFetch<{ website_config: WebsiteConfig; sections: WebsiteSection[] }>(
    `/api/v1/restaurants/${restaurantId}/website-config/reset`, restaurantId,
    { method: 'POST' }
  );
  return data;
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

export async function uploadSectionImage(restaurantId: number, file: File): Promise<string> {
  const token = getToken();
  const formData = new FormData();
  formData.append('image', file);
  const res = await fetch(`${API_URL}/api/v1/restaurants/${restaurantId}/sections/upload-image`, {
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

// ─── Stock Management ────────────────────────────────────────────────────────

export async function listStockItems(
  restaurantId: number,
  params?: { category?: string; search?: string; low_stock?: boolean; is_active?: boolean }
): Promise<StockItem[]> {
  const qs = new URLSearchParams({ restaurant_id: String(restaurantId) });
  if (params?.category) qs.set('category', params.category);
  if (params?.search) qs.set('search', params.search);
  if (params?.low_stock) qs.set('low_stock', 'true');
  if (params?.is_active !== undefined) qs.set('is_active', String(params.is_active));
  const data = await apiFetch<{ items: StockItem[] }>(`/api/v1/stock/items?${qs}`, restaurantId);
  return data.items ?? [];
}

export async function getStockItem(restaurantId: number, id: number): Promise<StockItem> {
  const data = await apiFetch<{ item: StockItem }>(`/api/v1/stock/items/${id}?restaurant_id=${restaurantId}`, restaurantId);
  return data.item;
}

export async function createStockItem(restaurantId: number, input: StockItemInput): Promise<StockItem> {
  const data = await apiFetch<{ item: StockItem }>(`/api/v1/stock/items?restaurant_id=${restaurantId}`, restaurantId, {
    method: 'POST', body: JSON.stringify(input),
  });
  return data.item;
}

export async function updateStockItem(restaurantId: number, id: number, input: Partial<StockItemInput>): Promise<StockItem> {
  const data = await apiFetch<{ item: StockItem }>(`/api/v1/stock/items/${id}?restaurant_id=${restaurantId}`, restaurantId, {
    method: 'PUT', body: JSON.stringify(input),
  });
  return data.item;
}

export async function deleteStockItem(restaurantId: number, id: number): Promise<void> {
  await apiFetch(`/api/v1/stock/items/${id}?restaurant_id=${restaurantId}`, restaurantId, { method: 'DELETE' });
}

export async function batchUpdateStockCategory(
  restaurantId: number, input: { item_ids: number[]; category: string }
): Promise<void> {
  await apiFetch(`/api/v1/stock/items/batch-category?restaurant_id=${restaurantId}`, restaurantId, {
    method: 'PATCH', body: JSON.stringify(input),
  });
}

export async function listStockTransactions(
  restaurantId: number, params?: { stock_item_id?: number; limit?: number }
): Promise<StockTransaction[]> {
  const qs = new URLSearchParams({ restaurant_id: String(restaurantId) });
  if (params?.stock_item_id) qs.set('stock_item_id', String(params.stock_item_id));
  if (params?.limit) qs.set('limit', String(params.limit));
  const data = await apiFetch<{ transactions: StockTransaction[] }>(`/api/v1/stock/transactions?${qs}`, restaurantId);
  return data.transactions ?? [];
}

export async function createStockTransaction(restaurantId: number, input: StockTransactionInput): Promise<StockTransaction> {
  const data = await apiFetch<{ transaction: StockTransaction }>(`/api/v1/stock/transactions?restaurant_id=${restaurantId}`, restaurantId, {
    method: 'POST', body: JSON.stringify(input),
  });
  return data.transaction;
}

export async function getStockCategories(restaurantId: number): Promise<StockCategory[]> {
  const data = await apiFetch<{ categories: StockCategory[] }>(`/api/v1/stock/categories?restaurant_id=${restaurantId}`, restaurantId);
  return data.categories ?? [];
}

export async function updateStockCategoryColor(restaurantId: number, input: { category: string; color: string }): Promise<void> {
  await apiFetch(`/api/v1/stock/category-color?restaurant_id=${restaurantId}`, restaurantId, {
    method: 'PUT', body: JSON.stringify(input),
  });
}

export async function getLowStockCount(restaurantId: number): Promise<number> {
  const data = await apiFetch<{ count: number }>(`/api/v1/stock/low-stock-count?restaurant_id=${restaurantId}`, restaurantId);
  return data.count ?? 0;
}

export async function getMenuItemIngredients(restaurantId: number, menuItemId: number): Promise<MenuItemIngredient[]> {
  const data = await apiFetch<{ ingredients: MenuItemIngredient[] }>(
    `/api/v1/stock/menu-items/${menuItemId}/ingredients?restaurant_id=${restaurantId}`, restaurantId
  );
  return data.ingredients ?? [];
}

export async function setMenuItemIngredients(restaurantId: number, menuItemId: number, ingredients: IngredientInput[]): Promise<MenuItemIngredient[]> {
  const data = await apiFetch<{ ingredients: MenuItemIngredient[] }>(
    `/api/v1/stock/menu-items/${menuItemId}/ingredients?restaurant_id=${restaurantId}`, restaurantId,
    { method: 'PUT', body: JSON.stringify({ ingredients }) }
  );
  return data.ingredients ?? [];
}

export async function getStockItemMenuLinks(restaurantId: number, stockItemId: number): Promise<MenuItem[]> {
  const data = await apiFetch<{ menu_items: MenuItem[] }>(
    `/api/v1/stock/items/${stockItemId}/menu-links?restaurant_id=${restaurantId}`, restaurantId
  );
  return data.menu_items ?? [];
}

export async function importDelivery(restaurantId: number, file: File, lang?: string, method?: string, supplier?: string): Promise<DeliveryExtraction> {
  const token = getToken();
  const formData = new FormData();
  formData.append('file', file);
  const params = new URLSearchParams({ restaurant_id: String(restaurantId) });
  if (lang) params.set('lang', lang);
  if (method) params.set('method', method);
  if (supplier) params.set('supplier', supplier);
  const res = await fetch(`${API_URL}/api/v1/stock/import/delivery?${params}`, {
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

export async function confirmDelivery(restaurantId: number, input: ConfirmDeliveryInput): Promise<void> {
  await apiFetch(`/api/v1/stock/import/delivery/confirm?restaurant_id=${restaurantId}`, restaurantId, {
    method: 'POST', body: JSON.stringify(input),
  });
}

// ─── Recipe Import ────────────────────────────────────────────────

export interface ExtractedIngredient {
  original_name: string;
  translated_name: string;
  quantity: number;
  unit: string;
  matched_item_id?: number | null;
  matched_item_name: string;
  confidence: number;
  is_new: boolean;
}

export interface ExtractedRecipe {
  dish_name: string;
  dish_description: string;
  servings: number;
  total_yield: number;
  total_yield_unit: string;
  ingredients: ExtractedIngredient[];
  matched_menu_item_id?: number | null;
  matched_menu_item_name: string;
  confidence: number;
}

export interface RecipeExtraction {
  recipes: ExtractedRecipe[];
}

export interface ConfirmRecipeIngredientInput {
  stock_item_id?: number | null;
  name: string;
  original_name: string;
  quantity_needed: number;
  unit: string;
  category: string;
}

export interface ConfirmRecipeItemInput {
  menu_item_id: number;
  recipe_yield: number;
  recipe_yield_unit: string;
  ingredients: ConfirmRecipeIngredientInput[];
}

export interface ConfirmRecipeInput {
  recipes: ConfirmRecipeItemInput[];
}

export async function importRecipesFromFile(restaurantId: number, file: File, lang?: string): Promise<RecipeExtraction> {
  const token = getToken();
  const formData = new FormData();
  formData.append('file', file);
  const params = new URLSearchParams({ restaurant_id: String(restaurantId) });
  if (lang) params.set('lang', lang);
  const res = await fetch(`${API_URL}/api/v1/stock/import/recipes?${params}`, {
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

export async function importRecipesFromText(restaurantId: number, text: string, lang?: string): Promise<RecipeExtraction> {
  const data = await apiFetch<{ extraction: RecipeExtraction }>(
    `/api/v1/stock/import/recipes/text?restaurant_id=${restaurantId}`, restaurantId,
    { method: 'POST', body: JSON.stringify({ text, lang: lang || 'en' }) }
  );
  return data.extraction;
}

export async function confirmRecipes(restaurantId: number, input: ConfirmRecipeInput): Promise<void> {
  await apiFetch(`/api/v1/stock/import/recipes/confirm?restaurant_id=${restaurantId}`, restaurantId, {
    method: 'POST', body: JSON.stringify(input),
  });
}

export async function setRecipeYield(restaurantId: number, menuItemId: number, recipeYield: number, recipeYieldUnit: string): Promise<void> {
  await apiFetch(`/api/v1/stock/menu-items/${menuItemId}/yield?restaurant_id=${restaurantId}`, restaurantId, {
    method: 'PUT', body: JSON.stringify({ recipe_yield: recipeYield, recipe_yield_unit: recipeYieldUnit }),
  });
}

export async function getDemandForecast(
  restaurantId: number, params?: { day_of_week?: number; weeks?: number }
): Promise<DemandForecastItem[]> {
  const qs = new URLSearchParams({ restaurant_id: String(restaurantId) });
  if (params?.day_of_week !== undefined) qs.set('day_of_week', String(params.day_of_week));
  if (params?.weeks) qs.set('weeks', String(params.weeks));
  const data = await apiFetch<{ items: DemandForecastItem[] }>(`/api/v1/stock/forecast?${qs}`, restaurantId);
  return data.items ?? [];
}

// ─── Prep / Recipes ──────────────────────────────────────────────────────────

export async function listPrepItems(
  restaurantId: number,
  params?: { category?: string; search?: string; low_stock?: boolean; is_active?: boolean }
): Promise<PrepItem[]> {
  const qs = new URLSearchParams({ restaurant_id: String(restaurantId) });
  if (params?.category) qs.set('category', params.category);
  if (params?.search) qs.set('search', params.search);
  if (params?.low_stock) qs.set('low_stock', 'true');
  if (params?.is_active !== undefined) qs.set('is_active', String(params.is_active));
  const data = await apiFetch<{ items: PrepItem[] }>(`/api/v1/prep/items?${qs}`, restaurantId);
  return data.items ?? [];
}

export async function getPrepItem(restaurantId: number, id: number): Promise<PrepItem> {
  const data = await apiFetch<{ item: PrepItem }>(`/api/v1/prep/items/${id}?restaurant_id=${restaurantId}`, restaurantId);
  return data.item;
}

export async function createPrepItem(restaurantId: number, input: PrepItemInput): Promise<PrepItem> {
  const data = await apiFetch<{ item: PrepItem }>(`/api/v1/prep/items?restaurant_id=${restaurantId}`, restaurantId, {
    method: 'POST', body: JSON.stringify(input),
  });
  return data.item;
}

export async function updatePrepItem(restaurantId: number, id: number, input: Partial<PrepItemInput>): Promise<PrepItem> {
  const data = await apiFetch<{ item: PrepItem }>(`/api/v1/prep/items/${id}?restaurant_id=${restaurantId}`, restaurantId, {
    method: 'PUT', body: JSON.stringify(input),
  });
  return data.item;
}

export async function deletePrepItem(restaurantId: number, id: number): Promise<void> {
  await apiFetch(`/api/v1/prep/items/${id}?restaurant_id=${restaurantId}`, restaurantId, { method: 'DELETE' });
}

export async function getPrepIngredients(restaurantId: number, prepItemId: number): Promise<PrepItemIngredient[]> {
  const data = await apiFetch<{ ingredients: PrepItemIngredient[] }>(
    `/api/v1/prep/items/${prepItemId}/ingredients?restaurant_id=${restaurantId}`, restaurantId
  );
  return data.ingredients ?? [];
}

export async function setPrepIngredients(restaurantId: number, prepItemId: number, ingredients: PrepIngredientInput[]): Promise<PrepItemIngredient[]> {
  const data = await apiFetch<{ ingredients: PrepItemIngredient[] }>(
    `/api/v1/prep/items/${prepItemId}/ingredients?restaurant_id=${restaurantId}`, restaurantId,
    { method: 'PUT', body: JSON.stringify({ ingredients }) }
  );
  return data.ingredients ?? [];
}

export async function getPrepMenuLinks(restaurantId: number, prepItemId: number): Promise<MenuItem[]> {
  const data = await apiFetch<{ menu_items: MenuItem[] }>(
    `/api/v1/prep/items/${prepItemId}/menu-links?restaurant_id=${restaurantId}`, restaurantId
  );
  return data.menu_items ?? [];
}

export async function producePrepBatch(restaurantId: number, prepItemId: number, input: ProduceBatchInput): Promise<ProduceBatchResult> {
  const data = await apiFetch<ProduceBatchResult>(
    `/api/v1/prep/items/${prepItemId}/produce?restaurant_id=${restaurantId}`, restaurantId,
    { method: 'POST', body: JSON.stringify(input) }
  );
  return data;
}

export async function previewPrepBatch(restaurantId: number, prepItemId: number, input: ProduceBatchInput): Promise<ProduceBatchResult> {
  const data = await apiFetch<ProduceBatchResult>(
    `/api/v1/prep/items/${prepItemId}/preview?restaurant_id=${restaurantId}`, restaurantId,
    { method: 'POST', body: JSON.stringify(input) }
  );
  return data;
}

export async function listPrepTransactions(
  restaurantId: number, params?: { prep_item_id?: number; limit?: number }
): Promise<PrepTransaction[]> {
  const qs = new URLSearchParams({ restaurant_id: String(restaurantId) });
  if (params?.prep_item_id) qs.set('prep_item_id', String(params.prep_item_id));
  if (params?.limit) qs.set('limit', String(params.limit));
  const data = await apiFetch<{ transactions: PrepTransaction[] }>(`/api/v1/prep/transactions?${qs}`, restaurantId);
  return data.transactions ?? [];
}

export async function createPrepTransaction(restaurantId: number, input: PrepTransactionInput): Promise<PrepTransaction> {
  const data = await apiFetch<{ transaction: PrepTransaction }>(`/api/v1/prep/transactions?restaurant_id=${restaurantId}`, restaurantId, {
    method: 'POST', body: JSON.stringify(input),
  });
  return data.transaction;
}

export async function getPrepCategories(restaurantId: number): Promise<StockCategory[]> {
  const data = await apiFetch<{ categories: StockCategory[] }>(`/api/v1/prep/categories?restaurant_id=${restaurantId}`, restaurantId);
  return data.categories ?? [];
}

export async function getPrepLowStockCount(restaurantId: number): Promise<number> {
  const data = await apiFetch<{ count: number }>(`/api/v1/prep/low-stock-count?restaurant_id=${restaurantId}`, restaurantId);
  return data.count ?? 0;
}

export async function getDailyPrepPlan(
  restaurantId: number, params?: { day_of_week?: number; weeks_back?: number }
): Promise<DailyPlanItem[]> {
  const qs = new URLSearchParams({ restaurant_id: String(restaurantId) });
  if (params?.day_of_week !== undefined) qs.set('day_of_week', String(params.day_of_week));
  if (params?.weeks_back) qs.set('weeks_back', String(params.weeks_back));
  const data = await apiFetch<{ items: DailyPlanItem[] }>(`/api/v1/prep/daily-plan?${qs}`, restaurantId);
  return data.items ?? [];
}

// ── Spoke (Circuit) Delivery Config ─────────────────────────────────

export interface SpokeConfigResponse {
  configured: boolean;
  enabled?: boolean;
  depot_id?: string;
  default_driver_name?: string;
  default_driver_phone?: string;
}

export interface SpokeConfigInput {
  api_key: string;
  enabled: boolean;
  depot_id: string;
  default_driver_name: string;
  default_driver_phone: string;
}

export async function getSpokeConfig(restaurantId: number): Promise<SpokeConfigResponse> {
  return apiFetch<SpokeConfigResponse>(`/api/v1/spoke/config`, restaurantId);
}

export async function updateSpokeConfig(
  restaurantId: number,
  config: SpokeConfigInput
): Promise<{ message: string }> {
  return apiFetch<{ message: string }>(`/api/v1/spoke/config`, restaurantId, {
    method: 'PUT',
    body: JSON.stringify(config),
  });
}

// ─── Trusted Customers ──────────────────────────────────────────────────────

export interface TrustedCustomer {
  id: number;
  restaurant_id: number;
  phone: string;
  name: string;
  notes?: string;
  created_at: string;
}

export async function listTrustedCustomers(restaurantId: number): Promise<TrustedCustomer[]> {
  const data = await apiFetch<{ trusted_customers: TrustedCustomer[] }>(
    `/api/v1/restaurants/${restaurantId}/customers/trusted`, restaurantId
  );
  return data.trusted_customers ?? [];
}

export async function addTrustedCustomer(
  restaurantId: number,
  input: { phone: string; name: string; notes?: string }
): Promise<TrustedCustomer> {
  const data = await apiFetch<{ trusted_customer: TrustedCustomer }>(
    `/api/v1/restaurants/${restaurantId}/customers/trusted`, restaurantId,
    { method: 'POST', body: JSON.stringify(input) }
  );
  return data.trusted_customer;
}

export async function removeTrustedCustomer(restaurantId: number, customerId: number): Promise<void> {
  await apiFetch<void>(
    `/api/v1/restaurants/${restaurantId}/customers/trusted/${customerId}`, restaurantId,
    { method: 'DELETE' }
  );
}

// ─── RBAC: Roles & Permissions ────────────────────────────────────────────────

export interface RolePermission {
  id: number;
  restaurant_role_id: number;
  permission: string;
}

export interface RestaurantRole {
  id: number;
  restaurant_id: number;
  name: string;
  description: string;
  is_system_default: boolean;
  permissions: RolePermission[];
  user_count: number;
  created_at: string;
}

export interface PermissionInfo {
  key: string;
  label: string;
  description: string;
}

export interface PermissionGroup {
  domain: string;
  permissions: PermissionInfo[];
}

export interface MeWithPermissions {
  user: User;
  permissions?: string[];
  role_name?: string;
}

export async function listRoles(restaurantId: number): Promise<RestaurantRole[]> {
  const data = await apiFetch<{ roles: RestaurantRole[] }>(
    `/api/v1/restaurants/${restaurantId}/roles`, restaurantId
  );
  return data.roles ?? [];
}

export async function createRole(
  restaurantId: number,
  input: { name: string; description: string; permissions: string[] }
): Promise<RestaurantRole> {
  const data = await apiFetch<{ role: RestaurantRole }>(
    `/api/v1/restaurants/${restaurantId}/roles`, restaurantId,
    { method: 'POST', body: JSON.stringify(input) }
  );
  return data.role;
}

export async function updateRole(
  restaurantId: number,
  roleId: number,
  input: { name?: string; description?: string; permissions?: string[] }
): Promise<RestaurantRole> {
  const data = await apiFetch<{ role: RestaurantRole }>(
    `/api/v1/restaurants/${restaurantId}/roles/${roleId}`, restaurantId,
    { method: 'PUT', body: JSON.stringify(input) }
  );
  return data.role;
}

export async function deleteRole(restaurantId: number, roleId: number): Promise<void> {
  await apiFetch<void>(
    `/api/v1/restaurants/${restaurantId}/roles/${roleId}`, restaurantId,
    { method: 'DELETE' }
  );
}

export async function listPermissions(): Promise<PermissionGroup[]> {
  const data = await apiFetch<{ permissions: PermissionGroup[] }>('/api/v1/permissions');
  return data.permissions ?? [];
}

export async function getMyPermissions(restaurantId: number): Promise<MeWithPermissions> {
  return apiFetch<MeWithPermissions>(
    `/api/v1/users/me?restaurant_id=${restaurantId}`
  );
}

// ─── AI Streaming ─────────────────────────────────────────────────────────────

export interface AiHistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

export async function streamAiChat(
  restaurantId: number,
  message: string,
  history: AiHistoryMessage[],
  onDelta: (delta: string) => void,
): Promise<void> {
  const token = getToken();
  const res = await fetch(`${API_URL}/api/v1/ai/chat/stream?restaurant_id=${restaurantId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ message, history }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'AI error' }));
    throw new Error(err.error || 'AI error');
  }
  const reader = res.body?.getReader();
  if (!reader) return;
  const decoder = new TextDecoder();
  let buf = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const obj = JSON.parse(line.slice(6));
          if (obj.type === 'delta' && typeof obj.text === 'string') {
            onDelta(obj.text);
          }
        } catch { /* ignore non-JSON lines */ }
      }
    }
  }
}

// ─── Suppliers ────────────────────────────────────────────────────────────────

export interface Supplier {
  id: number;
  restaurant_id: number;
  name: string;
  contact_name: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
  is_active: boolean;
  products?: SupplierProduct[];
  created_at: string;
  updated_at: string;
}

export interface SupplierInput {
  name: string;
  contact_name?: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
  is_active?: boolean;
}

export interface SupplierProduct {
  id: number;
  supplier_id: number;
  restaurant_id: number;
  name: string;
  sku: string;
  unit: string;
  price_per_unit: number;
  stock_item_id: number | null;
  is_active: boolean;
  stock_item?: { id: number; name: string };
  created_at: string;
  updated_at: string;
}

export interface SupplierProductInput {
  name: string;
  sku?: string;
  unit?: string;
  price_per_unit?: number;
  stock_item_id?: number | null;
  is_active?: boolean;
}

export type PurchaseOrderStatus = 'draft' | 'sent' | 'received' | 'cancelled';

export interface PurchaseOrder {
  id: number;
  restaurant_id: number;
  supplier_id: number;
  status: PurchaseOrderStatus;
  notes: string;
  total_amount: number;
  order_date: string | null;
  received_date: string | null;
  created_by_id: number;
  supplier: Supplier;
  items: PurchaseOrderItem[];
  created_at: string;
  updated_at: string;
}

export interface PurchaseOrderItem {
  id: number;
  purchase_order_id: number;
  supplier_product_id: number | null;
  stock_item_id: number | null;
  name: string;
  unit: string;
  quantity: number;
  price_per_unit: number;
  total_price: number;
  received_qty: number | null;
}

export interface PurchaseOrderItemInput {
  supplier_product_id?: number | null;
  stock_item_id?: number | null;
  name: string;
  unit?: string;
  quantity: number;
  price_per_unit: number;
}

export async function listSuppliers(restaurantId: number): Promise<Supplier[]> {
  const data = await apiFetch<{ suppliers: Supplier[] }>(`/api/v1/suppliers?restaurant_id=${restaurantId}`, restaurantId);
  return data.suppliers ?? [];
}

export async function createSupplier(restaurantId: number, input: SupplierInput): Promise<Supplier> {
  const data = await apiFetch<{ supplier: Supplier }>(`/api/v1/suppliers?restaurant_id=${restaurantId}`, restaurantId, {
    method: 'POST', body: JSON.stringify(input),
  });
  return data.supplier;
}

export async function updateSupplier(restaurantId: number, id: number, input: Partial<SupplierInput>): Promise<Supplier> {
  const data = await apiFetch<{ supplier: Supplier }>(`/api/v1/suppliers/${id}?restaurant_id=${restaurantId}`, restaurantId, {
    method: 'PUT', body: JSON.stringify(input),
  });
  return data.supplier;
}

export async function deleteSupplier(restaurantId: number, id: number): Promise<void> {
  await apiFetch<void>(`/api/v1/suppliers/${id}?restaurant_id=${restaurantId}`, restaurantId, { method: 'DELETE' });
}

export async function listSupplierProducts(restaurantId: number, supplierId: number): Promise<SupplierProduct[]> {
  const data = await apiFetch<{ products: SupplierProduct[] }>(`/api/v1/suppliers/${supplierId}/products?restaurant_id=${restaurantId}`, restaurantId);
  return data.products ?? [];
}

export async function createSupplierProduct(restaurantId: number, supplierId: number, input: SupplierProductInput): Promise<SupplierProduct> {
  const data = await apiFetch<{ product: SupplierProduct }>(`/api/v1/suppliers/${supplierId}/products?restaurant_id=${restaurantId}`, restaurantId, {
    method: 'POST', body: JSON.stringify(input),
  });
  return data.product;
}

export async function updateSupplierProduct(restaurantId: number, supplierId: number, pid: number, input: Partial<SupplierProductInput>): Promise<SupplierProduct> {
  const data = await apiFetch<{ product: SupplierProduct }>(`/api/v1/suppliers/${supplierId}/products/${pid}?restaurant_id=${restaurantId}`, restaurantId, {
    method: 'PUT', body: JSON.stringify(input),
  });
  return data.product;
}

export async function deleteSupplierProduct(restaurantId: number, supplierId: number, pid: number): Promise<void> {
  await apiFetch<void>(`/api/v1/suppliers/${supplierId}/products/${pid}?restaurant_id=${restaurantId}`, restaurantId, { method: 'DELETE' });
}

export async function listPurchaseOrders(restaurantId: number, params?: { supplier_id?: number; status?: string }): Promise<PurchaseOrder[]> {
  const qs = new URLSearchParams({ restaurant_id: String(restaurantId) });
  if (params?.supplier_id) qs.set('supplier_id', String(params.supplier_id));
  if (params?.status) qs.set('status', params.status);
  const data = await apiFetch<{ orders: PurchaseOrder[] }>(`/api/v1/purchase-orders?${qs}`, restaurantId);
  return data.orders ?? [];
}

export async function createPurchaseOrder(restaurantId: number, input: { supplier_id: number; notes?: string; items: PurchaseOrderItemInput[] }): Promise<PurchaseOrder> {
  const data = await apiFetch<{ order: PurchaseOrder }>(`/api/v1/purchase-orders?restaurant_id=${restaurantId}`, restaurantId, {
    method: 'POST', body: JSON.stringify(input),
  });
  return data.order;
}

export async function updatePurchaseOrderStatus(restaurantId: number, id: number, status: PurchaseOrderStatus): Promise<PurchaseOrder> {
  const data = await apiFetch<{ order: PurchaseOrder }>(`/api/v1/purchase-orders/${id}/status?restaurant_id=${restaurantId}`, restaurantId, {
    method: 'PUT', body: JSON.stringify({ status }),
  });
  return data.order;
}

export async function receivePurchaseOrder(restaurantId: number, id: number, items: { id: number; received_qty: number }[]): Promise<PurchaseOrder> {
  const data = await apiFetch<{ order: PurchaseOrder }>(`/api/v1/purchase-orders/${id}/receive?restaurant_id=${restaurantId}`, restaurantId, {
    method: 'POST', body: JSON.stringify({ items }),
  });
  return data.order;
}

export async function deletePurchaseOrder(restaurantId: number, id: number): Promise<void> {
  await apiFetch<void>(`/api/v1/purchase-orders/${id}?restaurant_id=${restaurantId}`, restaurantId, { method: 'DELETE' });
}

// ─── Floor Plans & Table Sections ─────────────────────────────────────────────

export interface TableSection {
  id: number;
  restaurant_id: number;
  name: string;
  sort_order: number;
  tables: RestaurantTableRef[];
  created_at: string;
  updated_at: string;
}

export interface RestaurantTableRef {
  id: number;
  code: string;
  name: string;
  seats: number;
  active: boolean;
  section_id: number | null;
}

export interface FloorPlanPlacement {
  id: number;
  floor_plan_id: number;
  table_id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  shape: 'square' | 'circle';
  rotation: number; // degrees
  table: RestaurantTableRef;
}

export interface FloorPlanDecoration {
  id: number;
  floor_plan_id: number;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  shape: 'rectangle' | 'circle';
  color: string;
  rotation: number; // degrees
}

export interface DecorationInput {
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  shape: 'rectangle' | 'circle';
  color: string;
  rotation: number; // degrees
}

export interface FloorPlan {
  id: number;
  restaurant_id: number;
  name: string;
  sort_order: number;
  placements?: FloorPlanPlacement[];
  decorations?: FloorPlanDecoration[];
  created_at: string;
  updated_at: string;
}

export interface SectionInput {
  name: string;
  label?: string;
  table_count?: number;
  custom_names?: string[];
}

export interface PlacementInput {
  table_id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  shape: 'square' | 'circle';
  rotation: number; // degrees
}

// Sections
export async function listSections(restaurantId: number): Promise<TableSection[]> {
  const data = await apiFetch<{ sections: TableSection[] }>(
    `/api/v1/restaurants/${restaurantId}/sections?restaurant_id=${restaurantId}`, restaurantId
  );
  return data.sections ?? [];
}

export async function createSection(restaurantId: number, input: SectionInput): Promise<TableSection> {
  const data = await apiFetch<{ section: TableSection }>(
    `/api/v1/restaurants/${restaurantId}/sections?restaurant_id=${restaurantId}`, restaurantId,
    { method: 'POST', body: JSON.stringify(input) }
  );
  return data.section;
}

export async function updateSection(restaurantId: number, sectionId: number, name: string): Promise<TableSection> {
  const data = await apiFetch<{ section: TableSection }>(
    `/api/v1/restaurants/${restaurantId}/sections/${sectionId}?restaurant_id=${restaurantId}`, restaurantId,
    { method: 'PUT', body: JSON.stringify({ name }) }
  );
  return data.section;
}

export async function deleteSection(restaurantId: number, sectionId: number): Promise<void> {
  await apiFetch<void>(
    `/api/v1/restaurants/${restaurantId}/sections/${sectionId}?restaurant_id=${restaurantId}`, restaurantId,
    { method: 'DELETE' }
  );
}

// Floor Plans
export async function listFloorPlans(restaurantId: number): Promise<FloorPlan[]> {
  const data = await apiFetch<{ floor_plans: FloorPlan[] }>(
    `/api/v1/restaurants/${restaurantId}/floor-plans?restaurant_id=${restaurantId}`, restaurantId
  );
  return data.floor_plans ?? [];
}

export async function getFloorPlan(restaurantId: number, planId: number): Promise<FloorPlan> {
  const data = await apiFetch<{ floor_plan: FloorPlan }>(
    `/api/v1/restaurants/${restaurantId}/floor-plans/${planId}?restaurant_id=${restaurantId}`, restaurantId
  );
  return data.floor_plan;
}

export async function createFloorPlan(restaurantId: number, name: string): Promise<FloorPlan> {
  const data = await apiFetch<{ floor_plan: FloorPlan }>(
    `/api/v1/restaurants/${restaurantId}/floor-plans?restaurant_id=${restaurantId}`, restaurantId,
    { method: 'POST', body: JSON.stringify({ name }) }
  );
  return data.floor_plan;
}

export async function updateFloorPlan(restaurantId: number, planId: number, name: string): Promise<FloorPlan> {
  const data = await apiFetch<{ floor_plan: FloorPlan }>(
    `/api/v1/restaurants/${restaurantId}/floor-plans/${planId}?restaurant_id=${restaurantId}`, restaurantId,
    { method: 'PUT', body: JSON.stringify({ name }) }
  );
  return data.floor_plan;
}

export async function deleteFloorPlan(restaurantId: number, planId: number): Promise<void> {
  await apiFetch<void>(
    `/api/v1/restaurants/${restaurantId}/floor-plans/${planId}?restaurant_id=${restaurantId}`, restaurantId,
    { method: 'DELETE' }
  );
}

export async function saveFloorPlanLayout(restaurantId: number, planId: number, placements: PlacementInput[], decorations: DecorationInput[] = []): Promise<FloorPlan> {
  const data = await apiFetch<{ floor_plan: FloorPlan }>(
    `/api/v1/restaurants/${restaurantId}/floor-plans/${planId}/layout?restaurant_id=${restaurantId}`, restaurantId,
    { method: 'PUT', body: JSON.stringify({ placements, decorations }) }
  );
  return data.floor_plan;
}

export async function reorderFloorPlans(restaurantId: number, ids: number[]): Promise<void> {
  await apiFetch<void>(
    `/api/v1/restaurants/${restaurantId}/floor-plans/reorder?restaurant_id=${restaurantId}`, restaurantId,
    { method: 'PUT', body: JSON.stringify({ ids }) }
  );
}

// ─── Combo Menus (legacy — ComboStep/ComboStepItem/ComboStepInput are defined above with MenuItem) ─

export interface ComboMenu {
  id: number;
  restaurant_id: number;
  name: string;
  description: string;
  price: number;
  image_url: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  steps: ComboStep[];
}

export interface ComboInput {
  name: string;
  description?: string;
  price: number;
  image_url?: string;
  is_active: boolean;
  sort_order?: number;
  steps: ComboStepInput[];
}

export async function listCombos(restaurantId: number): Promise<ComboMenu[]> {
  const data = await apiFetch<{ combos: ComboMenu[] }>(`/api/v1/combos`, restaurantId);
  return data.combos;
}

export async function getCombo(restaurantId: number, id: number): Promise<ComboMenu> {
  const data = await apiFetch<{ combo: ComboMenu }>(`/api/v1/combos/${id}`, restaurantId);
  return data.combo;
}

export async function createCombo(restaurantId: number, input: ComboInput): Promise<ComboMenu> {
  const data = await apiFetch<{ combo: ComboMenu }>(`/api/v1/combos`, restaurantId, {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return data.combo;
}

export async function updateCombo(restaurantId: number, id: number, input: ComboInput): Promise<ComboMenu> {
  const data = await apiFetch<{ combo: ComboMenu }>(`/api/v1/combos/${id}`, restaurantId, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
  return data.combo;
}

export async function deleteCombo(restaurantId: number, id: number): Promise<void> {
  await apiFetch<void>(`/api/v1/combos/${id}`, restaurantId, { method: 'DELETE' });
}

export async function uploadComboImage(restaurantId: number, comboId: number, file: File): Promise<string> {
  const form = new FormData();
  form.append('image', file);
  const token = getToken();
  const res = await fetch(`${API_URL}/api/v1/combos/${comboId}/image`, {
    method: 'POST',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'X-Restaurant-ID': String(restaurantId),
    },
    body: form,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Upload failed' }));
    throw new Error(err.error || 'Upload failed');
  }
  const data = await res.json();
  return data.image_url as string;
}

// ─── Rotation Schedule ────────────────────────────────────────────────────────

export interface RotationSchedule {
  id: number;
  restaurant_id: number;
  rotation_group: string;
  menu_item_id: number;
  week_start: string;
  created_at: string;
}

export async function getRotationSchedules(restaurantId: number, weeks = 4): Promise<RotationSchedule[]> {
  const data = await apiFetch<{ schedules: RotationSchedule[] }>(
    `/api/v1/menus/rotation-schedules?weeks=${weeks}`, restaurantId
  );
  return data.schedules;
}

export async function setRotationSchedule(
  restaurantId: number,
  input: { rotation_group: string; menu_item_id: number; week_start: string }
): Promise<RotationSchedule> {
  const data = await apiFetch<{ schedule: RotationSchedule }>(
    `/api/v1/menus/rotation-schedules`, restaurantId,
    { method: 'PUT', body: JSON.stringify(input) }
  );
  return data.schedule;
}

export async function deleteRotationSchedule(restaurantId: number, id: number): Promise<void> {
  await apiFetch<void>(`/api/v1/menus/rotation-schedules/${id}`, restaurantId, { method: 'DELETE' });
}

export async function renameRotationGroup(restaurantId: number, old_name: string, new_name: string): Promise<void> {
  await apiFetch<void>(`/api/v1/menus/rotation-groups/rename`, restaurantId, {
    method: 'PUT',
    body: JSON.stringify({ old_name, new_name }),
  });
}

export async function deleteRotationGroup(restaurantId: number, name: string): Promise<void> {
  await apiFetch<void>(`/api/v1/menus/rotation-groups/${encodeURIComponent(name)}`, restaurantId, {
    method: 'DELETE',
  });
}

// ─── Opening Hours ────────────────────────────────────────────────────────────

export interface DayHours {
  open: string;
  close: string;
  closed: boolean;
}

export type WeeklyHours = {
  monday: DayHours;
  tuesday: DayHours;
  wednesday: DayHours;
  thursday: DayHours;
  friday: DayHours;
  saturday: DayHours;
  sunday: DayHours;
};

export interface OpeningHoursConfig {
  dine_in?: WeeklyHours;
  pickup?: WeeklyHours;
  delivery?: WeeklyHours;
}
