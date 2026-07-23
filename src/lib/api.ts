// Foody Admin API client — restaurant owner/manager portal
// Calls foodyserver at /api/v1/* using JWT auth.

import type {
  Draft,
  DraftPayload,
  ChatPatch as LabChatPatch,
  DraftStatus,
  CommitResult,
} from '@/app/[restaurantId]/kitchen/lab/types';
import type { PosDisplayLayout } from './posDisplay';
import {
  startRegistration,
  startAuthentication,
  browserSupportsWebAuthn,
  platformAuthenticatorIsAvailable,
} from '@simplewebauthn/browser';

export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';
const TOKEN_KEY = 'foody_restaurant_token';
const USER_KEY = 'foody_restaurant_user';
const RIDS_KEY = 'foody_restaurant_ids';
const REMEMBER_KEY = 'foody_remember';

// ─── Types ────────────────────────────────────────────────────────────────────

export type Role = 'superadmin' | 'owner' | 'manager' | 'cashier' | 'waiter' | 'chef' | 'courier';
export type PlanTier = 'starter' | 'premium' | 'enterprise';
export type SubscriptionStatus = 'trial' | 'active' | 'past_due' | 'deactivated' | 'cancelled';
export type OrderStatus =
  | 'pending_review' | 'accepted' | 'in_kitchen' | 'ready'
  | 'served' | 'received' | 'picked_up' | 'delivered' | 'rejected' | 'scheduled'
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
  cover_focal_x?: number; // 0-100 percent from left, default 50 (center)
  cover_focal_y?: number; // 0-100 percent from top,  default 50 (center)
  description: string;
  /** Source language the owner types in. en | he | fr. Falls back to 'en' if unset. */
  default_locale?: string;
  /**
   * First day of the week for weekly editors. 0=Sunday … 6=Saturday
   * (matches JS Date.getDay / Go time.Weekday). Default 1 (Monday);
   * Israeli restaurants typically use 0 (Sunday).
   */
  week_start_day?: number;
  /**
   * Explicit list of weekday numbers (0=Sun … 6=Sat) the restaurant
   * operates. Empty / unset = derive from opening_hours_config (the
   * default). Use `getEffectiveWorkdays(restaurant)` from
   * `@/lib/weeks` to read the resolved value.
   */
  workdays?: number[];
  phone: string;
  delivery_enabled: boolean;
  /** Google Places API key (client-restricted) for address/city autocomplete. Optional. */
  google_places_api_key?: string;
  pickup_enabled: boolean;
  dine_in_enabled: boolean;
  is_active: boolean;
  opening_hours_config?: OpeningHoursConfig;
  created_at: string;
}

/**
 * BatchFulfillmentDay describes one weekly day on which all pre-orders are
 * fulfilled, along with optional time windows per service type. `day` uses
 * weekday numbers (0=Sunday … 6=Saturday). Times are "HH:MM".
 */
export interface BatchFulfillmentDay {
  day: number;
  pickup_start?: string;
  pickup_end?: string;
  delivery_start?: string;
  delivery_end?: string;
}

export type PricingMode = 'standard' | 'by_weight';

export interface RestaurantSettings {
  id: number;
  restaurant_id: number;
  require_order_approval: boolean;
  /** Safety margin added on top of an item's estimated weight when placing the
   *  card hold for by-weight orders, so the captured amount at weigh-in rarely
   *  exceeds the authorized hold. Percent (e.g. 20 = +20%). Default 20. */
  weight_hold_buffer_percent?: number;
  require_dine_in_prepayment: boolean;
  service_mode: string;
  scheduling_enabled: boolean;
  // Slot-based scheduling detail (mutually exclusive with batch fulfillment).
  scheduling_min_days_ahead?: number;
  scheduling_max_days_ahead?: number;
  scheduling_slot_duration_minutes?: number;
  scheduling_require_prepayment?: boolean;
  tips_enabled: boolean;
  auto_accept_prepaid: boolean;
  auto_send_to_kitchen: boolean;
  rush_mode: boolean;
  // Order-lifecycle profile. "full" (default) keeps the manual step-by-step
  // flow; "simple" auto-marks an order ready when it is ticked done on the
  // production sheet. Absent/unknown values are treated as "full".
  order_workflow?: "full" | "simple";
  // One-click online ordering pause. When orders_paused is true (and
  // orders_paused_until is null or still in the future) all online ordering is
  // blocked, overriding opening hours and both pre-order modes. Send
  // orders_paused_until as an RFC3339 string, or "" to clear it (pause until
  // manually reopened).
  orders_paused?: boolean;
  orders_paused_until?: string | null;
  floor_plan_color_indicators: boolean;
  table_yellow_after_minutes: number;
  table_red_after_minutes: number;
  pickup_prep_time_minutes?: number;
  vat_rate: number;
  // Delivery — minimum cart total to allow a delivery order (0 = no minimum).
  // Drives the "Min ₪X" pill on the foodyweb hero in delivery mode.
  minimum_order_delivery?: number;
  // Batch fulfillment — pre-orders that all ship on a fixed weekly day.
  // Mutually exclusive with `scheduling_enabled` (slot-based).
  batch_fulfillment_enabled?: boolean;
  batch_cutoff_day?: number; // 0=Sun..6=Sat
  batch_cutoff_time?: string; // "HH:MM"
  // When the next batch's ordering window opens. Defaults match cutoff
  // (zero-gap) on legacy data; set explicitly to introduce a switchover gap.
  batch_order_open_day?: number; // 0=Sun..6=Sat
  batch_order_open_time?: string; // "HH:MM"
  batch_fulfillment_days?: BatchFulfillmentDay[];
  batch_require_prepayment?: boolean;
  // OTP mode for guest checkout (pickup/delivery):
  //   "required" — ask phone + send a code, customer types it back (default)
  //   "skip"     — skip the code entirely, phone is optional (notifications only)
  otp_mode?: 'required' | 'skip';
  // AI ordering assistant (guest-facing concierge on foodyweb)
  ai_assistant_enabled?: boolean;
  ai_assistant_upsell?: boolean;
  ai_assistant_auto_order?: boolean;
  ai_assistant_guidance?: string;
  // Restaurant-specific knowledge (e.g. mined from past WhatsApp orders) that
  // sharpens the assistant: name synonyms, popular pairings, and FAQ answers.
  ai_assistant_aliases?: string;
  ai_assistant_pairings?: string;
  ai_assistant_faq?: string;
  // How the assistant proactively offers help: only when tapped, immediately
  // on load, or after a delay (if the cart is still empty).
  ai_assistant_trigger?: 'manual' | 'immediate' | 'delay';
  ai_assistant_trigger_delay?: number; // seconds
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
  // Gates the batch-aware UX on the carte detail page (week picker + per-batch
  // item filtering). Unrelated to ItemCategory.is_weekly_rotating.
  is_weekly_rotating?: boolean;
  availability_hours?: MenuAvailabilityHour[];
  groups?: MenuGroup[];
  categories?: MenuCategory[]; // Deprecated: use groups
  locations?: Location[];
  pos_display?: PosDisplayLayout;
}

export interface GroupAvailabilityHour {
  id: number;
  menu_group_id: number;
  day_of_week: number;
  open_time: string;
  close_time: string;
  is_closed: boolean;
}

/** One image placed on a "color-title" category banner. Position is the sticker
 *  CENTER as a percent of the banner box; width is a percent of the banner width. */
export interface BannerSticker {
  id: string;
  imageUrl: string;
  xPct: number;
  yPct: number;
  widthPct: number;
  rotationDeg: number;
}

export interface BannerTitleDesign {
  text?: string;
  font?: string;
  size?: number;
  color?: string;
  align?: 'left' | 'center' | 'right';
}

/** Per-category "color + title" banner design (category banner style 'color-title'). */
export interface BannerDesign {
  bgColor?: string;
  title?: BannerTitleDesign;
  stickers?: BannerSticker[];
}

export interface MenuGroup {
  id: number;
  restaurant_id: number;
  menu_id: number;
  parent_id?: number;
  name: string;
  image_url: string;
  /** Banner image focal point (0-100, percent from left/top) → CSS object-position. */
  banner_focal_x?: number;
  banner_focal_y?: number;
  /** Per-category "color + title" banner design. */
  banner_design?: BannerDesign | null;
  sort_order: number;
  pos_enabled: boolean;
  web_enabled: boolean;
  follows_menu_hours: boolean;
  is_hidden: boolean;
  items?: MenuItem[];
  availability_hours?: GroupAvailabilityHour[];
  /** Per-locale name overrides. Source-locale value lives in `name`. */
  translations?: TranslationMap;
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
  is_weekly_rotating?: boolean;
  availability_hours?: CategoryAvailabilityHour[];
  items?: MenuItem[];
  /** Default availability rule for items in this category (null = inherit default). */
  availability_rule_id?: number | null;
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
  // Stock consumption: picking this modifier consumes `quantity` of the linked
  // stock/prep item (`unit`). Multi-pick count multiplies consumption at cost time.
  stock_item_id?: number;
  prep_item_id?: number;
  quantity?: number;
  unit?: string;
  /** Per-locale name overrides. Source-locale value lives in `name`. */
  translations?: TranslationMap;
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
  /** Which conversational verbs the palette shows. Empty/absent = all verbs. */
  enabled_verbs?: string[];
  sort_order: number;
  modifiers: MenuItemModifier[];
  menu_items?: { id: number; name: string }[];
  created_at: string;
  /** Per-locale display_name overrides. Source-locale value lives in `display_name`. */
  translations?: TranslationMap;
}

export interface MenuItemVariant {
  id: number;
  group_id: number;
  name: string;
  price: number;
  online_price?: number | null;
  sku?: string;
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
  // Off-carte items are dropped by the server resolver at order time unless
  // this is true. Defaults to true (preserves pre-flag behavior); the admin
  // surfaces a toggle on rows where the item is currently off-carte.
  force_off_carte?: boolean;
  menu_item?: MenuItem;
}

export type ComboStepSourceType = 'explicit' | 'group';

/** Per-size pick rule on a group-sourced step (e.g. up to 4 at 500g). */
export interface ComboStepVariantRule {
  id?: number;
  variant_label: string;
  min_picks: number;
  max_picks: number;
  sort_order?: number;
}

/** Per-item pick cap override within a step (e.g. "Tuna max 1"). */
export interface ComboStepItemLimit {
  id?: number;
  menu_item_id: number;
  max_qty: number;
}

export interface ComboStep {
  id?: number;
  menu_item_id?: number;
  combo_menu_id?: number;
  name: string;
  description?: string;
  min_picks: number;
  max_picks: number;
  sort_order: number;
  fixed_modifier_name?: string;
  source_type?: ComboStepSourceType;
  source_group_id?: number | null;
  source_variant_label?: string | null;
  variant_rules?: ComboStepVariantRule[];
  /** Default cap on repeats of any single item in the step (0 = unlimited). */
  max_per_item?: number;
  /** Per-item overrides of max_per_item. */
  item_limits?: ComboStepItemLimit[];
  items: ComboStepItem[];
}

export interface ComboStepInput {
  name: string;
  description?: string;
  min_picks: number;
  max_picks: number;
  sort_order: number;
  fixed_modifier_name?: string;
  source_type?: ComboStepSourceType;
  source_group_id?: number | null;
  source_variant_label?: string | null;
  variant_rules?: {
    variant_label: string;
    min_picks: number;
    max_picks: number;
    sort_order?: number;
  }[];
  max_per_item?: number;
  item_limits?: { menu_item_id: number; max_qty: number }[];
  items: {
    menu_item_id: number;
    option_id?: number | null;
    price_delta: number;
    force_off_carte?: boolean;
  }[];
}

/**
 * Per-locale overrides for an entity's translatable fields. The source-locale
 * value lives in the entity's regular column (name, description, etc.) — it is
 * never stored here. Shape:
 *   { name: { he: '…', en: '…' }, description: { he: '…', en: '…' } }
 */
export type TranslationMap = Partial<Record<string, Partial<Record<'en' | 'he' | 'fr', string>>>>;

export interface MenuItem {
  id: number;
  category_id: number;
  name: string;
  description: string;
  /** How this item is priced. "standard" (default) uses `price` (or size
   *  variants); "by_weight" charges `price_per_kg` against the weight measured
   *  at fulfillment, with `estimated_weight_grams` driving the pre-auth hold. */
  pricing_mode?: PricingMode;
  /** Price per kilogram, in ₪. Only meaningful when `pricing_mode` is "by_weight". */
  price_per_kg?: number;
  /** Estimated weight per unit, in grams. Drives the card hold amount for
   *  by-weight items before the real weight is known. */
  estimated_weight_grams?: number;
  /** Private staff guidance for the AI ordering assistant (never shown to guests). */
  ai_context?: string;
  /** Short serving-size label shown under the title when the item has no size
   *  options (e.g. "par personne"). Translatable via the translations map. */
  portion?: string;
  image_url: string;
  price: number;
  is_active: boolean;
  /** Per-item toggle for the guest "special instructions" field (guest web only).
   *  null/undefined = default (shown); true = shown; false = hidden. */
  allow_notes?: boolean | null;
  /** Combo-level toggle: allow guests to order several of this combo at once.
   *  null/undefined = default (allowed = true); false = single combo only. */
  combo_allow_quantity?: boolean | null;
  item_type: ItemType;
  sort_order: number;
  rotation_group?: string;
  modifiers?: MenuItemModifier[];
  modifier_sets?: ModifierSet[];
  variant_groups?: ItemVariantGroup[];
  option_sets?: OptionSet[];
  combo_steps?: ComboStep[];
  prep_time_mins?: number;
  recipe_notes?: string;
  recipe_steps?: RecipeStep[];
  /** Per-locale name/description overrides. Source-locale is never stored here. */
  translations?: TranslationMap;
  /** Recipe-aware availability rule assignment (null = inherit category/default). */
  availability_rule_id?: number | null;
  /** Staff "86" switch: 'auto' | 'force_available' | 'force_sold_out'. */
  availability_override?: AvailabilityOverride;
  /** Optional per-item manual stock count for restaurants not tracking
   *  recipes yet. When set (and the item has no recipe), availability follows
   *  the item's rule based on this number; it decrements as orders come in.
   *  null = not tracked (unlimited unless a recipe constrains it). */
  stock_quantity?: number | null;
  /** How predefined stock is tracked. "" / "count" = one shared counter
   *  (`stock_quantity`); "per_variant" = a separate count per size, stored on
   *  each option (see `OptionSetOption.stock_remaining`); "measure" = a g/ml
   *  budget. Empty when predefined stock isn't used. */
  stock_mode?: string;
  /** Display unit for weight/volume-based predefined stock ("g"/"kg"/"ml"/"l"),
   *  empty for portion counts. In "measure" mode the value is stored in the base
   *  unit (g or ml) and this only drives how it's shown/entered. In "per_variant"
   *  mode it is a display hint: the per-option values stay portion counts, and the
   *  admin renders them as weight (count x size weight) when this is set. */
  stock_unit?: string;
  /** Computed (read-only) availability stamped onto staff menu responses. */
  availability_state?: AvailabilityState;
  buildable_count?: number | null;
  availability_bottleneck?: string;
  /** Per-item overrides on attached modifier sets — present only for sets
   *  with at least one non-null override. The values in `modifier_sets`
   *  are already effective (set defaults with overrides applied). */
  modifier_set_overrides?: ModifierSetItemOverrideRow[];
}

export interface ModifierSetItemOverrideRow {
  modifier_set_id: number;
  menu_item_id: number;
  min_selections_override?: number | null;
  max_selections_override?: number | null;
  is_required_override?: boolean | null;
}

export interface ModifierSetItemOverridesInput {
  min_selections?: number | null;
  max_selections?: number | null;
  is_required?: boolean | null;
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
  /** Pricing snapshot for by-weight lines. "standard" (default) prices via
   *  `price`; "by_weight" prices `price_per_kg` × actual weight at fulfillment. */
  pricing_mode?: PricingMode;
  /** Price per kilogram snapshotted at order time (by-weight lines only). */
  price_per_kg?: number;
  /** Estimated weight per unit in grams, snapshotted at order time. */
  estimated_weight_grams?: number;
  /** Actual weighed grams captured by staff at fulfillment. null until weighed. */
  actual_weight_grams?: number | null;
  selected_variant_id?: number;
  selected_variant_name?: string;
  selected_variant_price?: number;
  // variant_portion is a formatted label like "250 g" / "1 kg", snapshotted
  // at order creation from the recipe. Empty/undefined when no portion mass
  // is computable for the item+variant (no recipe, no numeric variant name).
  variant_portion?: string;
  modifiers?: OrderItemModifier[];
  combo_item_id?: number;
  combo_group?: string;
  /** Which combo step this pick came from. Snapshotted at order time; nil on
   *  pre-feature rows (re-derived when editing a combo's composition). */
  combo_step_id?: number;
  combo_name?: string;
  combo_price?: number;
  // Snapshot of the item's category at order time. NULL on older/fake rows
  // that pre-date the snapshot migration — render those under an "Other" bucket.
  category_id?: number;
  category_name?: string;
  /** Set once a settled payment has covered this line; null = added but not yet paid for. */
  billed_at?: string | null;
  billed_invoice_number?: string;
}

export interface Order {
  id: number;
  restaurant_id: number;
  order_type: 'dine_in' | 'pickup' | 'delivery';
  order_source?: string;
  status: OrderStatus;
  payment_status: PaymentStatus;
  payment_method?: string;
  /** Settlement lifecycle for by-weight orders paid via card hold. "" = not a
   *  held order; "held" = card pre-authorized, awaiting weigh-in; "captured" =
   *  final weight confirmed and charged; "released" = hold voided;
   *  "over_hold_flagged" = final total exceeded the hold, needs staff attention. */
  settlement_status?: '' | 'held' | 'captured' | 'released' | 'over_hold_flagged';
  /** Amount authorized on the customer's card (₪) while awaiting weigh-in. */
  hold_amount?: number;
  /** Amount actually captured (₪) after weights were confirmed. */
  captured_amount?: number;
  customer_name: string;
  customer_phone: string;
  total_amount: number;
  items: OrderItem[];
  created_at: string;
  table_number?: string;
  table_code?: string;
  is_scheduled?: boolean;
  scheduled_for?: string;
  scheduled_pickup_window_start?: string;
  scheduled_pickup_window_end?: string;
  scheduled_accepted_at?: string;
  // Staff "add to production plan" override. When true the order appears on the
  // production sheet regardless of scheduling/payment (see setOrderForceProduction).
  force_production?: boolean;
  accepted_at?: string;
  in_kitchen_at?: string;
  ready_at?: string;
  completed_at?: string;
  // Courier assignment (delivery orders)
  courier_id?: number | null;
  courier_name?: string;
  courier_phone?: string;
  courier_assigned_at?: string;
  delivery_address?: string;
  delivery_city?: string;
  delivery_floor?: string;
  delivery_apt?: string;
  delivery_entry_code?: string; // building entry code ("code immeuble" / digicode)
  delivery_notes?: string;
  // Zone-based delivery fee charged for this order. Already folded into
  // total_amount by the server; omitted (undefined) for non-delivery orders or
  // zones without a fee. Treat missing as 0.
  delivery_fee?: number;
  // Answers to the owner's custom checkout-form fields, keyed by field id (e.g.
  // { code_immeuble: "A12" }). Labels are resolved from the restaurant's
  // checkout_config. Empty/false answers are omitted server-side.
  custom_fields?: Record<string, string | number | boolean> | null;
  // Public receipt page token (foodyweb /receipt/[token]). Set at order creation;
  // absent only on very old orders that predate tokenization.
  receipt_token?: string;
  // Optional confirmation email captured at checkout (e.g. Google sign-in). May be absent.
  customer_email?: string;
  // Language the customer ordered in (he/fr/en), captured from foodyweb's display
  // locale at checkout. Absent on staff-created orders and orders placed before
  // this was recorded — consumers fall back to the restaurant's default_locale.
  customer_locale?: string;
  // Payment-provider metadata serialized from the server's ExternalMeta
  // (e.g. Summit's document_id on a paid order). Shape is provider-specific.
  external_metadata?: Record<string, unknown> | null;
  // Outstanding amount (₪) for items added after the order was paid. Server
  // omits this field (undefined) when there is nothing outstanding.
  balance_due?: number;
  // Discount applied to this order. discount_amount is the total reduction (₪)
  // already folded into total_amount. discount is the snapshot of the applied
  // discount rule. discount_source is 'code' | 'manual' | '' (or absent).
  discount_amount?: number;
  discount_source?: string;
  discount?: { code?: string; type: string; value: number; scope: string; reason?: string };
}

export interface StaffMember {
  id: number;
  full_name: string;
  email: string;
  phone: string;
  role: Role;
  role_id?: number;
  role_name?: string;
  is_default_courier?: boolean;
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

// ─── Order-page info placement ────────────────────────────────────────
// Which restaurant-info items appear in the order page's metadata bar (per
// order mode) vs the "Plus" modal. Mirrors order_page_info on the server and
// the OrderPageInfo type in foodyweb. Stored snake_case.
export type OrderPageBarItem =
  | 'batch_week' | 'hours' | 'min_order' | 'fulfilment_time' | 'wifi'
  | 'instagram' | 'whatsapp' | 'facebook' | 'tiktok' | 'more';
export type OrderPageModalSection =
  | 'about' | 'hours' | 'address' | 'contact' | 'social' | 'custom_text';
export interface OrderPageInfo {
  bar: {
    pickup: OrderPageBarItem[];
    delivery: OrderPageBarItem[];
    dine_in: OrderPageBarItem[];
  };
  modal: OrderPageModalSection[];
  modal_text?: string;
}

/** Optional per-section color overrides (hex strings). Any omitted section or
 *  field falls back to the global theme token for that color. */
export interface SectionColors {
  navbar?: { bg?: string; text?: string };
  hero?: { bg?: string; text?: string };
  metadata?: { bg?: string; text?: string };
  categoryBar?: { bg?: string; text?: string; accent?: string };
}

export interface WebsiteConfig {
  id: number;
  restaurant_id: number;
  // Theme system (menu/order page)
  theme_id: string;
  pairing_id: string;
  brand_color: string | null;
  layout_default: 'compact' | 'magazine';
  /** Initial menu layout on phones. Empty = follow layout_default. */
  layout_default_mobile: '' | 'compact' | 'magazine';
  // Landing-page concerns
  hero_layout: string;
  welcome_text: string;
  tagline: string;
  social_links: Record<string, string>;
  show_address: boolean;
  show_phone: boolean;
  show_hours: boolean;
  favicon_url: string;
  hero_cta_text: string;
  mid_cta_enabled: boolean;
  mid_cta_title: string;
  mid_cta_body: string;
  mid_cta_btn_text: string;
  footer_text: string;
  navbar_style: string;
  navbar_color: string;
  logo_size: number;
  hide_navbar_name: boolean;
  hide_hero_logo: boolean;
  /** Background of the rounded-square logo box on the order-page hero. Default 'white'. */
  hero_logo_bg: 'white' | 'black';
  /** Order-page cover composition. 'card' (default) shows the logo box with the
   *  restaurant name + tagline; 'logo' centers the logo alone on the cover;
   *  'bare' keeps the logo at the card position without box, name or tagline. */
  hero_cover_layout: 'card' | 'logo' | 'bare';
  /** Scales the cover logo, as a percentage of its default size (100 = default). */
  hero_logo_size: number;
  custom_palette?: {
    mode: 'light' | 'dark';
    bg: string;
    surface: string;
    accent: string;
    ink: string;
  } | null;
  /** Optional per-section color overrides; omitted section/field inherits the theme. */
  section_colors?: SectionColors | null;
  hero_name_font: string;
  category_banner_style: '' | 'image-overlay' | 'image-only' | 'text-block' | 'striped-rule' | 'color-title' | 'none';
  category_banner_overlay: number;
  category_banner_fit: '' | 'cover' | 'contain' | 'natural';
  category_banner_fit_mobile: '' | 'cover' | 'contain' | 'natural';
  /** Per-role typography overrides for the order/menu page. Opaque blob (camelCase keys) read verbatim by foodyweb. */
  typography?: TypographyOverrides | null;
  /** Custom pages beyond home + menu. Each renders at /r/<slug>/<page.slug> and shows in the nav. */
  pages?: WebsitePageMeta[] | null;
  landing_enabled: boolean;
  /** Whether the customer Stories/Reels page + bottom-nav tab is shown. */
  stories_enabled?: boolean;
  /** Comma-separated order of the mobile bottom-nav page tabs ("menu","stories"). First = default landing tab. */
  nav_order?: string;
  checkout_config?: CheckoutConfig | null;
  order_page_info?: OrderPageInfo | null;
  // Draft / publish workflow (added in v2)
  draft_dirty?: boolean;
  draft_saved_at?: string | null;
  published_at?: string | null;
}

// ─── Typography overrides ────────────────────────────────────────────────
// Stored as an opaque JSON blob on WebsiteConfig.typography (the server never
// inspects its internals). foodyweb reads the SAME camelCase shape verbatim in
// lib/themes/typography.ts — keep the two in sync.
export type TypographyRoleKey = 'categoryBar' | 'categoryTitle' | 'itemName' | 'itemPrice' | 'itemDescription';

export interface TypographyRoleOverride {
  /** Curated font family. Empty/absent = inherit the pairing's font. */
  font?: string;
  /** Size multiplier relative to the role's base size. 1 = unchanged. */
  sizeMult?: number;
  /** Font weight (100-900). Absent = keep the section's default weight. */
  weight?: number;
  /** Text case. Absent = Auto (keep the theme's behavior). */
  transform?: 'uppercase' | 'none';
}

/** One uploaded font file = one @font-face at a given weight/style. A custom
 *  family groups several of these (e.g. Léger 300 + Solide 700). */
export interface FontFace {
  /** S3 source of the font file. */
  url: string;
  /** S3 object key — kept so the file can be deleted when the font/variant is removed. */
  key?: string;
  /** CSS @font-face format() hint: 'woff2' | 'woff' | 'truetype' | 'opentype'. */
  format?: string;
  /** Weight this file provides (100-900). Absent = unweighted (matches any). */
  weight?: number;
  /** 'italic' when the file is an italic/oblique cut. Absent = normal. */
  style?: 'normal' | 'italic';
}

/** A font the restaurant added to its own library, beyond the curated list.
 *  Three kinds share this shape:
 *   - Google Fonts picked from the browser (no `url`/`faces`): weights are
 *     stored so foodyweb can load the real axes.
 *   - Single-file custom fonts (`url` set, `category: 'custom'`): one uploaded
 *     file loaded via @font-face.
 *   - Multi-variant custom fonts (`faces` set): several uploaded files grouped
 *     under one family, each an @font-face at its own weight/style. `weights`
 *     lists the covered weights so the style picker offers them.
 *  Presence of `url` or `faces` marks a custom (uploaded) font. */
export interface ExtraFont {
  family: string;
  category: 'sans' | 'serif' | 'display' | 'handwriting' | 'mono' | 'custom';
  weights: number[];
  supportsHebrew: boolean;
  /** Single-file custom source (S3). Legacy/simple case; `faces` supersedes it. */
  url?: string;
  /** CSS @font-face format() hint for the single-file `url`. */
  format?: string;
  /** Multi-variant custom faces — one uploaded file per weight/style. */
  faces?: FontFace[];
}

export interface TypographyOverrides {
  roles?: Partial<Record<TypographyRoleKey, TypographyRoleOverride>>;
  /** Restaurant-curated Google Fonts additions, offered alongside the curated list. */
  extraFonts?: ExtraFont[];
  /** Font weight for the hero restaurant name. Absent = hero's default weight. */
  heroWeight?: number;
}

// Custom website page metadata. Stored on WebsiteConfig.pages; the page's
// content is the set of WebsiteSection rows whose `page` equals the slug.
export interface WebsitePageMeta {
  slug: string;
  label: string;
  sort_order: number;
}

// ─── Checkout-form builder ──────────────────────────────────────────────
// Mirrors foodyserver/internal/restaurants/checkout_config.go. Null/undefined
// means "use legacy flow" — the foodyweb checkout falls back to the hard-coded
// fields it had before this feature shipped.

export type CheckoutFieldKind = 'builtin' | 'custom';
export type CheckoutFieldType = 'text' | 'textarea' | 'tel' | 'email' | 'select' | 'checkbox';
export type CheckoutVisibilityOperator = 'equals' | 'not_empty' | 'one_of';

export interface CheckoutVisibilityRule {
  field: string;
  operator: CheckoutVisibilityOperator;
  value?: string | number | boolean;
  values?: string[];
}

export interface CheckoutOption {
  value: string;
  label?: Record<string, string>;
}

export interface CheckoutFieldConfig {
  id: string;
  kind: CheckoutFieldKind;
  type?: CheckoutFieldType;
  enabled: boolean;
  required: boolean;
  label?: Record<string, string>;
  placeholder?: Record<string, string>;
  options?: CheckoutOption[];
  visible_when?: CheckoutVisibilityRule | null;
}

export interface CheckoutFormConfig {
  require_auth: boolean;
  address_autocomplete?: boolean;
  fields: CheckoutFieldConfig[];
}

export interface CheckoutConfig {
  delivery?: CheckoutFormConfig | null;
  pickup?: CheckoutFormConfig | null;
  confirmation?: ConfirmationConfig | null;
  // When true, the guest order page's fulfilment chip is read-only (no
  // "Modifier" affordance) and the customer picks pickup/delivery only at
  // checkout. Mirrors foodyserver CheckoutConfig.LockOrderType.
  lock_order_type?: boolean;
}

export interface ConfirmationAction {
  id: string;
  kind: 'builtin' | 'custom';
  enabled: boolean;
  label?: Record<string, string>;
  config?: Record<string, unknown>;
}

export interface ConfirmationFAQ {
  question?: Record<string, string>;
  answer?: Record<string, string>;
}

// ConfirmationDelivery controls what delivery / courier info the confirmation
// page surfaces. Mirrors the server's restaurants.ConfirmationDelivery.
export interface ConfirmationDelivery {
  show_courier?: boolean;
  show_eta?: boolean;
  note?: string;
}

export interface ConfirmationConfig {
  title?: Record<string, string>;
  subtitle?: Record<string, string>;
  actions?: ConfirmationAction[];
  faq?: ConfirmationFAQ[];
  delivery?: ConfirmationDelivery;
}

// Built-in confirmation action ids — order matches what the foodyweb tracking
// page shows by default before any owner customisation.
export const BUILTIN_CONFIRMATION_ACTIONS: ReadonlyArray<{ id: string; defaultEnabled: boolean }> = [
  { id: 'track_order',  defaultEnabled: true  },
  { id: 'view_receipt', defaultEnabled: true  },
  { id: 'new_order',    defaultEnabled: true  },
  { id: 'whatsapp',     defaultEnabled: false },
];

export function defaultConfirmationConfig(): ConfirmationConfig {
  return {
    actions: BUILTIN_CONFIRMATION_ACTIONS.map((a) => ({
      id: a.id,
      kind: 'builtin' as const,
      enabled: a.defaultEnabled,
    })),
    faq: [],
  };
}

// Built-in field catalogue per order type. The IDs match the server's
// builtinDeliveryFields / builtinPickupFields maps. Owners can disable, retitle,
// reorder, and toggle required, but the mapping to Order columns is fixed.
export const BUILTIN_DELIVERY_FIELDS: ReadonlyArray<{ id: string; type: CheckoutFieldType; defaultRequired: boolean }> = [
  { id: 'customer_first_name', type: 'text',  defaultRequired: false },
  { id: 'customer_name',    type: 'text',     defaultRequired: true  },
  { id: 'customer_phone',   type: 'tel',      defaultRequired: true  },
  { id: 'delivery_address', type: 'text',     defaultRequired: true  },
  { id: 'delivery_city',    type: 'text',     defaultRequired: true  },
  { id: 'delivery_floor',   type: 'text',     defaultRequired: false },
  { id: 'delivery_apt',     type: 'text',     defaultRequired: false },
  { id: 'delivery_entry_code', type: 'text',  defaultRequired: false },
  { id: 'delivery_notes',   type: 'textarea', defaultRequired: false },
  { id: 'whatsapp_number',  type: 'tel',      defaultRequired: false },
];

export const BUILTIN_PICKUP_FIELDS: ReadonlyArray<{ id: string; type: CheckoutFieldType; defaultRequired: boolean }> = [
  { id: 'customer_first_name', type: 'text', defaultRequired: false },
  { id: 'customer_name',   type: 'text',     defaultRequired: true  },
  { id: 'customer_phone',  type: 'tel',      defaultRequired: true  },
  { id: 'pickup_notes',    type: 'textarea', defaultRequired: false },
  { id: 'whatsapp_number', type: 'tel',      defaultRequired: false },
];

// Builtins that are part of the catalogue (offered as addable chips) but OFF in
// the default/legacy form, so opening the editor never silently introduces them.
const OPT_IN_BUILTINS = new Set(['whatsapp_number', 'customer_first_name']);

export function legacyCheckoutForm(orderType: 'delivery' | 'pickup'): CheckoutFormConfig {
  const fields = (orderType === 'delivery' ? BUILTIN_DELIVERY_FIELDS : BUILTIN_PICKUP_FIELDS).map((f) => ({
    id: f.id,
    kind: 'builtin' as const,
    enabled: !OPT_IN_BUILTINS.has(f.id),
    required: f.defaultRequired,
  }));
  return { require_auth: true, fields };
}

export interface ThemeCatalogEntry {
  id: string;
  name: string;
  description: string;
  mode: 'dark' | 'light';
  preview: { swatches: [string, string, string, string]; sampleImage: string };
  suggestedFor: string[];
  tokens: Record<string, unknown>;
  layout: Record<string, unknown>;
}

export interface TypographyPairingEntry {
  id: string;
  name: string;
  description: string;
  pairing: {
    displayLatin: { family: string; weights: number[] };
    bodyLatin: { family: string; weights: number[] };
    displayHebrew: { family: string; weights: number[] };
    bodyHebrew: { family: string; weights: number[] };
  };
  scale: Record<string, unknown>;
}

export interface ThemeCatalog {
  themes: ThemeCatalogEntry[];
  typography_pairings: TypographyPairingEntry[];
}

export async function getThemeCatalog(): Promise<ThemeCatalog> {
  return apiFetch<ThemeCatalog>(`/api/v1/public/themes/catalog`);
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

// ─── Dashboard Analytics Types ──────────────────────────────────────────────

export interface HourlyBucket {
  hour: number;
  order_count: number;
  total_amount: number;
}

export interface DaySummary {
  date: string;
  gross_sales: number;
  net_sales: number;
  transactions: number;
  avg_sale: number;
  items_sold: number;
  tips: number;
  discounts: number;
  labor_percent: number;
}

export interface HourlyPair {
  hour: number;
  current_amt: number;
  previous_amt: number;
  current_count: number;
  previous_count: number;
}

export interface ComparisonResult {
  current: DaySummary;
  previous: DaySummary;
  hourly: HourlyPair[];
}

// Named-period totals (session-grouped) for the dashboard period toggle.
export type AnalyticsRange = 'today' | 'yesterday' | 'week' | 'month';

/** Analytics period scope: a named preset OR an explicit inclusive date window
 *  (YYYY-MM-DD). The server resolves from/to against the restaurant's timezone
 *  and computes the previous period as the equal-length window before it. */
export type AnalyticsScope = AnalyticsRange | { from: string; to: string };

/** Which date orders are bucketed by: 'created' (when placed) or 'serie' (the
 *  série/fulfillment date, i.e. scheduled_for). Matches the server's
 *  common.DateBasis* constants. Omitted/created is the default everywhere. */
export type DateBasis = 'created' | 'serie';

/** Serializes an analytics scope into query params for the period/top-sellers
 *  endpoints. A string becomes `range=`, a window becomes `from=&to=`. */
function analyticsScopeParams(scope?: AnalyticsScope): Record<string, string> {
  if (!scope) return {};
  if (typeof scope === 'string') return { range: scope };
  return { from: scope.from, to: scope.to };
}

/** Serializes the date basis; only 'serie' is sent (created is the server default). */
function dateBasisParams(basis?: DateBasis): Record<string, string> {
  return basis === 'serie' ? { basis: 'serie' } : {};
}

export interface RangeSummary {
  total_orders: number;
  total_revenue: number;
  avg_ticket: number;
  items_sold: number;
  start: string;
  end: string;
}

export interface PeriodComparison {
  current: RangeSummary;
  previous: RangeSummary;
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
  /** Last known delivery address, from the customer's most recent delivery order. */
  address?: string;
  city?: string;
  floor?: string;
  apt?: string;
  entry_code?: string;
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

/** A distinct delivery address the customer has used, with usage stats. */
export interface CustomerAddress {
  address: string;
  city: string;
  floor: string;
  apt: string;
  entry_code: string;
  order_count: number;
  last_used: string;
}

export interface CustomerDetailResponse extends CustomerInsight {
  orders: OrderBrief[];
  product_breakdown: ProductBreakdown[];
  monthly_spending: MonthlySpend[];
  /** Every distinct delivery address used, most-recent first. */
  addresses: CustomerAddress[];
}

// ─── Sales by Item (analytics) Types ─────────────────────────────────────────

/** One item's aggregated sales within the selected window. */
export interface ItemSalesInsight {
  menu_item_id: number;
  name: string;
  category_name: string;
  quantity: number;
  revenue: number;
  avg_price: number;
  order_count: number;
  /** Units and attributed revenue sold inside combos (à-la-carte = total − combo). */
  combo_quantity: number;
  combo_revenue: number;
  /** Share of the window's total item revenue, 0–100. */
  pct_of_revenue: number;
}

/** Paginated response for the item-sales list, with window totals for the KPI strip. */
export interface ItemSalesListResult {
  items: ItemSalesInsight[];
  total: number;
  page: number;
  per_page: number;
  /** Item line revenue only (price × quantity) — excludes delivery and combo base. */
  total_revenue: number;
  total_quantity: number;
  items_sold: number;
  /**
   * Reconciliation with the dashboard's gross revenue. Over the same window:
   * total_revenue + delivery_total + combo_extras_total − discount_total = gross_revenue.
   * gross_revenue equals the dashboard's Revenu brut for the same window/basis.
   */
  gross_revenue: number;
  delivery_total: number;
  discount_total: number;
  combo_extras_total: number;
  /** Units sold inside combos and the revenue attributed to them (part of total_revenue). */
  combo_revenue_total: number;
  combo_quantity_total: number;
}

export interface ItemDailyPoint {
  date: string;
  quantity: number;
  revenue: number;
}

export interface ItemTopCustomer {
  customer_phone: string;
  customer_name: string;
  orders: number;
  quantity: number;
  revenue: number;
  combo_quantity: number;
  combo_revenue: number;
}

export interface ItemVariantBreakdown {
  variant_name: string;
  quantity: number;
  revenue: number;
  combo_quantity: number;
  combo_revenue: number;
}

/** Full drill-down for one item within the selected window. */
export interface ItemSalesDetail {
  menu_item_id: number;
  name: string;
  category_name: string;
  quantity: number;
  revenue: number;
  order_count: number;
  avg_price: number;
  /** Units and attributed revenue sold inside combos (à-la-carte = total − combo). */
  combo_quantity: number;
  combo_revenue: number;
  daily: ItemDailyPoint[];
  top_customers: ItemTopCustomer[];
  order_type_breakdown: Record<string, number>;
  order_source_breakdown: Record<string, number>;
  variants: ItemVariantBreakdown[];
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
  supplier_id?: number | null;
  category: string;
  notes: string;
  unit_content?: number;
  unit_content_unit?: string;
  pack_size: number;
  container_type: string;
  unit_type: string;
  /** @deprecated cost_per_unit is always ex-VAT now. Field kept for backward parsing only. */
  price_includes_vat: boolean;
  /** Per-item VAT rate. `null` means "use restaurant default". `0` means exempt (e.g. Israeli produce). */
  vat_rate_override: number | null;
  image_url: string;
  sku: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  aliases?: StockItemAlias[];
  /** Per-item conversions from a custom unit to this item's base unit. */
  unit_conversions?: StockItemUnitConversion[];
}

// ─── Custom units ───────────────────────────────────────────────────────────

/** A restaurant-defined measurement unit (e.g. "piece", "slice"). Managed from
 *  the Units screen; the concrete size of one custom unit is set per stock item
 *  via StockItemUnitConversion. */
export interface CustomUnit {
  id: number;
  restaurant_id: number;
  name: string;
  abbreviation: string;
  created_at: string;
  updated_at: string;
}

export interface CustomUnitInput {
  name: string;
  abbreviation?: string;
}

/** How much of a stock item's base unit equals one custom unit
 *  (e.g. base_quantity 0.15 with the item's unit = kg means 1 piece = 0.15 kg). */
export interface StockItemUnitConversion {
  id: number;
  stock_item_id: number;
  custom_unit_id: number;
  base_quantity: number;
  custom_unit?: CustomUnit;
}

/** Write payload for a single per-item conversion (see StockItemInput.unit_conversions). */
export interface UnitConversionInput {
  custom_unit_id: number;
  base_quantity: number;
}

// StockItemAliasInput mirrors the server's write payload: the list replaces
// the item's alias set when passed to create/update (nil/absent = untouched).
export interface StockItemAliasInput {
  alias: string;
  language: string;
}

export interface StockCategory {
  /** Metadata-row id. 0 when no StockCategoryMeta row exists yet (category
   *  is implied by a distinct `category` string on one or more items). */
  id: number;
  name: string;
  color: string;
  image_url: string;
  sort_order: number;
  is_active: boolean;
}

export interface StockCategoryInput {
  name: string;
  color?: string;
  image_url?: string;
  sort_order?: number;
  is_active?: boolean;
}

export interface PrepCategory {
  id: number;
  name: string;
  color: string;
  image_url: string;
  sort_order: number;
  is_active: boolean;
}

export type PrepCategoryInput = StockCategoryInput;

export interface StockTransaction {
  id: number;
  stock_item_id: number;
  restaurant_id: number;
  type: StockTransactionType;
  quantity_delta: number;
  notes: string;
  batch_id: string;
  document_url?: string;
  document_type?: string;
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
  supplier_id?: number | null;
  category?: string;
  notes?: string;
  unit_content?: number;
  unit_content_unit?: string;
  pack_size?: number;
  container_type?: string;
  unit_type?: string;
  /** @deprecated cost_per_unit is always ex-VAT now. UI should stop writing this. */
  price_includes_vat?: boolean;
  /** Per-item VAT rate. Omit or send `null` to use restaurant default; `0` for exempt. */
  vat_rate_override?: number | null;
  image_url?: string;
  sku?: string;
  is_active?: boolean;
  aliases?: StockItemAliasInput[];
  /** nil/absent = leave conversions untouched; non-nil (incl. []) = replace them. */
  unit_conversions?: UnitConversionInput[];
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
  prep_time_mins?: number;
  is_active: boolean;
  cost_per_unit: number;
  created_at: string;
  updated_at: string;
  ingredients?: PrepItemIngredient[];
  recipe_steps?: PrepRecipeStep[];
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

export interface IngredientVariantOverride {
  id?: number;
  ingredient_id?: number;
  option_id: number;
  quantity: number;
  unit?: string;
}

export interface MenuItemIngredient {
  id: number;
  menu_item_id: number;
  // option_id = null → base recipe (applies to every variant).
  // option_id set   → variant-specific ingredient (lives on that variant).
  option_id?: number | null;
  stock_item_id?: number;
  prep_item_id?: number;
  quantity_needed: number;
  unit?: string;
  created_at: string;
  stock_item?: StockItem;
  prep_item?: PrepItem;
  variant_overrides?: IngredientVariantOverride[];
}

export interface IngredientInput {
  option_id?: number | null;
  stock_item_id?: number;
  prep_item_id?: number;
  quantity_needed: number;
  unit?: string;
  variant_overrides?: IngredientVariantOverride[];
}

export interface PrepIngredientInput {
  stock_item_id: number;
  quantity_needed: number;
}

export interface DeliveryItem {
  original_name: string;
  translated_name: string;
  sku: string;
  quantity: number;
  unit: string;
  pack_count: number;
  units_per_pack: number;
  unit_size: number;
  unit_size_unit: string;
  container_type: string;
  unit_type: string;
  category: string;
  estimated_cost: number;
  price_per_pack: number;
  total_price: number;
  matched_item_id?: number;
  matched_item_name: string;
  confidence: number;
  is_new: boolean;
  row_index?: number;
  needs_review?: boolean;
  review_reason?: string;
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
  sku?: string;
  quantity: number;
  unit: string;
  category: string;
  cost_per_unit: number;
  pack_count?: number;
  units_per_pack?: number;
  price_per_pack?: number;
  total_price?: number;
  unit_size?: number;
  unit_size_unit?: string;
  container_type?: string;
  unit_type?: string;
  /** @deprecated cost is always ex-VAT now. */
  price_includes_vat?: boolean;
  vat_rate_override?: number | null;
  skipped?: boolean;
  row_index?: number;
  needs_review?: boolean;
  review_reason?: string;
}

export interface ConfirmDeliveryInput {
  supplier_name: string;
  /** S3 URL of the scanned bill, propagated from the import draft so the
   *  Approvisionnement page can render the document. */
  document_url?: string;
  document_type?: string;
  items: ConfirmDeliveryItemInput[];
}

export interface DailyPlanItem {
  prep_item_id: number;
  prep_item_name: string;
  unit: string;
  current_qty: number;
  required_qty: number;
  shortfall_qty: number;
  batches_needed: number;
  yield_per_batch: number;
  shelf_life_hours: number;
  category: string;
  priority: 'high' | 'medium' | 'low';
}

export interface DemandForecastItem {
  menu_item_id: number;
  menu_item_name: string;
  predicted_quantity: number;
  day_of_week: number;
}

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

// ─── Session storage ──────────────────────────────────────────────────────────
// "Remember me" decides where the session lives: localStorage survives PWA
// restarts (stay signed in), sessionStorage is wiped when the app/tab closes.
// Reads check both stores so an in-flight session works whichever one holds it.

function readAuthValue(key: string): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(key) ?? sessionStorage.getItem(key);
}

/** Writes a full session to the store chosen by `remember`, clearing any copy
 *  left in the other store so a token never lingers where it shouldn't. */
function persistSession(token: string, user: User, restaurantIds: number[], remember: boolean) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(REMEMBER_KEY, remember ? '1' : '0');
  const store = remember ? localStorage : sessionStorage;
  const other = remember ? sessionStorage : localStorage;
  [TOKEN_KEY, USER_KEY, RIDS_KEY].forEach((k) => other.removeItem(k));
  store.setItem(TOKEN_KEY, token);
  store.setItem(USER_KEY, JSON.stringify(user));
  store.setItem(RIDS_KEY, JSON.stringify(restaurantIds));
}

export function getToken(): string | null {
  return readAuthValue(TOKEN_KEY);
}

/** Milliseconds until the stored token's `exp` (negative if already expired),
 *  or null when there's no token or no exp claim. Used to refresh proactively. */
export function tokenTimeToExpiryMs(): number | null {
  const token = getToken();
  if (!token) return null;
  const claims = parseJwtClaims(token);
  const exp = typeof claims?.exp === 'number' ? claims.exp : null;
  return exp === null ? null : exp * 1000 - Date.now();
}

/** Swaps the current (possibly recently-expired) token for a fresh one via the
 *  server's refresh endpoint, keeping the same remember-me store. Returns the
 *  new token, or null when refresh isn't possible (no session, beyond the 7-day
 *  grace window, user removed, or offline) — callers treat null as "log out". */
export async function refreshToken(): Promise<string | null> {
  const token = getToken();
  const user = getStoredUser();
  if (!token || !user) return null;
  try {
    const res = await fetch(`${API_URL}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.token) return null;
    const remember = readAuthValue(REMEMBER_KEY) !== '0';
    const claims = parseJwtClaims(data.token);
    const rids = (claims?.restaurant_ids as number[]) ?? getStoredRestaurantIds();
    persistSession(data.token, user, rids, remember);
    return data.token;
  } catch {
    return null;
  }
}

/** Error thrown by apiFetch on a non-ok response. `message` is the server's
 *  top-level `error` (a short code/label); `details` carries the human-readable
 *  `details` field when present (e.g. "CAVIAR (250g) is sold out…"), so callers
 *  can show the specific reason instead of the generic message. */
export class ApiError extends Error {
  status: number;
  details?: string;
  constructor(message: string, status: number, details?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

export async function apiFetch<T>(
  path: string,
  restaurantId?: number,
  options?: RequestInit,
  _retried = false,
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
    // Auth endpoints (login, refresh, setup, reset) use 401 to mean "bad
    // credentials" — surface that to the caller instead of hijacking it.
    const isAuthEndpoint = path.startsWith('/api/v1/auth/');
    if (res.status === 401 && typeof window !== 'undefined' && !isAuthEndpoint) {
      // Token expired mid-session: try one silent refresh and replay the
      // request before forcing a re-login.
      if (!_retried) {
        const refreshed = await refreshToken();
        if (refreshed) return apiFetch<T>(path, restaurantId, options, true);
      }
      // Refresh impossible (beyond grace window / revoked) — clear and re-login.
      logout();
      window.location.href = '/login';
      // Stop execution — don't throw, which could trigger competing redirects
      return new Promise<never>(() => {});
    }
    const body = await res.json().catch(() => ({}));
    const detail = typeof body.details === 'string' ? body.details : undefined;
    throw new ApiError(body.error || body.message || `API error ${res.status}`, res.status, detail);
  }
  if (res.status === 204 || res.headers.get('content-length') === '0') {
    return undefined as T;
  }
  return res.json();
}

// ─── Order workflow builder ──────────────────────────────────────────────────
// Per-order-type pipelines. Each stage has a free-form name, a semantic `kind`
// the engine understands, automation triggers, and a customer-notify toggle.

export type WorkflowStageKind = 'received' | 'in_progress' | 'ready' | 'out_for_delivery' | 'completed';
export type WorkflowOrderType = 'pickup' | 'dine_in' | 'delivery';

export interface WorkflowStage {
  id?: number;
  name: string;
  kind: WorkflowStageKind;
  color?: string;
  trigger_payment_confirmed: boolean;
  trigger_production_done: boolean;
  trigger_courier_assigned: boolean;
  trigger_courier_delivered: boolean;
  notify_customer: boolean;
  customer_message?: string;
}

export interface OrderWorkflow {
  id: number;
  order_type: WorkflowOrderType;
  template_source: string; // full | simple | custom
  stages: WorkflowStage[];
}

/** GET /api/v1/order-workflows — one pipeline per order type (seeded on first read). */
export async function getOrderWorkflows(restaurantId: number): Promise<OrderWorkflow[]> {
  const data = await apiFetch<{ workflows: OrderWorkflow[] }>('/api/v1/order-workflows', restaurantId);
  return data.workflows ?? [];
}

/** PUT /api/v1/order-workflows/:orderType — replace one pipeline wholesale. */
export async function updateOrderWorkflow(
  restaurantId: number,
  orderType: WorkflowOrderType,
  stages: WorkflowStage[]
): Promise<OrderWorkflow> {
  return apiFetch<OrderWorkflow>(`/api/v1/order-workflows/${orderType}`, restaurantId, {
    method: 'PUT',
    body: JSON.stringify({ stages }),
  });
}

/** DELETE /api/v1/order-workflows/:orderType — reset one pipeline to the default template. */
export async function resetOrderWorkflow(
  restaurantId: number,
  orderType: WorkflowOrderType
): Promise<OrderWorkflow> {
  return apiFetch<OrderWorkflow>(`/api/v1/order-workflows/${orderType}`, restaurantId, {
    method: 'DELETE',
  });
}

// ─── Saved date ranges (orders filter presets) ───────────────────────────────
// Reusable filter windows for the orders list (e.g. "Vendredi à vendredi").
// Stored as a recurring rule — start_weekday (0=Sun…6=Sat) + length_days — so
// each one re-resolves to its current occurrence rather than freezing on a date.

export interface SavedDateRange {
  id: number;
  name: string;
  start_weekday: number; // 0 = Sunday … 6 = Saturday
  length_days: number; // inclusive span (1 = a single day)
  sort_order: number;
}

/** GET /api/v1/orders/saved-ranges — the restaurant's saved filter windows. */
export async function getSavedDateRanges(restaurantId: number): Promise<SavedDateRange[]> {
  const data = await apiFetch<{ saved_ranges: SavedDateRange[] }>(
    '/api/v1/orders/saved-ranges',
    restaurantId
  );
  return data.saved_ranges ?? [];
}

/** POST /api/v1/orders/saved-ranges — persist a new saved filter window. */
export async function createSavedDateRange(
  restaurantId: number,
  input: { name: string; start_weekday: number; length_days: number }
): Promise<SavedDateRange> {
  return apiFetch<SavedDateRange>('/api/v1/orders/saved-ranges', restaurantId, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

/** DELETE /api/v1/orders/saved-ranges/:id — remove a saved filter window. */
export async function deleteSavedDateRange(restaurantId: number, id: number): Promise<void> {
  await apiFetch<void>(`/api/v1/orders/saved-ranges/${id}`, restaurantId, {
    method: 'DELETE',
  });
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export interface LoginResponse {
  token: string;
  user: User;
  restaurant_ids: number[];
}

/**
 * Who may use the admin app: platform superadmins, or any staff member linked
 * to at least one restaurant. We no longer gate on the global owner/manager
 * role — per-restaurant permissions decide what each user can see and do
 * (the sidebar and pages are permission-driven). A user with no restaurant
 * link has nothing to manage and is rejected.
 */
export function canAccessAdmin(user: User | null, restaurantIds: number[]): boolean {
  if (!user) return false;
  if (user.role === 'superadmin') return true;
  return restaurantIds.length > 0;
}

export async function login(
  email: string,
  password: string,
  remember = true,
): Promise<LoginResponse> {
  const data = await apiFetch<{ token: string; user: User }>('/api/v1/auth/login', undefined, {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });

  // Decode JWT to get restaurant_ids from claims
  const claims = parseJwtClaims(data.token);
  const restaurantIds: number[] = (claims?.restaurant_ids as number[]) ?? [];

  if (!canAccessAdmin(data.user, restaurantIds)) {
    throw new Error('Access denied. Your account is not linked to any restaurant.');
  }

  persistSession(data.token, data.user, restaurantIds, remember);

  return { token: data.token, user: data.user, restaurant_ids: restaurantIds };
}

export function logout() {
  if (typeof window === 'undefined') return;
  [TOKEN_KEY, USER_KEY, RIDS_KEY, REMEMBER_KEY].forEach((k) => {
    localStorage.removeItem(k);
    sessionStorage.removeItem(k);
  });
}

export function getStoredUser(): User | null {
  const raw = readAuthValue(USER_KEY);
  return raw ? JSON.parse(raw) : null;
}

export function getStoredRestaurantIds(): number[] {
  const raw = readAuthValue(RIDS_KEY);
  return raw ? JSON.parse(raw) : [];
}

export function isAuthenticated(): boolean {
  return !!getToken();
}

// ─── Account Setup (invite flow) ─────────────────────────────────────────────

export interface ValidateInviteResponse {
  valid: boolean;
  // Discriminates the setup flow: 'owner_onboarding' (full wizard) vs 'staff_setup'
  // (password + profile only). Older servers may omit this.
  kind?: 'owner_onboarding' | 'staff_setup';
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

  persistSession(data.token, data.user, restaurantIds, true);

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

  persistSession(data.token, data.user, restaurantIds, true);

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

// ─── Passkeys (WebAuthn / Face ID) ──────────────────────────────────────────
// The server verifies every assertion; the private key never leaves the device.
// Enrolment requires an existing (password) session; login is password-less.

type PasskeyRegOptions = Parameters<typeof startRegistration>[0]['optionsJSON'];
type PasskeyAuthOptions = Parameters<typeof startAuthentication>[0]['optionsJSON'];

export interface PasskeyCredential {
  id: number;
  name: string;
  created_at: string;
  last_used_at?: string;
}

/** True when this browser can use a platform authenticator (Face ID / Touch ID). */
export async function passkeysSupported(): Promise<boolean> {
  if (typeof window === 'undefined' || !browserSupportsWebAuthn()) return false;
  try {
    return await platformAuthenticatorIsAvailable();
  } catch {
    return false;
  }
}

// A UX hint (never a security boundary) remembering that a passkey was enrolled
// or used on THIS device+browser, so the login screen can lead with Face ID and
// hide the password form. A stale hint is harmless: the Face ID prompt simply
// finds nothing and the screen falls back to the password form.
const PASSKEY_DEVICE_KEY = 'foody.passkey.device';

/** Records that a passkey was enrolled or used on this device. */
export function markPasskeyOnDevice(): void {
  try {
    localStorage.setItem(PASSKEY_DEVICE_KEY, '1');
  } catch {
    /* storage unavailable — degrade to password-first login */
  }
}

/** True when a passkey has previously been enrolled or used on this device. */
export function hasPasskeyOnDevice(): boolean {
  try {
    return localStorage.getItem(PASSKEY_DEVICE_KEY) === '1';
  } catch {
    return false;
  }
}

/** Forgets the device passkey hint (e.g. after the last passkey is removed). */
export function clearPasskeyOnDevice(): void {
  try {
    localStorage.removeItem(PASSKEY_DEVICE_KEY);
  } catch {
    /* storage unavailable — nothing to clear */
  }
}

/** Enrols a new passkey for the signed-in user. `name` labels the device. */
export async function registerPasskey(name: string): Promise<PasskeyCredential> {
  const begin = await apiFetch<{ options: { publicKey: PasskeyRegOptions }; session_id: string }>(
    '/api/v1/auth/webauthn/register/begin',
    undefined,
    { method: 'POST' },
  );
  const attestation = await startRegistration({ optionsJSON: begin.options.publicKey });
  const data = await apiFetch<{ credential: PasskeyCredential }>(
    `/api/v1/auth/webauthn/register/finish?session_id=${encodeURIComponent(begin.session_id)}&name=${encodeURIComponent(name)}`,
    undefined,
    { method: 'POST', body: JSON.stringify(attestation) },
  );
  markPasskeyOnDevice();
  return data.credential;
}

/** Password-less, usernameless sign-in: the device offers the passkeys for this
 *  site and the user picks one with Face ID — no email needed. */
export async function loginWithPasskey(remember = true): Promise<LoginResponse> {
  const begin = await apiFetch<{ options: { publicKey: PasskeyAuthOptions }; session_id: string }>(
    '/api/v1/auth/webauthn/login/begin',
    undefined,
    { method: 'POST' },
  );
  const assertion = await startAuthentication({ optionsJSON: begin.options.publicKey });
  const data = await apiFetch<{ token: string; user: User }>(
    `/api/v1/auth/webauthn/login/finish?session_id=${encodeURIComponent(begin.session_id)}`,
    undefined,
    { method: 'POST', body: JSON.stringify(assertion) },
  );
  const claims = parseJwtClaims(data.token);
  const restaurantIds: number[] = (claims?.restaurant_ids as number[]) ?? [];
  if (!canAccessAdmin(data.user, restaurantIds)) {
    throw new Error('Access denied. Your account is not linked to any restaurant.');
  }
  persistSession(data.token, data.user, restaurantIds, remember);
  markPasskeyOnDevice();
  return { token: data.token, user: data.user, restaurant_ids: restaurantIds };
}

/** Lists the signed-in user's registered passkeys, newest first. */
export async function listPasskeys(): Promise<PasskeyCredential[]> {
  const data = await apiFetch<{ credentials: PasskeyCredential[] }>('/api/v1/auth/webauthn/credentials');
  return data.credentials ?? [];
}

/** Removes one of the signed-in user's passkeys. */
export async function deletePasskey(id: number): Promise<void> {
  await apiFetch(`/api/v1/auth/webauthn/credentials/${id}`, undefined, { method: 'DELETE' });
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

// ─── Cibus (Pluxee) terminal credentials (merchant self-serve) ──────────────
// The restaurant enters its own Cibus terminal identity. Cibus must first be
// enabled (selected as the payment provider) by a Foody superadmin; `enabled`
// reflects that. Credentials are write-only from here — reads return masked hints.

export interface CibusCreds {
  enabled: boolean;
  masked_restaurant_id?: string;
  masked_pos_id?: string;
  masked_company_code?: string;
}

export interface UpdateCibusCredsInput {
  cibus_restaurant_id?: string;
  cibus_pos_id?: string;
  cibus_company_code?: string;
}

export async function getCibusCreds(id: number): Promise<CibusCreds> {
  return apiFetch<CibusCreds>(`/api/v1/restaurants/${id}/cibus-credentials`, id);
}

export async function updateCibusCreds(
  id: number, input: UpdateCibusCredsInput
): Promise<{ message: string }> {
  return apiFetch<{ message: string }>(
    `/api/v1/restaurants/${id}/cibus-credentials`, id,
    { method: 'PUT', body: JSON.stringify(input) }
  );
}

// ─── Batch fulfillment config (public-shape) ────────────────────────────────
// Mirrors the foodyserver response from GET /api/v1/public/batch-fulfillment-config/:idOrSlug.
// foodyadmin reads this to drive the carte-page batch picker.

export interface BatchFulfillmentWindow {
  start: string; // "HH:MM"
  end: string;   // "HH:MM"
}

export interface BatchFulfillmentDayInfo {
  date: string;     // "YYYY-MM-DD"
  day_name: string; // e.g. "Friday"
  pickup_window?: BatchFulfillmentWindow;
  delivery_window?: BatchFulfillmentWindow;
}

export interface BatchCycleSummary {
  open_at: string;   // ISO 8601 datetime
  cutoff_at: string; // ISO 8601 datetime
  fulfillment_days: BatchFulfillmentDayInfo[];
}

export interface BatchFulfillmentConfigResponse {
  enabled: boolean;
  ordering_open: boolean;
  current_batch_open_at: string;  // ISO 8601 datetime
  current_batch_cutoff: string;   // ISO 8601 datetime
  cutoff_day_name: string;
  cutoff_time: string;
  open_day_name: string;
  open_time: string;
  fulfillment_days: BatchFulfillmentDayInfo[];
  next_batch_open_at: string;
  next_batch_cutoff: string;
  next_fulfillment_days: BatchFulfillmentDayInfo[];
  upcoming_cycles: BatchCycleSummary[];
  require_prepayment: boolean;
}

export async function getBatchFulfillmentConfig(
  restaurantId: number
): Promise<BatchFulfillmentConfigResponse> {
  return apiFetch<BatchFulfillmentConfigResponse>(
    `/api/v1/public/restaurants/${restaurantId}/batch-fulfillment-config`,
    restaurantId,
  );
}

/** Draft batch config the operator is editing, sent to the preview endpoint. */
export interface BatchPreviewInput {
  batch_order_open_day: number;
  batch_order_open_time: string;
  batch_cutoff_day: number;
  batch_cutoff_time: string;
  batch_fulfillment_days: BatchFulfillmentDay[];
}

/**
 * Computes the upcoming batch cycles for an unsaved configuration. Reuses the
 * server's single date resolver so the admin editor can reflect the exact
 * opening / cutoff / delivery dates a customer would see — catching a cutoff
 * that silently pushes delivery a week out before it is saved.
 */
export async function previewBatchFulfillment(
  restaurantId: number,
  input: BatchPreviewInput
): Promise<{ upcoming_cycles: BatchCycleSummary[] }> {
  return apiFetch<{ upcoming_cycles: BatchCycleSummary[] }>(
    `/api/v1/restaurants/${restaurantId}/batch-preview`,
    restaurantId,
    { method: 'POST', body: JSON.stringify(input) }
  );
}

// ─── Menu translations backfill ──────────────────────────────────────────────

/**
 * Counts of rows touched by a backfill run. All zero is fine — means nothing
 * needed translating.
 */
export interface BackfillResult {
  restaurant_id: number;
  reset: boolean;
  items: number;
  groups: number;
  modifier_sets: number;
  modifiers: number;
  variant_groups: number;
  variants: number;
}

/**
 * Regenerate auto-translations for every customer-visible menu entity owned
 * by the current restaurant. When `reset` is true, existing translations are
 * wiped before refilling — use that after changing the restaurant's source
 * language so values generated under the wrong source assumption don't
 * survive the re-run.
 */
export async function backfillTranslations(
  restaurantId: number,
  reset: boolean = false
): Promise<BackfillResult> {
  const qs = reset ? '?reset=true' : '';
  return apiFetch<BackfillResult>(
    `/api/v1/menu/translations/backfill${qs}`,
    restaurantId,
    { method: 'POST' }
  );
}

// ─── Translation review (preview / edit / apply) ─────────────────────────────

/** One unique source text in a review table: where it is used + its translations. */
export interface TranslationReviewEntry {
  text: string;
  /** kind -> occurrence count, e.g. {item_name: 2, option: 1} */
  usage: Record<string, number>;
  /** locale -> machine translation (source locale excluded) */
  translations: Record<string, string>;
}

/** Machine-translate unique texts into the supported locales. Writes nothing. */
export async function previewTranslations(
  restaurantId: number,
  texts: string[]
): Promise<{ sourceLocale: string; translations: Record<string, Record<string, string>> }> {
  const data = await apiFetch<{ source_locale: string; translations: Record<string, Record<string, string>> }>(
    `/api/v1/menu/translations/preview?restaurant_id=${restaurantId}`, restaurantId,
    { method: 'POST', body: JSON.stringify({ texts }) }
  );
  return { sourceLocale: data.source_locale, translations: data.translations ?? {} };
}

/** One set of source texts sharing a single source language (e.g. all item names). */
export interface TranslationPreviewGroup {
  source_locale: string;
  texts: string[];
}

/**
 * Machine-translate each group FROM its own source language into every locale
 * (the language-aware import). Unlike previewTranslations, the returned map is a
 * FULL per-text locale map (en/fr/he all present, the source slot being the
 * original text) — so a mixed menu with Latin names and Hebrew descriptions is
 * translated correctly per section. Writes nothing.
 */
export async function previewTranslationsGrouped(
  restaurantId: number,
  groups: TranslationPreviewGroup[]
): Promise<Record<string, Record<string, string>>> {
  const data = await apiFetch<{ translations: Record<string, Record<string, string>> }>(
    `/api/v1/menu/translations/preview?restaurant_id=${restaurantId}`, restaurantId,
    { method: 'POST', body: JSON.stringify({ groups }) }
  );
  return data.translations ?? {};
}

/** Gather every catalog text with usage counts + fresh translations. Writes nothing. */
export async function retranslatePreview(
  restaurantId: number
): Promise<{ sourceLocale: string; entries: TranslationReviewEntry[] }> {
  const data = await apiFetch<{ source_locale: string; entries: TranslationReviewEntry[] }>(
    `/api/v1/menu/translations/retranslate-preview?restaurant_id=${restaurantId}`, restaurantId,
    { method: 'POST' }
  );
  return { sourceLocale: data.source_locale, entries: data.entries ?? [] };
}

/**
 * Apply reviewed translations (text -> locale -> value) to every catalog
 * entity whose text matches. An empty value removes that translation.
 */
export async function applyTranslations(
  restaurantId: number,
  entries: Record<string, Record<string, string>>
): Promise<BackfillResult> {
  return apiFetch<BackfillResult>(
    `/api/v1/menu/translations/apply?restaurant_id=${restaurantId}`, restaurantId,
    { method: 'POST', body: JSON.stringify({ entries }) }
  );
}

// ─── Menu ─────────────────────────────────────────────────────────────────────

export async function getMenu(restaurantId: number): Promise<Menu[]> {
  const data = await apiFetch<{ menus: Menu[] }>(
    `/api/v1/menu/?restaurant_id=${restaurantId}`, restaurantId
  );
  return data.menus ?? [];
}

/**
 * Returns all item categories for a restaurant (global, independent of menus).
 * Pass `withRecipeOnly: true` to scope to items that can be costed standalone —
 * excludes combos, combo-only items, and items without any ingredients.
 */
export async function getAllCategories(
  restaurantId: number,
  opts: { withRecipeOnly?: boolean } = {},
): Promise<MenuCategory[]> {
  const params = new URLSearchParams({ restaurant_id: String(restaurantId) });
  if (opts.withRecipeOnly) params.set("with_recipe_only", "true");
  const data = await apiFetch<{ categories: MenuCategory[] }>(
    `/api/v1/menu/item-categories?${params.toString()}`,
    restaurantId,
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

export interface ComboStepPreviewItem {
  menu_item_id: number;
  name: string;
  option_id?: number;
}

/** Runs the server's combo resolver for a draft dynamic step (category or
 *  group) and returns the items a customer would currently see. Source of truth
 *  for the combo editor's "N article(s) disponible(s)" preview — it can never
 *  drift from checkout the way the old client-side estimate did. */
export async function resolveComboStepPreview(
  restaurantId: number,
  params: { sourceType: 'group'; sourceId: number; variantLabel?: string; serieDate?: string },
): Promise<{ items: ComboStepPreviewItem[]; count: number }> {
  const qs = new URLSearchParams({
    restaurant_id: String(restaurantId),
    source_type: params.sourceType,
    source_id: String(params.sourceId),
  });
  if (params.variantLabel && params.variantLabel.trim()) {
    qs.set('variant_label', params.variantLabel.trim());
  }
  // Scope a rotating carte's group step to the batch/série the caller is ordering
  // for (the manual-order picker passes the operator's selected série date).
  if (params.serieDate && params.serieDate.trim()) {
    qs.set('serie_date', params.serieDate.trim());
  }
  const data = await apiFetch<{ items: ComboStepPreviewItem[]; count: number }>(
    `/api/v1/menu/combo/resolve-preview?${qs.toString()}`, restaurantId,
  );
  return { items: data.items ?? [], count: data.count ?? 0 };
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

/** Server-side clone of a carte (menu) with its groups, sub-groups, attached
 *  items, availability hours and locations preserved (the POS display layout is
 *  NOT copied). The copy is named "<source> (copie)". Returns the new menu so
 *  the caller can navigate to it for editing. Mirrors duplicateMenuItem. */
export async function duplicateMenu(restaurantId: number, menuId: number): Promise<Menu> {
  const data = await apiFetch<{ menu: Menu }>(
    `/api/v1/menu/menus/${menuId}/duplicate?restaurant_id=${restaurantId}`, restaurantId,
    { method: 'POST' }
  );
  return data.menu;
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

export async function getPosDisplay(restaurantId: number, menuId: number): Promise<PosDisplayLayout> {
  return apiFetch<PosDisplayLayout>(
    `/api/v1/menu/menus/${menuId}/pos-display?restaurant_id=${restaurantId}`, restaurantId
  );
}

export async function savePosDisplay(
  restaurantId: number, menuId: number, payload: PosDisplayLayout
): Promise<PosDisplayLayout> {
  return apiFetch<PosDisplayLayout>(
    `/api/v1/menu/menus/${menuId}/pos-display?restaurant_id=${restaurantId}`, restaurantId,
    { method: 'PUT', body: JSON.stringify(payload) }
  );
}

export async function createCategory(restaurantId: number, input: { name: string; sort_order?: number; menu_id?: number; parent_id?: number; image_url?: string; pos_enabled?: boolean; web_enabled?: boolean; follows_menu_hours?: boolean; is_hidden?: boolean; is_weekly_rotating?: boolean }): Promise<MenuCategory> {
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

export async function reorderGroups(restaurantId: number, menuId: number, groupIds: number[]): Promise<void> {
  await apiFetch<void>(
    `/api/v1/menu/groups/reorder?restaurant_id=${restaurantId}`, restaurantId,
    { method: 'POST', body: JSON.stringify({ menu_id: menuId, group_ids: groupIds }) }
  );
}

export async function reorderGroupItems(restaurantId: number, groupId: number, itemIds: number[]): Promise<void> {
  await apiFetch<void>(
    `/api/v1/menu/groups/${groupId}/items/reorder?restaurant_id=${restaurantId}`, restaurantId,
    { method: 'POST', body: JSON.stringify({ item_ids: itemIds }) }
  );
}

export interface GroupItemScope {
  /** ISO date "YYYY-MM-DD" — inclusive lower bound. Omit for "from forever". */
  effective_from?: string;
  /** ISO date "YYYY-MM-DD" — inclusive upper bound. Omit for "until forever". */
  effective_until?: string;
}

export async function addItemsToGroup(
  restaurantId: number,
  groupId: number,
  itemIds: number[],
  scope: GroupItemScope = {},
): Promise<void> {
  await apiFetch<void>(
    `/api/v1/menu/groups/${groupId}/items?restaurant_id=${restaurantId}`, restaurantId,
    {
      method: 'POST',
      body: JSON.stringify({
        item_ids: itemIds,
        effective_from: scope.effective_from,
        effective_until: scope.effective_until,
      }),
    }
  );
}

export async function removeItemFromGroup(
  restaurantId: number,
  groupId: number,
  itemId: number,
  /** When set, soft-retire by setting effective_until = that ISO date instead
   *  of hard-deleting the membership. */
  effectiveUntil?: string,
): Promise<void> {
  const qs = new URLSearchParams({ restaurant_id: String(restaurantId) });
  if (effectiveUntil) qs.set('effective_until', effectiveUntil);
  await apiFetch<void>(
    `/api/v1/menu/groups/${groupId}/items/${itemId}?${qs.toString()}`, restaurantId,
    { method: 'DELETE' }
  );
}

export interface MenuGroupMembership {
  id: number;
  menu_group_id: number;
  menu_item_id: number;
  sort_order: number;
  effective_from?: string;
  effective_until?: string;
  item?: MenuItem;
}

export async function listGroupMemberships(
  restaurantId: number,
  groupId: number,
): Promise<MenuGroupMembership[]> {
  const data = await apiFetch<{ memberships: MenuGroupMembership[] }>(
    `/api/v1/menu/groups/${groupId}/memberships?restaurant_id=${restaurantId}`, restaurantId,
  );
  return data.memberships ?? [];
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

/** Server-side clone of a menu item plus its full configuration (modifiers,
 *  variants, ingredients, combo steps, menu group memberships, etc.). The new
 *  item lands inactive with " (copie)" suffixed to the name so the operator
 *  can adjust before publishing. Returns the new item's ID. */
export async function duplicateMenuItem(restaurantId: number, id: number): Promise<{ id: number }> {
  const data = await apiFetch<{ id: number }>(
    `/api/v1/menu/items/${id}/duplicate?restaurant_id=${restaurantId}`, restaurantId,
    { method: 'POST' }
  );
  return data;
}

/** Force a fresh auto-translation pass on a single menu item. Pass `fields`
 *  to refresh only some (e.g. `['name']`); omit it to refresh every
 *  translatable field. Returns the new translation map so the caller can
 *  apply it to in-memory editor state without a full reload. */
export async function retranslateMenuItem(
  restaurantId: number,
  id: number,
  fields?: string[],
): Promise<TranslationMap> {
  const qs = new URLSearchParams({ restaurant_id: String(restaurantId) });
  if (fields && fields.length > 0) qs.set('fields', fields.join(','));
  const data = await apiFetch<{ translations: TranslationMap | null }>(
    `/api/v1/menu/items/${id}/retranslate?${qs.toString()}`, restaurantId,
    { method: 'POST' },
  );
  return data.translations ?? {};
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

export async function uploadGroupImage(restaurantId: number, groupId: number, file: File): Promise<string> {
  const form = new FormData();
  form.append('image', file);
  const token = getToken();
  const res = await fetch(`${API_URL}/api/v1/menu/groups/${groupId}/image?restaurant_id=${restaurantId}`, {
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
  stock_item_id?: number | null;
  prep_item_id?: number | null;
  quantity?: number;
  unit?: string;
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
  stock_item_id?: number | null;
  prep_item_id?: number | null;
  quantity?: number;
  unit?: string;
  translations?: TranslationMap;
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
  enabled_verbs?: string[];
  sort_order?: number;
  modifiers?: ModifierInSetInput[];
  translations?: TranslationMap;
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

export async function duplicateModifierSet(restaurantId: number, id: number): Promise<ModifierSet> {
  const data = await apiFetch<{ modifier_set: ModifierSet }>(
    `/api/v1/menu/modifier-sets/${id}/duplicate?restaurant_id=${restaurantId}`, restaurantId,
    { method: 'POST' }
  );
  return data.modifier_set;
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

export async function setModifierSetItemOverrides(
  restaurantId: number,
  setId: number,
  menuItemId: number,
  input: ModifierSetItemOverridesInput,
): Promise<void> {
  await apiFetch<void>(
    `/api/v1/menu/modifier-sets/${setId}/items/${menuItemId}/overrides?restaurant_id=${restaurantId}`,
    restaurantId,
    { method: 'PUT', body: JSON.stringify(input) },
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

/**
 * Persist edits to an existing modifier that lives inside a modifier set
 * (name, kitchen name, price, flags, stock link, translations). The set-scoped
 * fields map onto the shared `PUT /menu/modifiers/:id` endpoint, which already
 * scopes by restaurant and supports set-owned modifiers.
 */
export async function updateModifierInSet(restaurantId: number, id: number, input: ModifierInSetInput): Promise<MenuItemModifier> {
  const data = await apiFetch<{ modifier: MenuItemModifier }>(
    `/api/v1/menu/modifiers/${id}?restaurant_id=${restaurantId}`, restaurantId,
    { method: 'PUT', body: JSON.stringify(input) }
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
  /** Short serving-size label shown next to this option (e.g. "250g").
   *  Shared across items using this set. Translatable via the translations map. */
  portion?: string;
  is_active: boolean;
  sort_order: number;
  /** Per-item flag (carried via the override application pass on the server).
   *  True when this option is combo-only on the surrounding item — should be
   *  excluded from à la carte price ranges and cost summaries. */
  is_combo_only?: boolean;
  /** Computed per-size availability ("available" | "sold_out") under the parent
   *  item's stock config. Transient — stamped by the menu service on staff menu
   *  responses. Empty when the item isn't per-size tracked. */
  availability_state?: AvailabilityState;
  /** Units left for this size when known (per-variant pool). */
  stock_remaining?: number | null;
  /** Per-locale name overrides. Source-locale value lives in `name`. */
  translations?: TranslationMap;
}

export interface OptionSet {
  id: number;
  restaurant_id: number;
  name: string;
  sort_order: number;
  options?: OptionSetOption[];
  menu_items?: MenuItem[];
  /** Per-locale name overrides. Source-locale value lives in `name`. */
  translations?: TranslationMap;
}

export interface OptionInSetInput {
  name: string;
  price: number;
  online_price?: number | null;
  sku?: string;
  is_active: boolean;
  sort_order: number;
  translations?: TranslationMap;
}

export interface OptionSetInput {
  name: string;
  sort_order?: number;
  options?: OptionInSetInput[];
  translations?: TranslationMap;
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

export async function updateOptionInSet(restaurantId: number, setId: number, optionId: number, input: OptionInSetInput): Promise<OptionSetOption> {
  const data = await apiFetch<{ option: OptionSetOption }>(
    `/api/v1/menu/option-sets/${setId}/options/${optionId}?restaurant_id=${restaurantId}`, restaurantId,
    { method: 'PUT', body: JSON.stringify(input) }
  );
  return data.option;
}

export async function deleteOptionInSet(restaurantId: number, setId: number, optionId: number): Promise<void> {
  await apiFetch(`/api/v1/menu/option-sets/${setId}/options/${optionId}?restaurant_id=${restaurantId}`, restaurantId, {
    method: 'DELETE',
  });
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
  is_active: boolean;
  /** Hides the variant from à la carte browsing on guest apps; combos that
   *  reference it explicitly still show it. Used for variants that exist
   *  purely for combo recipe scaling (e.g. "Pour Table 8" of a meat item). */
  is_combo_only?: boolean;
}

export interface ItemOptionPriceInput {
  price: number;
  online_price?: number | null;
  sku?: string;
  is_active: boolean;
}

export async function setItemOptionPrice(restaurantId: number, setId: number, itemId: number, optionId: number, input: ItemOptionPriceInput): Promise<ItemOptionOverride> {
  const data = await apiFetch<{ item_option: ItemOptionOverride }>(
    `/api/v1/menu/option-sets/${setId}/items/${itemId}/options/${optionId}?restaurant_id=${restaurantId}`, restaurantId,
    { method: 'PUT', body: JSON.stringify(input) }
  );
  return data.item_option;
}

// Sets (or clears, with null) the per-item predefined-stock count for a single
// option — the write path for "per_variant" stock mode. Narrow by design: it
// never touches price/visibility, unlike the full variants sync.
export async function setItemOptionStock(
  restaurantId: number,
  setId: number,
  itemId: number,
  optionId: number,
  stockQuantity: number | null,
): Promise<ItemOptionOverride> {
  const data = await apiFetch<{ item_option: ItemOptionOverride }>(
    `/api/v1/menu/option-sets/${setId}/items/${itemId}/options/${optionId}/stock?restaurant_id=${restaurantId}`, restaurantId,
    { method: 'PUT', body: JSON.stringify({ stock_quantity: stockQuantity }) },
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

// ── Atomic variants sync for a single item ───────────────────────────────────

export interface VariantSyncInput {
  option_id?: number | null;
  name: string;
  price: number;
  /** Short serving-size label for this option (e.g. "250g"). */
  portion?: string;
  is_active: boolean;
  is_combo_only?: boolean;
  sort_order: number;
  translations?: TranslationMap;
}

export interface VariantGroupSyncInput {
  option_set_id?: number | null;
  name: string;
  sort_order: number;
  variants: VariantSyncInput[];
  translations?: TranslationMap;
}

export interface ItemVariantsSyncInput {
  groups: VariantGroupSyncInput[];
}

export interface ItemVariantsSyncResult {
  option_sets: OptionSet[];
  overrides: ItemOptionOverride[];
}

// Replaces the full variants state for a menu item in one transactional call.
// Creates missing option sets / options, updates existing ones (renames,
// sort, active flags), upserts per-item price+portion overrides, and detaches
// option sets dropped from the payload.
export async function syncItemVariants(
  restaurantId: number,
  itemId: number,
  input: ItemVariantsSyncInput,
): Promise<ItemVariantsSyncResult> {
  return apiFetch<ItemVariantsSyncResult>(
    `/api/v1/menu/items/${itemId}/variants-sync?restaurant_id=${restaurantId}`, restaurantId,
    { method: 'PUT', body: JSON.stringify(input) },
  );
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

export async function importMenuAI(restaurantId: number, file: File): Promise<MenuExtraction> {
  const token = getToken();
  const formData = new FormData();
  formData.append('file', file);
  const params = new URLSearchParams({ restaurant_id: String(restaurantId) });
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

// ─── Wolt menu import (rich) ─────────────────────────────────────────────────
// A RichExtraction is a superset of MenuExtraction: items carry an optional photo
// and option/modifier groups, and the venue logo/cover can be imported. The Wolt
// importer produces it; the photo/PDF importer produces the plain subset.

export interface RichOptionValue {
  name: string;
  price: number; // absolute
}

export interface RichOptionSet {
  name: string;
  default_option_name?: string;
  options: RichOptionValue[];
}

export interface RichModifier {
  name: string;
  price_delta: number;
}

export interface RichModifierSet {
  name: string;
  is_required: boolean;
  min_selections: number;
  max_selections: number;
  modifiers: RichModifier[];
}

export interface RichItem {
  name: string;
  description: string;
  price: number;
  image_url?: string;
  option_sets?: RichOptionSet[];
  modifier_sets?: RichModifierSet[];
}

export interface RichCategory {
  name: string;
  items: RichItem[];
}

export interface RichExtraction {
  categories: RichCategory[];
  restaurant_logo_url?: string;
  restaurant_cover_url?: string;
}

export async function importMenuFromWolt(restaurantId: number, url: string): Promise<RichExtraction> {
  return apiFetch<RichExtraction>(
    `/api/v1/menu/import/url?restaurant_id=${restaurantId}`, restaurantId,
    { method: 'POST', body: JSON.stringify({ url }) }
  );
}

export interface ConfirmMenuImportOptions {
  importBranding?: boolean;
  /** Also create a carte whose groups mirror the imported categories. */
  createCarte?: boolean;
  carteName?: string;
  /** Fill en/he/fr translations in the background after the import. */
  autoTranslate?: boolean;
  /**
   * User-reviewed translations (source text -> locale -> value). When set,
   * entities are created with exactly these translations and the background
   * backfill is skipped. In the language-aware import each entry is a full
   * locale map so the primary-locale value can be promoted to the base column.
   */
  translations?: Record<string, Record<string, string>>;
  /**
   * The restaurant's canonical display language for this import. When it
   * differs from the current default_locale the existing catalog is re-keyed
   * losslessly and default_locale is updated. Empty preserves legacy behaviour.
   */
  primaryLocale?: string;
}

export interface ConfirmMenuImportResult {
  categories: MenuCategory[];
  /** ID of the created carte when createCarte was requested. */
  carteId?: number;
}

export async function confirmMenuImport(
  restaurantId: number,
  extraction: RichExtraction,
  options: ConfirmMenuImportOptions = {}
): Promise<ConfirmMenuImportResult> {
  const data = await apiFetch<{ categories: MenuCategory[]; carte_id?: number }>(
    `/api/v1/menu/import/confirm?restaurant_id=${restaurantId}`, restaurantId,
    {
      method: 'POST',
      body: JSON.stringify({
        ...extraction,
        import_branding: options.importBranding ?? false,
        create_carte: options.createCarte ?? false,
        carte_name: options.carteName ?? '',
        auto_translate: options.autoTranslate ?? false,
        translations: options.translations ?? undefined,
        primary_locale: options.primaryLocale ?? undefined,
      }),
    }
  );
  return { categories: data.categories, carteId: data.carte_id };
}

// ─── Orders ───────────────────────────────────────────────────────────────────

export interface ListOrdersParams {
  status?: string;
  active?: boolean;
  /** Filter on the durable scheduled flag, independent of lifecycle status. */
  is_scheduled?: boolean;
  q?: string;
  type?: string;
  from?: string;
  to?: string;
  /** Which date the from/to window filters on: 'created' (default) or 'serie'. */
  date_field?: DateBasis;
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
  if (params?.is_scheduled) qs.set('is_scheduled', 'true');
  if (params?.q) qs.set('q', params.q);
  if (params?.type) qs.set('type', params.type);
  if (params?.from) qs.set('from', params.from);
  if (params?.to) qs.set('to', params.to);
  if (params?.date_field === 'serie') qs.set('date_field', 'serie');
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

export async function rejectOrder(
  restaurantId: number,
  orderId: number,
  reasonCode: string,
  note = '',
): Promise<void> {
  await apiFetch<void>(`/api/v1/orders/${orderId}/reject?restaurant_id=${restaurantId}`, restaurantId, {
    method: 'POST',
    body: JSON.stringify({ reason_code: reasonCode, note }),
  });
}

// Permanently deletes an order (hard delete, not archive). Restricted to
// restaurant owners/admins on the server. Irreversible.
export async function deleteOrder(restaurantId: number, orderId: number): Promise<void> {
  await apiFetch<void>(`/api/v1/orders/${orderId}?restaurant_id=${restaurantId}`, restaurantId, { method: 'DELETE' });
}

export async function updateOrderStatus(restaurantId: number, orderId: number, status: OrderStatus): Promise<Order> {
  const data = await apiFetch<{ order: Order }>(`/api/v1/orders/${orderId}/status?restaurant_id=${restaurantId}`, restaurantId, {
    method: 'PUT',
    body: JSON.stringify({ status }),
  });
  return data.order;
}

// Manually corrects an order's status to any progression value, bypassing the
// forward-only transition rule. Owner/manager only (enforced server-side). The
// correction is silent for the customer (no WhatsApp) but refreshes POS/admin
// screens and is audit-logged. For undoing a mistake such as an order marked
// "delivered" too soon. Cancelling still goes through rejectOrder.
export async function overrideOrderStatus(
  restaurantId: number,
  orderId: number,
  status: OrderStatus,
  note = '',
): Promise<Order> {
  const data = await apiFetch<{ order: Order }>(`/api/v1/orders/${orderId}/status/override?restaurant_id=${restaurantId}`, restaurantId, {
    method: 'PUT',
    body: JSON.stringify({ status, note }),
  });
  return data.order;
}

// ─── Internal order notes ────────────────────────────────────────────────────
// Free-text staff notes on an order (staff-only, never shown to the customer).
// A stopgap for things without a dedicated feature yet, e.g. recording an ad-hoc
// discount. Any authenticated staff member scoped to the restaurant can add or
// remove them.

export interface OrderNote {
  id: number;
  order_id: number;
  restaurant_id: number;
  author_user_id: number;
  author_name: string;
  body: string;
  created_at: string;
}

export async function getOrderNotes(restaurantId: number, orderId: number): Promise<OrderNote[]> {
  const data = await apiFetch<{ notes: OrderNote[] }>(
    `/api/v1/orders/${orderId}/notes?restaurant_id=${restaurantId}`,
    restaurantId,
  );
  return data.notes ?? [];
}

export async function addOrderNote(restaurantId: number, orderId: number, body: string): Promise<OrderNote> {
  const data = await apiFetch<{ note: OrderNote }>(
    `/api/v1/orders/${orderId}/notes?restaurant_id=${restaurantId}`,
    restaurantId,
    { method: 'POST', body: JSON.stringify({ body }) },
  );
  return data.note;
}

export async function deleteOrderNote(restaurantId: number, orderId: number, noteId: number): Promise<void> {
  await apiFetch<void>(
    `/api/v1/orders/${orderId}/notes/${noteId}?restaurant_id=${restaurantId}`,
    restaurantId,
    { method: 'DELETE' },
  );
}

// overrideOrderPaymentStatus manually corrects an order's payment status
// (paid ⇄ unpaid ⇄ pending), bypassing the forward-only payment transition rule.
// Owner/manager only, and only for cash/manual orders (provider-settled orders
// are rejected server-side and must be refunded). Silent for the customer, but
// refreshes POS/admin screens and is audit-logged. For undoing a mistake such as
// an internal order wrongly marked "paid in cash".
export async function overrideOrderPaymentStatus(
  restaurantId: number,
  orderId: number,
  paymentStatus: PaymentStatus,
  note = '',
): Promise<Order> {
  const data = await apiFetch<{ order: Order }>(
    `/api/v1/orders/${orderId}/payment-status/override?restaurant_id=${restaurantId}`,
    restaurantId,
    {
      method: 'PUT',
      body: JSON.stringify({ payment_status: paymentStatus, note }),
    },
  );
  return data.order;
}

/** Fields staff can correct on an order's customer, from the order screen. */
export interface OrderCustomerDetailsInput {
  name: string;
  /** Delivery fields are only applied for delivery orders (ignored otherwise). */
  delivery_address?: string;
  delivery_city?: string;
  delivery_floor?: string;
  delivery_apt?: string;
  delivery_entry_code?: string;
}

/**
 * Corrects an order's customer name (canonically, keyed by the customer's
 * phone, so it reflects on their other orders and the client page) and — for
 * delivery orders — this order's delivery address. Used to fix typos from the
 * order detail screen. Returns the updated order.
 */
export async function updateOrderCustomerDetails(
  restaurantId: number,
  orderId: number,
  input: OrderCustomerDetailsInput,
): Promise<Order> {
  const data = await apiFetch<{ order: Order }>(
    `/api/v1/orders/${orderId}/customer-details?restaurant_id=${restaurantId}`,
    restaurantId,
    {
      method: 'PUT',
      body: JSON.stringify(input),
    },
  );
  return data.order;
}

async function postOrderAction(restaurantId: number, orderId: number, action: string): Promise<Order> {
  const data = await apiFetch<{ order: Order }>(
    `/api/v1/orders/${orderId}/${action}?restaurant_id=${restaurantId}`,
    restaurantId,
    { method: 'POST' },
  );
  return data.order;
}

export const sendOrderToKitchen = (restaurantId: number, orderId: number) =>
  postOrderAction(restaurantId, orderId, 'send-to-kitchen');
export const markOrderReady = (restaurantId: number, orderId: number) =>
  postOrderAction(restaurantId, orderId, 'mark-ready');
export const markOrderServed = (restaurantId: number, orderId: number) =>
  postOrderAction(restaurantId, orderId, 'mark-served');
export const markOrderReceived = (restaurantId: number, orderId: number) =>
  postOrderAction(restaurantId, orderId, 'mark-received');
export const markOrderReadyForDelivery = (restaurantId: number, orderId: number) =>
  postOrderAction(restaurantId, orderId, 'mark-ready-for-delivery');
export const markOrderOutForDelivery = (restaurantId: number, orderId: number) =>
  postOrderAction(restaurantId, orderId, 'mark-out-for-delivery');
export const markOrderDelivered = (restaurantId: number, orderId: number) =>
  postOrderAction(restaurantId, orderId, 'mark-delivered');

export async function updateOrderPaymentStatus(
  restaurantId: number,
  orderId: number,
  paymentStatus: PaymentStatus,
  paymentMethod?: string,
): Promise<Order> {
  const body: Record<string, string> = { payment_status: paymentStatus };
  if (paymentMethod) body.payment_method = paymentMethod;
  const data = await apiFetch<{ order: Order }>(
    `/api/v1/orders/${orderId}/payment-status?restaurant_id=${restaurantId}`,
    restaurantId,
    { method: 'PUT', body: JSON.stringify(body) },
  );
  return data.order;
}

// ─── By-weight settlement ────────────────────────────────────────────────────

/** One weighed line submitted to the weigh endpoint. */
export interface OrderItemWeightInput {
  order_item_id: number;
  actual_weight_grams: number;
}

/** Result of confirming actual weights on a held by-weight order. */
export interface ConfirmWeightsResult {
  order_id: number;
  final_total: number;
  captured_amount: number;
  hold_amount: number;
  settlement_status: '' | 'held' | 'captured' | 'released' | 'over_hold_flagged';
}

/**
 * Confirm the real weights for a held by-weight order. The server prices each
 * line at `price_per_kg` × grams, captures the card hold up to `hold_amount`,
 * and returns the settled totals. Flags `over_hold_flagged` if the final total
 * exceeded the authorized hold.
 */
export async function confirmOrderWeights(
  restaurantId: number,
  orderId: number,
  weights: OrderItemWeightInput[],
): Promise<ConfirmWeightsResult> {
  return apiFetch<ConfirmWeightsResult>(
    `/api/v1/orders/${orderId}/weigh?restaurant_id=${restaurantId}`,
    restaurantId,
    { method: 'PUT', body: JSON.stringify({ weights }) },
  );
}

// ─── Manual order creation (staff-built orders) ──────────────────────────────

/** One applied modifier on a manually-built order line. `operator` is omitted
 *  — the server derives the conversational verb from the modifier's action. */
export interface CreateOrderModifierInput {
  modifier_id: number;
  applied: boolean;
}

/** One line on a manually-built order. Price is recomputed server-side from the
 *  menu item, selected variant, and modifiers — the client value is ignored. */
export interface CreateOrderItemInput {
  menu_item_id: number;
  quantity: number;
  selected_variant_id?: number;
  notes?: string;
  modifiers?: CreateOrderModifierInput[];
}

/** One picked sub-item within a combo on a manually-built order. */
export interface CreateOrderComboSelectionInput {
  step_id: number;
  menu_item_id: number;
  option_id?: number;
  quantity: number;
  notes?: string;
}

/** One combo (meal-deal) on a manually-built order. The server validates the
 *  step picks (min/max, availability) and computes the price. */
export interface CreateOrderComboInput {
  combo_item_id: number;
  selections: CreateOrderComboSelectionInput[];
  notes?: string;
}

export interface CreateOrderInput {
  order_type: 'pickup' | 'delivery';
  customer_name: string;
  customer_phone: string;
  payment_method?: string;
  /** Initial payment status. Defaults to "unpaid" server-side. Set "paid" when
   *  staff already collected cash/card in person. Ignored when
   *  payment_required is true (the order is then held "pending"). */
  payment_status?: PaymentStatus;
  /** When true the server holds the order pending payment and returns a
   *  payment_url to forward to the customer. */
  payment_required?: boolean;
  // Delivery-only address fields.
  delivery_address?: string;
  delivery_city?: string;
  delivery_floor?: string;
  delivery_apt?: string;
  delivery_entry_code?: string;
  delivery_notes?: string;
  /** Explicit delivery fee for a manual (staff-created) delivery order. The
   *  staff endpoint has no delivery-zone resolution, so this is the only way a
   *  manual delivery order gets a non-zero fee. Ignored server-side for pickup. */
  delivery_fee?: number;
  /** When true the order is created as scheduled (status "scheduled") for
   *  `scheduled_for`. The server persists these for any order. */
  is_scheduled?: boolean;
  scheduled_for?: string;                 // "YYYY-MM-DD"
  scheduled_pickup_window_start?: string; // "HH:MM"
  scheduled_pickup_window_end?: string;   // "HH:MM"
  /** When true the order is pinned onto the production sheet regardless of
   *  scheduling/payment — the "Ajouter au plan de production" checkbox. */
  force_production?: boolean;
  items: CreateOrderItemInput[];
  combos?: CreateOrderComboInput[];
  discount_code?: string;
  manual_discount?: { type: 'fixed' | 'percent'; value: number; reason: string };
}

/** Creates an order manually from the admin (POS-style). Mirrors the staff
 *  `POST /api/v1/orders` endpoint; `order_source` defaults to "manual". */
export async function createOrder(
  restaurantId: number,
  input: CreateOrderInput,
): Promise<{ order: Order; payment_url?: string }> {
  return apiFetch<{ order: Order; payment_url?: string }>(
    `/api/v1/orders?restaurant_id=${restaurantId}`,
    restaurantId,
    { method: 'POST', body: JSON.stringify(input) },
  );
}

/** Adds a single line to an existing order. The server recomputes the line
 *  price (item + variant + modifiers), the order total, and broadcasts
 *  `order.updated`. Mirrors `POST /api/v1/orders/:id/items`. */
export async function addOrderItem(
  restaurantId: number,
  orderId: number,
  input: CreateOrderItemInput,
): Promise<{ item: OrderItem }> {
  return apiFetch<{ item: OrderItem }>(
    `/api/v1/orders/${orderId}/items?restaurant_id=${restaurantId}`,
    restaurantId,
    { method: 'POST', body: JSON.stringify(input) },
  );
}

/** Updates an existing order line wholesale (quantity, notes, variant, and the
 *  full modifier set — modifiers are replaced, not merged). The server
 *  re-resolves the price and recomputes the order total. Mirrors
 *  `PUT /api/v1/orders/items/:itemId`. */
export async function updateOrderItem(
  restaurantId: number,
  itemId: number,
  input: CreateOrderItemInput,
): Promise<{ item: OrderItem }> {
  return apiFetch<{ item: OrderItem }>(
    `/api/v1/orders/items/${itemId}?restaurant_id=${restaurantId}`,
    restaurantId,
    { method: 'PUT', body: JSON.stringify(input) },
  );
}

/** Removes a line from an order. The server recomputes the total and
 *  broadcasts `order.updated`. Mirrors `DELETE /api/v1/orders/:id/items/:itemId`. */
export async function removeOrderItem(
  restaurantId: number,
  orderId: number,
  itemId: number,
): Promise<void> {
  return apiFetch<void>(
    `/api/v1/orders/${orderId}/items/${itemId}?restaurant_id=${restaurantId}`,
    restaurantId,
    { method: 'DELETE' },
  );
}

/** Re-composes an existing combo instance on an order (swaps its component
 *  selections in place). The combo is identified by its `combo_group` UUID; the
 *  server preserves the original base-price snapshot and recomputes only the
 *  per-pick upcharges. `serie_date` pins group-sourced step resolution for
 *  rotating/batch cartes (omit for non-rotating — the server falls back to the
 *  order's scheduled date, else today). */
export interface ReplaceComboInput {
  combo_item_id: number;
  selections: CreateOrderComboSelectionInput[];
  serie_date?: string; // "YYYY-MM-DD"
}

/** Edits a combo's contents on an existing order. Returns the refreshed order so
 *  the caller can re-render the recomputed combo lines and total. Mirrors
 *  `PUT /api/v1/orders/:id/combo/:comboGroup`. */
export async function replaceOrderCombo(
  restaurantId: number,
  orderId: number,
  comboGroup: string,
  input: ReplaceComboInput,
): Promise<{ order: Order }> {
  return apiFetch<{ order: Order }>(
    `/api/v1/orders/${orderId}/combo/${encodeURIComponent(comboGroup)}?restaurant_id=${restaurantId}`,
    restaurantId,
    { method: 'PUT', body: JSON.stringify(input) },
  );
}

/** Fields for retargeting an existing order's fulfillment. Mirrors the server
 *  `orders.FulfillmentInput`. is_scheduled=false + omitted scheduled fields
 *  clears the schedule and sends the order to the kitchen. */
export interface FulfillmentUpdateInput {
  order_type: 'pickup' | 'delivery';
  is_scheduled: boolean;
  scheduled_for?: string;                 // "YYYY-MM-DD"
  scheduled_pickup_window_start?: string; // "HH:MM"
  scheduled_pickup_window_end?: string;   // "HH:MM"
  delivery_address?: string;
  delivery_city?: string;
  delivery_floor?: string;
  delivery_apt?: string;
  delivery_entry_code?: string;
  /** Explicit delivery fee (₪). Omitted → the server leaves the existing fee
   *  unchanged; sent → it replaces the fee and the order total is recomputed.
   *  Ignored server-side for pickup (which always has a zero fee). */
  delivery_fee?: number;
}

/** Updates an existing order's fulfillment (type, address, schedule). The server
 *  adjusts status (immediate<->scheduled) and broadcasts `order.updated`. Mirrors
 *  `PUT /api/v1/orders/:id/fulfillment`. */
export async function updateOrderFulfillment(
  restaurantId: number,
  orderId: number,
  input: FulfillmentUpdateInput,
): Promise<{ order: Order }> {
  return apiFetch<{ order: Order }>(
    `/api/v1/orders/${orderId}/fulfillment?restaurant_id=${restaurantId}`,
    restaurantId,
    { method: 'PUT', body: JSON.stringify(input) },
  );
}

/** Applies, replaces, or removes a staff manual discount on an EXISTING order.
 *  Pass `{ remove: true }` to clear any discount, or `{ type, value, reason }`
 *  to apply/replace one (`type` is 'fixed' ₪ or 'percent'). Gated server-side by
 *  the orders.discount permission. Returns the recomputed order. */
export async function setOrderDiscount(
  restaurantId: number,
  orderId: number,
  input: { remove: true } | { type: 'fixed' | 'percent'; value: number; reason: string },
): Promise<{ order: Order }> {
  return apiFetch<{ order: Order }>(
    `/api/v1/orders/${orderId}/discount?restaurant_id=${restaurantId}`,
    restaurantId,
    { method: 'PUT', body: JSON.stringify(input) },
  );
}

/** (Re)generates a payment link for an existing unpaid/pending order so staff
 *  can copy/share it again. The URL is not persisted server-side — it's minted
 *  on demand by the provider — so each call returns a fresh link. Wraps the
 *  public payment-init endpoint (also used by the guest "retry payment" flow). */
export async function initOrderPaymentLink(
  restaurantId: number,
  orderId: number,
): Promise<{ payment_url?: string }> {
  return apiFetch<{ payment_url?: string }>(
    `/api/v1/public/orders/${orderId}/payment/init?restaurant_id=${restaurantId}`,
    restaurantId,
    { method: 'POST' },
  );
}

export async function collectOrderBalance(
  restaurantId: number,
  orderId: number,
): Promise<{ balance_due: number; payment_url?: string }> {
  return apiFetch<{ balance_due: number; payment_url?: string }>(
    `/api/v1/orders/${orderId}/payment/collect-balance?restaurant_id=${restaurantId}`,
    restaurantId,
    { method: 'POST' },
  );
}

export async function getOrderInvoice(
  restaurantId: number,
  orderId: number,
  documentNumber?: number,
): Promise<{ document_number: number; document_url: string }> {
  const qs = documentNumber != null ? `?document_number=${documentNumber}` : '';
  return apiFetch<{ document_number: number; document_url: string }>(`/api/v1/orders/${orderId}/invoice${qs}`, restaurantId);
}

export async function sendOrderInvoice(
  restaurantId: number,
  orderId: number,
  email?: string,
): Promise<{ sent: boolean }> {
  return apiFetch<{ sent: boolean }>(`/api/v1/orders/${orderId}/invoice/send`, restaurantId, {
    method: 'POST',
    body: JSON.stringify(email ? { email_address: email } : {}),
  });
}

// Fetches the Summit invoice PDF bytes through our server (Summit forces a
// download + blocks cross-origin fetches, so we proxy it). The caller turns the
// Blob into an object URL to view inline or download.
export async function fetchOrderInvoicePdf(
  restaurantId: number,
  orderId: number,
  documentNumber?: number,
): Promise<Blob> {
  const token = getToken();
  const qs = documentNumber != null ? `?document_number=${documentNumber}` : '';
  const res = await fetch(`${API_URL}/api/v1/orders/${orderId}/invoice/pdf${qs}`, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'X-Restaurant-ID': String(restaurantId),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || body.message || `API error ${res.status}`);
  }
  return res.blob();
}

// ─── Kitchen Plan (scheduled-orders aggregation) ─────────────────────────────

export interface KitchenPlanModifierBreakdown {
  modifier_label: string;
  quantity: number;
}

export interface KitchenPlanItem {
  menu_item_id: number;
  name: string;
  variant?: string;
  variant_portion?: string;
  total_quantity: number;
  modifiers?: KitchenPlanModifierBreakdown[];
}

export interface KitchenPlanSlot {
  start: string;
  end: string;
  order_count: number;
  order_ids: string[];
}

export interface KitchenPlanDay {
  date: string;
  total_orders: number;
  order_ids: string[];
  items: KitchenPlanItem[];
  slots: KitchenPlanSlot[];
}

export async function fetchKitchenPlan(
  restaurantId: number,
  from: string,
  to: string,
): Promise<KitchenPlanDay[]> {
  const qs = new URLSearchParams({
    restaurant_id: String(restaurantId),
    from,
    to,
  });
  const data = await apiFetch<{ plan: KitchenPlanDay[] }>(
    `/api/v1/orders/kitchen-plan?${qs.toString()}`,
    restaurantId,
  );
  return data.plan ?? [];
}

export interface KitchenPlanDetailItem {
  menu_item_id: number;
  name: string;
  selected_variant_name?: string;
  variant_portion?: string;
  quantity: number;
  modifier_label: string;
}

export interface KitchenPlanOrderDetail {
  order_id: number;
  customer_name: string;
  customer_phone?: string;
  pickup_window?: string;
  items: KitchenPlanDetailItem[];
}

export interface KitchenPlanProductCol {
  menu_item_id: number;
  name: string;
}

export interface KitchenPlanDetailsResponse {
  date: string;
  products: KitchenPlanProductCol[];
  orders: KitchenPlanOrderDetail[];
}

export async function fetchKitchenPlanDetails(
  restaurantId: number,
  date: string,
): Promise<KitchenPlanDetailsResponse> {
  const qs = new URLSearchParams({
    restaurant_id: String(restaurantId),
    date,
  });
  const data = await apiFetch<KitchenPlanDetailsResponse>(
    `/api/v1/orders/kitchen-plan/details?${qs.toString()}`,
    restaurantId,
  );
  return {
    date: data.date,
    products: data.products ?? [],
    orders: data.orders ?? [],
  };
}

// ----- Production sheet -----
export interface ProductionSheetPortion {
  portion_g: number;
  count: number;
}
export interface ProductionSheetItem {
  menu_item_id: number;
  name: string;
  category_id: number;
  measure: 'weight' | 'unit';
  total: number;
  /** Day's ordered container count (sum of line quantities), regardless of
   *  measure — e.g. 11 pots for a 3 750 g column. Feeds units display mode. */
  total_units?: number;
  unit: 'g' | 'u';
  packaging?: ProductionSheetPortion[];
  combo_breakdown?: ProductionComboRef[]; // aggregated combo portions for the day total
  standalone_count?: number; // aggregated individually-ordered portions
}
export interface ProductionSheetCategory {
  id: number;
  name: string;
  measure: 'weight' | 'unit';
  item_ids: number[];
}
export interface ProductionComboRef {
  name: string;
  qty: number;
  portions?: ProductionSheetPortion[]; // weighed items: breakdown of qty (e.g. 2×250g)
}
export interface ProductionCellProvenance {
  combos: ProductionComboRef[];
  standalone: number; // count ordered individually (not via a combo)
  standalone_portions?: ProductionSheetPortion[]; // weighed items: breakdown of standalone count
}
export interface ProductionSheetOrder {
  order_id: number;
  customer_name: string;
  order_type: 'dine_in' | 'pickup' | 'delivery';
  window_start?: string;
  window_end?: string;
  cells: Record<string, number>; // menu_item_id (string key) -> grams or count
  units?: Record<string, number>; // menu_item_id -> ordered container count (2 pots, not 1000 g)
  provenance?: Record<string, ProductionCellProvenance>; // menu_item_id -> combo/individual split
  prepared?: boolean; // shared "done" flag (Order.prepared_at set); synced live across tablets
}
// Restaurant-wide saved production-sheet layout: category-band order + item-column
// order within each category. Shared across all staff/devices (server-persisted).
export interface ProductionColumnOrderConfig {
  categories: number[];
  items: Record<number, number[]>;
}
export interface ProductionSheetResponse {
  date: string;
  categories: ProductionSheetCategory[];
  items: ProductionSheetItem[];
  orders: ProductionSheetOrder[];
  column_order?: ProductionColumnOrderConfig | null;
}
export interface ProductionDay {
  date: string;
  order_count: number;
}

export async function fetchProductionSheet(
  restaurantId: number,
  date: string,
): Promise<ProductionSheetResponse> {
  const qs = new URLSearchParams({ restaurant_id: String(restaurantId), date });
  const data = await apiFetch<ProductionSheetResponse>(
    `/api/v1/orders/production-sheet?${qs.toString()}`,
    restaurantId,
  );
  return {
    date: data.date,
    categories: data.categories ?? [],
    items: data.items ?? [],
    orders: data.orders ?? [],
    column_order: data.column_order ?? null,
  };
}

// Persist the restaurant-wide production-sheet column layout (managers/owners
// only — the server enforces SettingsEdit). Shared across all staff/devices.
export async function saveProductionColumnOrder(
  restaurantId: number,
  config: ProductionColumnOrderConfig,
): Promise<void> {
  await apiFetch<void>(
    `/api/v1/orders/production-config?restaurant_id=${restaurantId}`,
    restaurantId,
    { method: 'PUT', body: JSON.stringify(config) },
  );
}

// Toggle an order's shared production-sheet "done" flag (kitchen staff — the
// server enforces KitchenManage and broadcasts the change live to other tablets).
export async function setOrderPrepared(
  restaurantId: number,
  orderId: number,
  prepared: boolean,
): Promise<void> {
  await apiFetch<void>(
    `/api/v1/orders/${orderId}/prepared?restaurant_id=${restaurantId}`,
    restaurantId,
    { method: 'POST', body: JSON.stringify({ prepared }) },
  );
}

// Pin (force=true) or unpin an order onto the production sheet, overriding the
// normal scheduled + paid/trusted gates. Server enforces KitchenManage. Backs
// the "Ajouter au plan de production" override in the order overflow menu.
export async function setOrderForceProduction(
  restaurantId: number,
  orderId: number,
  force: boolean,
): Promise<void> {
  await apiFetch<void>(
    `/api/v1/orders/${orderId}/force-production?restaurant_id=${restaurantId}`,
    restaurantId,
    { method: 'POST', body: JSON.stringify({ force }) },
  );
}

export async function fetchProductionDays(restaurantId: number): Promise<ProductionDay[]> {
  const qs = new URLSearchParams({ restaurant_id: String(restaurantId) });
  const data = await apiFetch<{ days: ProductionDay[] }>(
    `/api/v1/orders/production-sheet/days?${qs.toString()}`,
    restaurantId,
  );
  return data.days ?? [];
}

// A série = a distinct scheduled_for fulfillment date with its order count,
// most recent first. Powers the série picker (Date de série mode).
export interface OrderSerie {
  date: string; // YYYY-MM-DD
  order_count: number;
  revenue: number; // paid revenue only, matches the dashboard KPIs
}

export async function fetchOrderSeries(restaurantId: number): Promise<OrderSerie[]> {
  const qs = new URLSearchParams({ restaurant_id: String(restaurantId) });
  const data = await apiFetch<{ series: OrderSerie[] }>(
    `/api/v1/orders/series?${qs.toString()}`,
    restaurantId,
  );
  return data.series ?? [];
}

export interface KitchenPlanVariantCount {
  name: string;
  qty: number;
}

export interface KitchenPlanStockLine {
  stock_item_id: number;
  name: string;
  total_qty: number;
  unit: string;
}

export interface KitchenPlanPrepBreakdownLine {
  stock_item_id: number;
  name: string;
  qty: number;
  unit: string;
}

export interface KitchenPlanPrepLine {
  prep_item_id: number;
  name: string;
  total_qty: number;
  unit: string;
  breakdown: KitchenPlanPrepBreakdownLine[];
}

export interface KitchenPlanItemBreakdown {
  menu_item_id: number;
  name: string;
  total_count: number;
  variants: KitchenPlanVariantCount[];
  total_prep_mass: number; // total grams across all prep lines, 0 when none
  stock_lines: KitchenPlanStockLine[];
  prep_lines: KitchenPlanPrepLine[];
}

export interface KitchenPlanItemBreakdownResponse {
  date: string;
  items: KitchenPlanItemBreakdown[];
}

export async function fetchKitchenPlanIngredients(
  restaurantId: number,
  date: string,
): Promise<KitchenPlanItemBreakdownResponse> {
  const qs = new URLSearchParams({
    restaurant_id: String(restaurantId),
    date,
  });
  const data = await apiFetch<KitchenPlanItemBreakdownResponse>(
    `/api/v1/orders/kitchen-plan/ingredients?${qs.toString()}`,
    restaurantId,
  );
  return {
    date: data.date,
    items: data.items ?? [],
  };
}

// ─── Analytics ───────────────────────────────────────────────────────────────

export async function getAnalyticsToday(restaurantId: number): Promise<TodayStats> {
  const data = await apiFetch<{ summary: TodayStats }>(
    `/api/v1/analytics/today?restaurant_id=${restaurantId}`, restaurantId
  );
  return data.summary;
}

export async function getTopSellers(
  restaurantId: number,
  scope?: AnalyticsScope,
  basis?: DateBasis
): Promise<TopSeller[]> {
  const params = new URLSearchParams({
    restaurant_id: String(restaurantId),
    ...analyticsScopeParams(scope),
    ...dateBasisParams(basis),
  });
  const data = await apiFetch<{ top_items: TopSeller[] }>(
    `/api/v1/analytics/top-sellers?${params}`, restaurantId
  );
  return data.top_items ?? [];
}

// ─── Dashboard Analytics ────────────────────────────────────────────────────

export async function getHourlyAnalytics(
  restaurantId: number,
  date?: string
): Promise<HourlyBucket[]> {
  const params = new URLSearchParams({ restaurant_id: String(restaurantId) });
  if (date) params.set('date', date);
  const data = await apiFetch<{ buckets: HourlyBucket[] }>(
    `/api/v1/analytics/hourly?${params}`, restaurantId
  );
  return data.buckets ?? [];
}

export async function getDayComparison(
  restaurantId: number,
  date?: string,
  compare?: string
): Promise<ComparisonResult> {
  const params = new URLSearchParams({ restaurant_id: String(restaurantId) });
  if (date) params.set('date', date);
  if (compare) params.set('compare', compare);
  return apiFetch<ComparisonResult>(
    `/api/v1/analytics/comparison?${params}`, restaurantId
  );
}

export async function getPeriodSummary(
  restaurantId: number,
  scope: AnalyticsScope,
  basis?: DateBasis,
  /** Explicit previous window for the delta (série mode: the previous série(s)).
   *  When omitted the server uses the equal-length window immediately before. */
  prev?: { from: string; to: string }
): Promise<PeriodComparison> {
  const params = new URLSearchParams({
    restaurant_id: String(restaurantId),
    ...analyticsScopeParams(scope),
    ...dateBasisParams(basis),
  });
  if (prev) {
    params.set('prev_from', prev.from);
    params.set('prev_to', prev.to);
  }
  return apiFetch<PeriodComparison>(
    `/api/v1/analytics/period?${params}`, restaurantId
  );
}

export async function getDailySeries(
  restaurantId: number,
  days = 7,
  date?: string,
  basis?: DateBasis
): Promise<DaySummary[]> {
  const params = new URLSearchParams({
    restaurant_id: String(restaurantId),
    days: String(days),
    ...dateBasisParams(basis),
  });
  if (date) params.set('date', date);
  const data = await apiFetch<{ days: DaySummary[] }>(
    `/api/v1/analytics/daily?${params}`, restaurantId
  );
  return data.days ?? [];
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

// ─── Sales by Item ──────────────────────────────────────────────────────────

/** Paginated item-sales report for the given period (scope) + date basis. */
export async function getAnalyticsItems(
  restaurantId: number,
  scope: AnalyticsScope,
  basis?: DateBasis,
  params?: { sort_by?: string; sort_dir?: string; search?: string; page?: number; per_page?: number }
): Promise<ItemSalesListResult> {
  const query = new URLSearchParams({
    restaurant_id: String(restaurantId),
    ...analyticsScopeParams(scope),
    ...dateBasisParams(basis),
  });
  if (params?.sort_by) query.set('sort_by', params.sort_by);
  if (params?.sort_dir) query.set('sort_dir', params.sort_dir);
  if (params?.search) query.set('search', params.search);
  if (params?.page) query.set('page', String(params.page));
  if (params?.per_page) query.set('per_page', String(params.per_page));
  return apiFetch<ItemSalesListResult>(`/api/v1/analytics/items?${query}`, restaurantId);
}

/** Drill-down for one item, scoped to the same period + date basis as the list. */
export async function getAnalyticsItemDetail(
  restaurantId: number,
  itemId: number,
  scope: AnalyticsScope,
  basis?: DateBasis
): Promise<ItemSalesDetail> {
  const query = new URLSearchParams({
    restaurant_id: String(restaurantId),
    ...analyticsScopeParams(scope),
    ...dateBasisParams(basis),
  });
  const data = await apiFetch<{ item: ItemSalesDetail }>(
    `/api/v1/analytics/items/${itemId}?${query}`, restaurantId
  );
  return data.item;
}

// ─── Staff ────────────────────────────────────────────────────────────────────

export async function listStaff(restaurantId: number): Promise<StaffMember[]> {
  const data = await apiFetch<{ staff: StaffMember[] }>(
    `/api/v1/restaurants/${restaurantId}/staff`, restaurantId
  );
  return data.staff ?? [];
}

// isCourier identifies staff that can be assigned to deliver orders: either the
// legacy "courier" role or anyone in a custom RBAC role named "Courier".
export function isCourier(staff: Pick<StaffMember, 'role' | 'role_name'>): boolean {
  return staff.role === 'courier' || (staff.role_name ?? '').trim().toLowerCase() === 'courier';
}

// listCouriers returns the staff members eligible to be assigned as couriers.
export async function listCouriers(restaurantId: number): Promise<StaffMember[]> {
  const staff = await listStaff(restaurantId);
  return staff.filter(isCourier);
}

/** Outcome of the invite-email send, reported by the server. */
export type InviteEmailStatus = 'sent' | 'not_configured' | 'failed' | 'skipped';

export async function inviteStaff(restaurantId: number, input: {
  full_name: string;
  email: string;
  phone?: string;
  password?: string; // optional — staff set their own password via the email invite link
  role?: Role;
  role_id?: number;
}): Promise<{ member: StaffMember; emailStatus: InviteEmailStatus }> {
  const data = await apiFetch<{ staff_member: StaffMember; email_status?: InviteEmailStatus }>(
    `/api/v1/restaurants/${restaurantId}/staff/invite`, restaurantId,
    { method: 'POST', body: JSON.stringify(input) }
  );
  return { member: data.staff_member, emailStatus: data.email_status ?? 'skipped' };
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

// setDefaultCourier marks a staff member as the restaurant's default courier
// (or clears the flag). Only one default per restaurant — promoting a new
// member clears the previous one server-side.
export async function setDefaultCourier(
  restaurantId: number, userId: number, isDefault: boolean
): Promise<void> {
  await apiFetch<void>(
    `/api/v1/restaurants/${restaurantId}/staff/${userId}/default-courier`, restaurantId,
    { method: 'PUT', body: JSON.stringify({ is_default: isDefault }) }
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
  // The Go server uses pointer-based partial updates: an absent field and a
  // JSON `null` field both unmarshal to a nil pointer, indistinguishable.
  // Server treats empty string as the explicit "clear" sentinel for
  // brand_color, so translate null → "" here.
  const payload: Record<string, unknown> = { ...input };
  if (payload.brand_color === null) payload.brand_color = '';
  const data = await apiFetch<{ website_config: WebsiteConfig }>(
    `/api/v1/restaurants/${restaurantId}/website-config`, restaurantId,
    { method: 'PUT', body: JSON.stringify(payload) }
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

export async function uploadQrHeroImage(restaurantId: number, file: File): Promise<string> {
  const token = getToken();
  const formData = new FormData();
  formData.append('image', file);
  const res = await fetch(`${API_URL}/api/v1/restaurants/${restaurantId}/qr-hero`, {
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

/** Upload a custom font file for the website builder's typography controls.
 *  Returns the public S3 URL and the @font-face format() hint the caller stores
 *  on the ExtraFont entry. */
export async function uploadWebsiteFont(
  restaurantId: number,
  file: File,
): Promise<{ url: string; format: string; key: string }> {
  const token = getToken();
  const formData = new FormData();
  formData.append('font', file);
  const res = await fetch(`${API_URL}/api/v1/restaurants/${restaurantId}/website-fonts`, {
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
  return { url: data.url, format: data.format, key: data.key };
}

/** Delete uploaded custom-font files from S3 (when a font or variant is removed
 *  in the builder's font manager). Best-effort — only this restaurant's own
 *  font objects are deletable server-side. */
export async function deleteWebsiteFonts(restaurantId: number, keys: string[]): Promise<void> {
  const clean = keys.filter(Boolean);
  if (clean.length === 0) return;
  const token = getToken();
  const res = await fetch(`${API_URL}/api/v1/restaurants/${restaurantId}/website-fonts`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'X-Restaurant-ID': String(restaurantId),
    },
    body: JSON.stringify({ keys: clean }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || body.message || `Delete failed (${res.status})`);
  }
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

// ─── Website Editor v2 — Draft / Publish ─────────────────────────────────────

export type DraftSectionPayload = {
  id?: number;
  tmp_id?: string;
  section_type: string;
  page: string;
  sort_order: number;
  is_visible: boolean;
  layout: string;
  content: Record<string, any>;
  settings: Record<string, any>;
};

export type DraftStatePayload = {
  config: Record<string, any>;
  sections: DraftSectionPayload[];
  deleted_section_ids: number[];
};

export type DraftResponse = {
  state: DraftStatePayload;
  draft_dirty: boolean;
  draft_saved_at?: string | null;
  published_at?: string | null;
};

export async function getWebsiteDraft(restaurantId: number): Promise<DraftResponse> {
  return apiFetch<DraftResponse>(
    `/api/v1/restaurants/${restaurantId}/website-draft`, restaurantId
  );
}

export async function saveWebsiteDraft(
  restaurantId: number, payload: DraftStatePayload
): Promise<DraftResponse> {
  return apiFetch<DraftResponse>(
    `/api/v1/restaurants/${restaurantId}/website-draft`, restaurantId,
    { method: 'PUT', body: JSON.stringify(payload) }
  );
}

export async function publishWebsiteDraft(restaurantId: number): Promise<DraftResponse> {
  return apiFetch<DraftResponse>(
    `/api/v1/restaurants/${restaurantId}/website-publish`, restaurantId,
    { method: 'POST' }
  );
}

export async function discardWebsiteDraft(restaurantId: number): Promise<DraftResponse> {
  return apiFetch<DraftResponse>(
    `/api/v1/restaurants/${restaurantId}/website-discard`, restaurantId,
    { method: 'POST' }
  );
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

// ─── Ingredient Icon Library (read-only picker) ─────────────────────────────
// The library is curated by superadmins from the backoffice. Restaurant admins
// can only list and pick.

export interface IngredientIcon {
  id: number;
  name: string;
  slug: string;
  image_url: string;
  category: string;
  aliases: string[];
  tags: string[];
  created_at: string;
  updated_at: string;
}

export async function listIngredientIcons(
  restaurantId: number,
  params?: { q?: string; category?: string; limit?: number },
): Promise<IngredientIcon[]> {
  const qs = new URLSearchParams();
  if (params?.q) qs.set('q', params.q);
  if (params?.category) qs.set('category', params.category);
  if (params?.limit) qs.set('limit', String(params.limit));
  const query = qs.toString() ? `?${qs.toString()}` : '';
  const data = await apiFetch<{ icons: IngredientIcon[] }>(
    `/api/v1/ingredient-icons${query}`,
    restaurantId,
  );
  return data.icons || [];
}

export async function uploadStockItemImage(restaurantId: number, itemId: number, file: File): Promise<string> {
  const form = new FormData();
  form.append('image', file);
  const token = getToken();
  const res = await fetch(`${API_URL}/api/v1/stock/items/${itemId}/image?restaurant_id=${restaurantId}`, {
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

export async function batchUpdateStockCategory(
  restaurantId: number, input: { item_ids: number[]; category: string }
): Promise<void> {
  await apiFetch(`/api/v1/stock/items/batch-category?restaurant_id=${restaurantId}`, restaurantId, {
    method: 'PATCH', body: JSON.stringify(input),
  });
}

// `vat_rate_override`: `null` clears the override (items fall back to the
// restaurant default); a number sets an explicit rate (0 = exempt).
export async function batchUpdateStockVat(
  restaurantId: number, input: { item_ids: number[]; vat_rate_override: number | null }
): Promise<void> {
  await apiFetch(`/api/v1/stock/items/batch-vat?restaurant_id=${restaurantId}`, restaurantId, {
    method: 'PATCH', body: JSON.stringify(input),
  });
}

export async function listStockTransactions(
  restaurantId: number, params?: { stock_item_id?: number; limit?: number; type?: string }
): Promise<StockTransaction[]> {
  const qs = new URLSearchParams({ restaurant_id: String(restaurantId) });
  if (params?.stock_item_id) qs.set('stock_item_id', String(params.stock_item_id));
  if (params?.limit) qs.set('limit', String(params.limit));
  if (params?.type) qs.set('type', params.type);
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

export async function createStockCategory(restaurantId: number, input: StockCategoryInput): Promise<StockCategory> {
  const data = await apiFetch<{ category: StockCategory }>(`/api/v1/stock/categories?restaurant_id=${restaurantId}`, restaurantId, {
    method: 'POST', body: JSON.stringify(input),
  });
  return data.category;
}

export async function updateStockCategory(restaurantId: number, id: number, input: StockCategoryInput): Promise<StockCategory> {
  const data = await apiFetch<{ category: StockCategory }>(`/api/v1/stock/categories/${id}?restaurant_id=${restaurantId}`, restaurantId, {
    method: 'PUT', body: JSON.stringify(input),
  });
  return data.category;
}

export async function deleteStockCategory(restaurantId: number, id: number): Promise<void> {
  await apiFetch(`/api/v1/stock/categories/${id}?restaurant_id=${restaurantId}`, restaurantId, { method: 'DELETE' });
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

export async function importDelivery(restaurantId: number, file: File, lang?: string, method?: string, supplier?: string, supplierId?: number): Promise<DeliveryExtraction> {
  const token = getToken();
  const formData = new FormData();
  formData.append('file', file);
  const params = new URLSearchParams({ restaurant_id: String(restaurantId) });
  if (lang) params.set('lang', lang);
  if (method) params.set('method', method);
  if (supplier) params.set('supplier', supplier);
  if (supplierId) params.set('supplier_id', String(supplierId));
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

export interface DeliveryStreamMeta {
  supplier_name?: string;
  delivery_date?: string;
}

export interface DeliveryStreamLateFlags {
  duplicate_row_indexes: number[];
  deduped_indexes: number[];
}

export interface DeliveryStreamDone {
  total: number;
  raw_notes?: string;
  late_flags?: DeliveryStreamLateFlags;
  usage?: { input_tokens: number; output_tokens: number };
}

export interface DeliveryStreamHandlers {
  onMeta: (m: DeliveryStreamMeta) => void;
  onItem: (item: DeliveryExtraction['items'][number]) => void;
  onProgress: (p: { count: number }) => void;
  onDone: (d: DeliveryStreamDone) => void;
  onError: (e: { message: string }) => void;
}

export async function importDeliveryStream(
  restaurantId: number,
  file: File,
  opts: { lang?: string; supplierId?: number },
  handlers: DeliveryStreamHandlers,
  signal?: AbortSignal,
): Promise<void> {
  const token = getToken();
  const formData = new FormData();
  formData.append('file', file);
  const params = new URLSearchParams({ restaurant_id: String(restaurantId) });
  if (opts.lang) params.set('lang', opts.lang);
  if (opts.supplierId) params.set('supplier_id', String(opts.supplierId));

  const res = await fetch(`${API_URL}/api/v1/stock/import/delivery/stream?${params}`, {
    method: 'POST',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'X-Restaurant-ID': String(restaurantId),
    },
    body: formData,
    signal,
  });
  if (!res.ok || !res.body) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || body.message || `Stream failed (${res.status})`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buf = '';
  const dispatch = (event: string, data: string) => {
    let payload: unknown;
    try { payload = JSON.parse(data); } catch { return; }
    switch (event) {
      case 'meta':     handlers.onMeta(payload as DeliveryStreamMeta); break;
      case 'item':     handlers.onItem(payload as DeliveryExtraction['items'][number]); break;
      case 'progress': handlers.onProgress(payload as { count: number }); break;
      case 'done':     handlers.onDone(payload as DeliveryStreamDone); break;
      case 'error':    handlers.onError(payload as { message: string }); break;
    }
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });

    let sep = buf.indexOf('\n\n');
    while (sep >= 0) {
      const frame = buf.slice(0, sep);
      buf = buf.slice(sep + 2);
      let event = '';
      let data = '';
      for (const line of frame.split('\n')) {
        if (line.startsWith('event: ')) event = line.slice(7);
        else if (line.startsWith('data: ')) data = data ? data + '\n' + line.slice(6) : line.slice(6);
      }
      if (event) dispatch(event, data);
      sep = buf.indexOf('\n\n');
    }
  }
}

// ─── AI Chat: targeted delivery edits ─────────────────────────────────
//
// The chat endpoint runs one Anthropic tool-use round on the current
// item list and returns either a clarifying question or a set of
// patches the client applies to editedItems.

export interface ChatItemSnapshot {
  index: number;
  name: string;
  original_name?: string;
  category?: string;
  unit: string;
  quantity: number;
  cost_per_unit: number;
  total_price: number;
  pack_count?: number;
  units_per_pack?: number;
  unit_size?: number;
  unit_size_unit?: string;
  container_type?: string;
  unit_type?: string;
  vat_rate_override?: number | null;
  skipped?: boolean;
}

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatPatch {
  item_index: number;
  name?: string;
  category?: string;
  quantity?: number;
  total_price?: number;
  cost_per_unit?: number;
  vat_rate_override?: number | null;
  skipped?: boolean;
}

export interface ChatDeliveryRequest {
  items: ChatItemSnapshot[];
  history: ChatTurn[];
  message: string;
  vat_display_mode: 'ex' | 'inc';
  default_vat_rate: number;
  lang?: string;
}

export interface ChatDeliveryResponse {
  assistant_message: string;
  patches: ChatPatch[];
  clarification_needed: boolean;
}

export async function chatDeliveryEdit(restaurantId: number, body: ChatDeliveryRequest): Promise<ChatDeliveryResponse> {
  return apiFetch<ChatDeliveryResponse>(
    `/api/v1/stock/import/delivery/chat?restaurant_id=${restaurantId}`,
    restaurantId,
    { method: 'POST', body: JSON.stringify(body) },
  );
}

// importDeliveryVoice uploads a voice recording of the owner describing a
// delivery and returns the same DeliveryExtraction shape as importDelivery.
// Reuses the entire review flow downstream.
export interface VoiceImportResult {
  extraction: DeliveryExtraction;
  transcript: string;
}

export async function importDeliveryVoice(
  restaurantId: number,
  audioBlob: Blob,
  mediaType: string,
  lang?: string,
  supplierId?: number,
): Promise<VoiceImportResult> {
  const token = getToken();
  const formData = new FormData();
  // The backend matches Content-Type by prefix; the filename extension is
  // only cosmetic for server logs.
  const ext = mediaType.includes('webm') ? 'webm'
    : mediaType.includes('mp4')  ? 'mp4'
    : mediaType.includes('mpeg') || mediaType.includes('mp3') ? 'mp3'
    : mediaType.includes('ogg')  ? 'ogg'
    : mediaType.includes('wav')  ? 'wav'
    : 'audio';
  formData.append('file', new File([audioBlob], `voice.${ext}`, { type: mediaType }));
  const params = new URLSearchParams({ restaurant_id: String(restaurantId) });
  if (lang) params.set('lang', lang);
  if (supplierId) params.set('supplier_id', String(supplierId));
  const res = await fetch(`${API_URL}/api/v1/stock/import/delivery/voice?${params}`, {
    method: 'POST',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'X-Restaurant-ID': String(restaurantId),
    },
    body: formData,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || body.message || `Voice import failed (${res.status})`);
  }
  const data = await res.json();
  return { extraction: data.extraction, transcript: data.transcript ?? '' };
}

export async function confirmDelivery(restaurantId: number, input: ConfirmDeliveryInput): Promise<void> {
  await apiFetch(`/api/v1/stock/import/delivery/confirm?restaurant_id=${restaurantId}`, restaurantId, {
    method: 'POST', body: JSON.stringify(input),
  });
}

// ─── Delivery Import Drafts ───────────────────────────────────────

export interface DeliveryImportDraft {
  id: number;
  restaurant_id: number;
  supplier_id?: number;
  supplier_name: string;
  item_count: number;
  document_url: string;
  document_type: string;
  created_by_id: number;
  created_at: string;
  updated_at: string;
}

export interface DeliveryImportDraftDetail {
  draft: DeliveryImportDraft;
  extraction: DeliveryExtraction;
  edited_items: ConfirmDeliveryItemInput[];
}

export async function listImportDrafts(restaurantId: number): Promise<DeliveryImportDraft[]> {
  const data = await apiFetch<{ drafts: DeliveryImportDraft[] }>(
    `/api/v1/stock/import/drafts?restaurant_id=${restaurantId}`, restaurantId
  );
  return data.drafts;
}

export async function getImportDraft(restaurantId: number, draftId: number): Promise<DeliveryImportDraftDetail> {
  const data = await apiFetch<DeliveryImportDraftDetail>(
    `/api/v1/stock/import/drafts/${draftId}?restaurant_id=${restaurantId}`, restaurantId
  );
  return data;
}

export async function createImportDraft(
  restaurantId: number, file: File | null, input: {
    supplier_id?: number; supplier_name: string;
    extraction: DeliveryExtraction; edited_items: ConfirmDeliveryItemInput[];
  }
): Promise<DeliveryImportDraft> {
  const token = getToken();
  const formData = new FormData();
  formData.append('input', JSON.stringify(input));
  if (file) formData.append('file', file);
  const res = await fetch(`${API_URL}/api/v1/stock/import/drafts?restaurant_id=${restaurantId}`, {
    method: 'POST',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'X-Restaurant-ID': String(restaurantId),
    },
    body: formData,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Failed to create draft (${res.status})`);
  }
  const data = await res.json();
  return data.draft;
}

export async function deleteImportDraft(restaurantId: number, draftId: number): Promise<void> {
  await apiFetch(`/api/v1/stock/import/drafts/${draftId}?restaurant_id=${restaurantId}`, restaurantId, {
    method: 'DELETE',
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

export interface ExtractedRecipeStep {
  title: string;
  description: string;
  duration_mins: number;
}

export interface ExtractedRecipe {
  dish_name: string;
  dish_description: string;
  servings: number;
  total_yield: number;
  total_yield_unit: string;
  ingredients: ExtractedIngredient[];
  steps?: ExtractedRecipeStep[];
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
  cost_per_unit?: number;
  /** @deprecated cost is always ex-VAT now. */
  price_includes_vat?: boolean;
  vat_rate_override?: number | null;
}

export interface ConfirmRecipeItemInput {
  menu_item_id: number;
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

export interface ConfirmPrepRecipeStepInput {
  instruction: string;
  duration_mins?: number;
  image_url?: string;
}

export interface ConfirmPrepRecipeInput {
  /** nil = create a new prep; set = replace the recipe of this existing prep. */
  prep_item_id?: number | null;
  name: string;
  category?: string;
  notes?: string;
  yield: number;
  yield_unit: string;
  prep_time_mins?: number;
  ingredients: ConfirmRecipeIngredientInput[];
  steps?: ConfirmPrepRecipeStepInput[];
}

export async function confirmPrepRecipe(restaurantId: number, input: ConfirmPrepRecipeInput): Promise<PrepItem> {
  const data = await apiFetch<{ item: PrepItem }>(
    `/api/v1/stock/import/recipes/confirm-prep?restaurant_id=${restaurantId}`, restaurantId,
    { method: 'POST', body: JSON.stringify(input) }
  );
  return data.item;
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
  return apiFetch<PrepItem>(`/api/v1/prep/items?restaurant_id=${restaurantId}`, restaurantId, {
    method: 'POST', body: JSON.stringify(input),
  });
}

export async function updatePrepItem(restaurantId: number, id: number, input: Partial<PrepItemInput>): Promise<PrepItem> {
  return apiFetch<PrepItem>(`/api/v1/prep/items/${id}?restaurant_id=${restaurantId}`, restaurantId, {
    method: 'PUT', body: JSON.stringify(input),
  });
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

export async function getPrepCategories(restaurantId: number): Promise<PrepCategory[]> {
  const data = await apiFetch<{ categories: PrepCategory[] }>(`/api/v1/prep/categories?restaurant_id=${restaurantId}`, restaurantId);
  return data.categories ?? [];
}

export async function createPrepCategory(restaurantId: number, input: PrepCategoryInput): Promise<PrepCategory> {
  const data = await apiFetch<{ category: PrepCategory }>(`/api/v1/prep/categories?restaurant_id=${restaurantId}`, restaurantId, {
    method: 'POST', body: JSON.stringify(input),
  });
  return data.category;
}

export async function updatePrepCategory(restaurantId: number, id: number, input: PrepCategoryInput): Promise<PrepCategory> {
  const data = await apiFetch<{ category: PrepCategory }>(`/api/v1/prep/categories/${id}?restaurant_id=${restaurantId}`, restaurantId, {
    method: 'PUT', body: JSON.stringify(input),
  });
  return data.category;
}

export async function deletePrepCategory(restaurantId: number, id: number): Promise<void> {
  await apiFetch(`/api/v1/prep/categories/${id}?restaurant_id=${restaurantId}`, restaurantId, { method: 'DELETE' });
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

// ─── Customer profile (address/apartment/floor, account-backed) ───────────────

export interface CustomerDeliverySeed {
  address: string;
  city: string;
  floor: string;
  apt: string;
  entry_code: string;
  delivery_notes: string;
}

export interface CustomerProfile {
  account_id: number | null;
  has_account: boolean;
  name: string;
  phone: string;
  email?: string;
  address: string;
  city: string;
  floor: string;
  apt: string;
  entry_code: string;
  delivery_notes: string;
  /** Latest delivery order, used to pre-fill the editor when nothing is saved yet. */
  last_delivery?: CustomerDeliverySeed | null;
}

export interface CustomerProfileInput {
  name: string;
  address: string;
  city: string;
  floor: string;
  apt: string;
  entry_code: string;
  delivery_notes: string;
}

export async function getCustomerProfile(
  restaurantId: number,
  phone: string
): Promise<CustomerProfile> {
  const data = await apiFetch<{ profile: CustomerProfile }>(
    `/api/v1/restaurants/${restaurantId}/customers/profile?phone=${encodeURIComponent(phone)}`,
    restaurantId
  );
  return data.profile;
}

export async function updateCustomerProfile(
  restaurantId: number,
  phone: string,
  input: CustomerProfileInput
): Promise<CustomerProfile> {
  const data = await apiFetch<{ profile: CustomerProfile }>(
    `/api/v1/restaurants/${restaurantId}/customers/profile?phone=${encodeURIComponent(phone)}`,
    restaurantId,
    { method: 'PUT', body: JSON.stringify(input) }
  );
  return data.profile;
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
  extraction_hints: string;
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
  extraction_hints?: string;
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
  source_report_id?: number | null;
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

// ─── Custom units ───────────────────────────────────────────────────────────

export async function listCustomUnits(restaurantId: number): Promise<CustomUnit[]> {
  const data = await apiFetch<{ units: CustomUnit[] }>(`/api/v1/units`, restaurantId);
  return data.units ?? [];
}

export async function createCustomUnit(restaurantId: number, input: CustomUnitInput): Promise<CustomUnit> {
  const data = await apiFetch<{ unit: CustomUnit }>(`/api/v1/units`, restaurantId, {
    method: 'POST', body: JSON.stringify(input),
  });
  return data.unit;
}

export async function updateCustomUnit(restaurantId: number, id: number, input: CustomUnitInput): Promise<CustomUnit> {
  const data = await apiFetch<{ unit: CustomUnit }>(`/api/v1/units/${id}`, restaurantId, {
    method: 'PUT', body: JSON.stringify(input),
  });
  return data.unit;
}

export async function deleteCustomUnit(restaurantId: number, id: number): Promise<void> {
  await apiFetch<void>(`/api/v1/units/${id}`, restaurantId, { method: 'DELETE' });
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

export async function listPurchaseOrders(restaurantId: number, params?: { supplier_id?: number; status?: string; source_report_id?: number }): Promise<PurchaseOrder[]> {
  const qs = new URLSearchParams({ restaurant_id: String(restaurantId) });
  if (params?.supplier_id) qs.set('supplier_id', String(params.supplier_id));
  if (params?.status) qs.set('status', params.status);
  if (params?.source_report_id) qs.set('source_report_id', String(params.source_report_id));
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

export async function sendOrderEmail(restaurantId: number, poId: number, to?: string): Promise<{ sent: boolean }> {
  return await apiFetch<{ sent: boolean }>(`/api/v1/purchase-orders/${poId}/send-email?restaurant_id=${restaurantId}`, restaurantId, {
    method: 'POST',
    body: JSON.stringify({ to: to || '' }),
  });
}

export interface EstimatedSuppliesResult {
  purchase_orders: PurchaseOrder[];
  forecasted_items: number;
  items_with_recipe: number;
  total_shortages: number;
  target_day: string;
}

export async function generateEstimatedSupplies(restaurantId: number, reportId: number, source: 'pos' | 'manual' | 'both' = 'pos'): Promise<EstimatedSuppliesResult> {
  const response = await apiFetch<EstimatedSuppliesResult>(`/api/v1/stock/daily-reports/${reportId}/estimated-supplies?restaurant_id=${restaurantId}`, restaurantId, {
    method: 'POST',
    body: JSON.stringify({ source }),
  });
  return {
    ...response,
    purchase_orders: response.purchase_orders ?? [],
  };
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
  /** Locale code (en/he/fr) used when rendering this table's QR card. Empty = inherit restaurant default. */
  language?: string;
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


// ─── Tables CRUD ──────────────────────────────────────────────────────────────

export interface TableInput {
  code: string;
  name?: string;
  seats?: number;
  is_open?: boolean;
  /** Optional. Pass 0 to clear an existing section assignment on update. */
  section_id?: number;
  /** Optional locale code (en/he/fr). Empty string clears the override. */
  language?: string;
}

export async function listTables(restaurantId: number): Promise<RestaurantTableRef[]> {
  const data = await apiFetch<{ tables: RestaurantTableRef[] }>(
    `/api/v1/restaurants/${restaurantId}/tables?restaurant_id=${restaurantId}`, restaurantId
  );
  return data.tables ?? [];
}

export async function createTable(restaurantId: number, input: TableInput): Promise<RestaurantTableRef> {
  const data = await apiFetch<{ table: RestaurantTableRef }>(
    `/api/v1/restaurants/${restaurantId}/tables?restaurant_id=${restaurantId}`, restaurantId,
    { method: 'POST', body: JSON.stringify(input) }
  );
  return data.table;
}

export async function updateTable(
  restaurantId: number,
  tableCode: string,
  input: Omit<TableInput, 'code'>,
): Promise<RestaurantTableRef> {
  const data = await apiFetch<{ table: RestaurantTableRef }>(
    `/api/v1/restaurants/${restaurantId}/tables/${encodeURIComponent(tableCode)}?restaurant_id=${restaurantId}`, restaurantId,
    { method: 'PUT', body: JSON.stringify({ code: tableCode, ...input }) }
  );
  return data.table;
}

export async function deleteTable(restaurantId: number, tableCode: string): Promise<void> {
  await apiFetch<void>(
    `/api/v1/restaurants/${restaurantId}/tables/${encodeURIComponent(tableCode)}?restaurant_id=${restaurantId}`, restaurantId,
    { method: 'DELETE' }
  );
}

// ─── Table QR Codes ───────────────────────────────────────────────────────────

export interface TableQrPayload {
  url: string;
  signature: string;
  tableId: string;
}

export async function generateTableQr(
  restaurantId: number,
  tableCode: string,
): Promise<TableQrPayload> {
  return apiFetch<TableQrPayload>(
    `/api/v1/restaurants/${restaurantId}/tables/${encodeURIComponent(tableCode)}/qr?restaurant_id=${restaurantId}`,
    restaurantId,
    { method: 'POST' },
  );
}

// ─── QR Card Customization ────────────────────────────────────────────────────

export type QrCardTemplate = 'compact' | 'wide' | 'tall' | 'round';
export type QrCardBrandMode = 'text' | 'logo';
export type QrCardLocale = 'en' | 'he' | 'fr';

export const QR_CARD_LOCALES: QrCardLocale[] = ['en', 'he', 'fr'];

/** Per-language text content on a QR card. All fields optional; empty falls back to other locales then defaults. */
export interface QrCardTexts {
  brand_text?: string;
  title?: string;
  subtitle?: string;
  step1?: string;
  step2?: string;
  step3?: string;
}

/** The five styleable text sections on a QR card. "powered by foody" is platform
 *  branding and deliberately not stylable. */
export type QrSectionKey = 'brand' | 'title' | 'subtitle' | 'steps' | 'table';

/** Per-section text styling. Every field is optional: absent means "keep the
 *  template's built-in value", so an untouched card renders exactly as before. */
export interface QrSectionStyle {
  /** Font family (curated, Google catalog, or an uploaded family). Absent = the card's default stack. */
  font?: string;
  /** Size multiplier on the template's base size for this section. 1 = unchanged. */
  sizeMult?: number;
  /** Font weight 100-900. Absent = the section's built-in weight. */
  weight?: number;
  /** Text colour. Absent = the card's global text_color. */
  color?: string;
  /** Text case. Absent = the section's built-in casing. */
  transform?: 'uppercase' | 'capitalize' | 'none';
  /** Letter-spacing in em. Absent = the section's built-in tracking. */
  tracking?: number;
}

/** QR card typography, shared across all four templates: each template applies
 *  these on top of its own width-derived base sizes, so one config stays
 *  balanced on both the 90mm round sticker and the 178mm poster. */
export interface QrCardTypography {
  sections?: Partial<Record<QrSectionKey, QrSectionStyle>>;
  /** Fonts this restaurant added beyond the curated list (same shape as the website builder's). */
  extraFonts?: ExtraFont[];
}

export interface QrCardConfig {
  id: number;
  restaurant_id: number;
  template: QrCardTemplate;
  background_color: string;
  text_color: string;
  brand_mode: QrCardBrandMode;
  /** Background photo for the round template. Empty for other templates. */
  hero_image_url?: string;
  /** Photo box left edge, % of sticker width. Default 0. */
  hero_x?: number;
  /** Photo box top edge, % of sticker height. Default 50 (anchored at vertical midpoint). */
  hero_y?: number;
  /** Photo box width, % of sticker width. Default 100 (full width). */
  hero_width?: number;
  /** Photo box height, % of sticker height. Default 50 (bottom half). */
  hero_height?: number;
  /** Locale code (en/he/fr) → text content. */
  texts: Partial<Record<QrCardLocale, QrCardTexts>>;
  /** Per-section text styling. Absent = every section uses its template default. */
  typography?: QrCardTypography | null;
  created_at?: string;
  updated_at?: string;
}

export async function getQrCardConfig(restaurantId: number): Promise<QrCardConfig> {
  const data = await apiFetch<{ qr_card_config: QrCardConfig }>(
    `/api/v1/restaurants/${restaurantId}/qr-card-config`, restaurantId
  );
  return data.qr_card_config;
}

export async function updateQrCardConfig(
  restaurantId: number, input: Partial<QrCardConfig>
): Promise<QrCardConfig> {
  const data = await apiFetch<{ qr_card_config: QrCardConfig }>(
    `/api/v1/restaurants/${restaurantId}/qr-card-config`, restaurantId,
    { method: 'PUT', body: JSON.stringify(input) }
  );
  return data.qr_card_config;
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

// ─── Recipe Steps (Cooking Instructions) ─────────────────────────────────────

export interface RecipeStep {
  id: number;
  menu_item_id: number;
  step_number: number;
  instruction: string;
  image_url: string;
  duration_mins: number;
  created_at: string;
  updated_at: string;
}

export interface RecipeStepInput {
  step_number: number;
  instruction: string;
  image_url?: string;
  duration_mins?: number;
}

export interface RecipeCardItem {
  id: number;
  name: string;
  category_name: string;
  image_url: string;
  price: number;
  prep_time_mins: number;
  has_steps: boolean;
  step_count: number;
  has_ingredients: boolean;
  ingredient_count: number;
}

export interface RecipeDetail {
  item: MenuItem;
  ingredients: MenuItemIngredient[];
  steps: RecipeStep[];
  category_name: string;
}

export async function listRecipeItems(restaurantId: number): Promise<RecipeCardItem[]> {
  const res = await apiFetch<{ items: RecipeCardItem[] }>('/api/v1/recipes/items', restaurantId);
  return res.items;
}

export async function getRecipeDetail(restaurantId: number, menuItemId: number): Promise<RecipeDetail> {
  return apiFetch<RecipeDetail>(`/api/v1/recipes/items/${menuItemId}`, restaurantId);
}

export async function getRecipeSteps(restaurantId: number, menuItemId: number): Promise<RecipeStep[]> {
  const res = await apiFetch<{ steps: RecipeStep[] }>(`/api/v1/recipes/items/${menuItemId}/steps`, restaurantId);
  return res.steps;
}

export async function setRecipeSteps(restaurantId: number, menuItemId: number, steps: RecipeStepInput[]): Promise<RecipeStep[]> {
  const res = await apiFetch<{ steps: RecipeStep[] }>(`/api/v1/recipes/items/${menuItemId}/steps`, restaurantId, {
    method: 'PUT',
    body: JSON.stringify({ steps }),
  });
  return res.steps;
}

export async function updateRecipeMeta(restaurantId: number, menuItemId: number, meta: { prep_time_mins: number; recipe_notes: string }): Promise<void> {
  await apiFetch<{ ok: boolean }>(`/api/v1/recipes/items/${menuItemId}/meta`, restaurantId, {
    method: 'PUT',
    body: JSON.stringify(meta),
  });
}

export async function uploadRecipeStepImage(restaurantId: number, menuItemId: number, stepId: number, file: File): Promise<string> {
  const token = getToken();
  const formData = new FormData();
  formData.append('image', file);
  const res = await fetch(`${API_URL}/api/v1/recipes/items/${menuItemId}/steps/${stepId}/image`, {
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

// ─── Prep Recipe Steps (Cooking Instructions for Préparations) ────────────────
// Mirrors the menu-item recipe step API, scoped under /prep/items/:id.

export interface PrepRecipeStep {
  id: number;
  prep_item_id: number;
  step_number: number;
  instruction: string;
  image_url: string;
  duration_mins: number;
  created_at: string;
  updated_at: string;
}

export interface PrepRecipeStepInput {
  step_number: number;
  instruction: string;
  image_url?: string;
  duration_mins?: number;
}

export async function getPrepRecipeSteps(restaurantId: number, prepItemId: number): Promise<PrepRecipeStep[]> {
  const res = await apiFetch<{ steps: PrepRecipeStep[] }>(`/api/v1/prep/items/${prepItemId}/steps`, restaurantId);
  return res.steps;
}

export async function setPrepRecipeSteps(restaurantId: number, prepItemId: number, steps: PrepRecipeStepInput[]): Promise<PrepRecipeStep[]> {
  const res = await apiFetch<{ steps: PrepRecipeStep[] }>(`/api/v1/prep/items/${prepItemId}/steps`, restaurantId, {
    method: 'PUT',
    body: JSON.stringify({ steps }),
  });
  return res.steps;
}

export async function updatePrepRecipeMeta(restaurantId: number, prepItemId: number, meta: { prep_time_mins: number; notes: string }): Promise<void> {
  await apiFetch<{ ok: boolean }>(`/api/v1/prep/items/${prepItemId}/recipe-meta`, restaurantId, {
    method: 'PUT',
    body: JSON.stringify(meta),
  });
}

export async function uploadPrepStepImage(restaurantId: number, prepItemId: number, stepId: number, file: File): Promise<string> {
  const token = getToken();
  const formData = new FormData();
  formData.append('image', file);
  const res = await fetch(`${API_URL}/api/v1/prep/items/${prepItemId}/steps/${stepId}/image`, {
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

// ─── Supplies (Grouped Receive History) ──────────────────────────────────────

export interface SupplySummary {
  batch_id: string;
  supplier_name: string;
  item_count: number;
  total_cost: number;
  created_at: string;
  created_by_id: number;
  document_url?: string;
  document_type?: string;
}

export async function listSupplies(restaurantId: number, supplier?: string): Promise<SupplySummary[]> {
  const params = new URLSearchParams();
  if (supplier) params.set('supplier', supplier);
  const qs = params.toString();
  const res = await apiFetch<{ supplies: SupplySummary[] }>(`/api/v1/stock/supplies${qs ? '?' + qs : ''}`, restaurantId);
  return res.supplies;
}

export async function getSupplyDetail(restaurantId: number, batchId: string): Promise<StockTransaction[]> {
  const res = await apiFetch<{ transactions: StockTransaction[] }>(`/api/v1/stock/supplies/${encodeURIComponent(batchId)}`, restaurantId);
  return res.transactions;
}

// ─── Daily Food Cost Reports ──────────────────────────────────────────────────

export interface DailyFoodCostReport {
  id: number;
  restaurant_id: number;
  report_date: string;
  status: 'open' | 'closed' | 'reviewed';
  sales_source: string;
  total_theoretical_cost: number;
  total_actual_cost: number;
  total_sales_revenue: number;
  total_waste_value: number;
  total_variance_value: number;
  food_cost_percent: number;
  went_well: string;
  went_wrong: string;
  to_improve: string;
  closed_by_id: number | null;
  closed_at: string | null;
  created_by_id: number;
  created_at: string;
  updated_at: string;
  items?: DailyFoodCostItem[];
  sales?: DailySalesEntry[];
}

export interface DailyFoodCostItem {
  id: number;
  report_id: number;
  stock_item_id: number | null;
  prep_item_id: number | null;
  item_name: string;
  unit: string;
  cost_per_unit: number;
  opening_stock: number;
  closing_stock: number;
  received_qty: number;
  waste_qty: number;
  actual_usage: number;
  theoretical_usage: number;
  variance: number;
  variance_percent: number;
  variance_cost: number;
  stock_item?: StockItem;
}

export interface DailySalesEntry {
  id: number;
  report_id: number;
  menu_item_id: number;
  menu_item_name: string;
  quantity: number;
  source: 'manual' | 'pos';
}

export interface IngredientBreakdown {
  stock_item_id: number;
  item_name: string;
  unit: string;
  contributions: IngredientContribution[];
}

export interface IngredientContribution {
  menu_item_id: number;
  menu_item_name: string;
  menu_item_price: number;
  qty_sold: number;
  recipe_qty: number;
  recipe_unit: string;
  total_usage: number;
  total_usage_converted: number;
}

export interface FoodCostSummary {
  period: string;
  from: string;
  to: string;
  total_revenue: number;
  total_actual_cost: number;
  total_variance: number;
  avg_food_cost_percent: number;
  daily_breakdown: DailySummaryRow[];
  top_variance_items: TopVarianceItem[];
}

export interface DailySummaryRow {
  date: string;
  revenue: number;
  actual_cost: number;
  theoretical_cost: number;
  variance: number;
  food_cost_percent: number;
  status: string;
}

export interface TopVarianceItem {
  stock_item_id: number;
  item_name: string;
  unit: string;
  total_variance: number;
  variance_cost: number;
}

export async function getTodayFoodCostReport(restaurantId: number): Promise<DailyFoodCostReport> {
  const res = await apiFetch<{ report: DailyFoodCostReport }>('/api/v1/stock/daily-reports/today', restaurantId);
  return res.report;
}

export async function createFoodCostReport(restaurantId: number, reportDate: string, salesSource?: string): Promise<DailyFoodCostReport> {
  const res = await apiFetch<{ report: DailyFoodCostReport }>('/api/v1/stock/daily-reports', restaurantId, {
    method: 'POST',
    body: JSON.stringify({ report_date: reportDate, sales_source: salesSource || 'manual' }),
  });
  return res.report;
}

export async function listFoodCostReports(restaurantId: number, from?: string, to?: string): Promise<DailyFoodCostReport[]> {
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  const qs = params.toString();
  const res = await apiFetch<{ reports: DailyFoodCostReport[] }>(`/api/v1/stock/daily-reports${qs ? '?' + qs : ''}`, restaurantId);
  return res.reports;
}

export async function getFoodCostReport(restaurantId: number, id: number): Promise<DailyFoodCostReport> {
  const res = await apiFetch<{ report: DailyFoodCostReport }>(`/api/v1/stock/daily-reports/${id}`, restaurantId);
  return res.report;
}

export async function upsertSalesEntries(restaurantId: number, reportId: number, entries: { menu_item_id: number; quantity: number }[]): Promise<void> {
  await apiFetch<{ ok: boolean }>(`/api/v1/stock/daily-reports/${reportId}/sales`, restaurantId, {
    method: 'POST',
    body: JSON.stringify({ entries }),
  });
}

export async function updateClosingStock(restaurantId: number, reportId: number, items: { stock_item_id?: number; prep_item_id?: number; quantity: number }[]): Promise<void> {
  await apiFetch<{ ok: boolean }>(`/api/v1/stock/daily-reports/${reportId}/closing-stock`, restaurantId, {
    method: 'PUT',
    body: JSON.stringify({ items }),
  });
}

export async function computeFoodCostReport(restaurantId: number, reportId: number): Promise<DailyFoodCostReport> {
  const res = await apiFetch<{ report: DailyFoodCostReport }>(`/api/v1/stock/daily-reports/${reportId}/compute`, restaurantId, {
    method: 'POST',
  });
  return res.report;
}

export async function updateRetrospective(restaurantId: number, reportId: number, input: { went_well: string; went_wrong: string; to_improve: string }): Promise<void> {
  await apiFetch<{ ok: boolean }>(`/api/v1/stock/daily-reports/${reportId}/retrospective`, restaurantId, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}

export async function closeFoodCostReport(restaurantId: number, reportId: number): Promise<void> {
  await apiFetch<{ ok: boolean }>(`/api/v1/stock/daily-reports/${reportId}/close`, restaurantId, {
    method: 'POST',
  });
}

export async function getFoodCostBreakdown(restaurantId: number, reportId: number, stockItemId: number): Promise<IngredientBreakdown> {
  const res = await apiFetch<{ breakdown: IngredientBreakdown }>(`/api/v1/stock/daily-reports/${reportId}/breakdown?stock_item_id=${stockItemId}`, restaurantId);
  return res.breakdown;
}

export async function getFoodCostSummary(restaurantId: number, period: string = 'week'): Promise<FoodCostSummary> {
  const res = await apiFetch<{ summary: FoodCostSummary }>(`/api/v1/stock/food-cost-summary?period=${period}`, restaurantId);
  return res.summary;
}

export async function deleteSalesEntries(restaurantId: number, reportId: number, ids: number[]): Promise<void> {
  await apiFetch<{ ok: boolean }>(`/api/v1/stock/daily-reports/${reportId}/sales`, restaurantId, {
    method: 'DELETE',
    body: JSON.stringify({ ids }),
  });
}

export async function deleteCostItems(restaurantId: number, reportId: number, ids: number[]): Promise<void> {
  await apiFetch<{ ok: boolean }>(`/api/v1/stock/daily-reports/${reportId}/items`, restaurantId, {
    method: 'DELETE',
    body: JSON.stringify({ ids }),
  });
}

export async function deleteStockTransaction(restaurantId: number, txId: number): Promise<void> {
  await apiFetch<{ ok: boolean }>(`/api/v1/stock/transactions/${txId}`, restaurantId, {
    method: 'DELETE',
  });
}

export async function deleteStockTransactions(restaurantId: number, ids: number[]): Promise<void> {
  await apiFetch<{ ok: boolean }>('/api/v1/stock/transactions', restaurantId, {
    method: 'DELETE',
    body: JSON.stringify({ ids }),
  });
}

// ─── Global Search ──────────────────────────────────────────────────────────

export type SearchGroupType = 'item' | 'order' | 'customer' | 'stock';

export interface SearchResult {
  id: string;
  title: string;
  subtitle: string;
  url: string;
  image?: string;
}

export interface SearchGroup {
  type: SearchGroupType;
  label: string;
  items: SearchResult[];
}

export interface SearchResponse {
  query: string;
  groups: SearchGroup[];
}

/**
 * Global search across Articles, Commandes, Clients, Stock for a restaurant.
 * Server returns empty groups for queries shorter than 2 chars; clients should
 * skip the call in that case to avoid round trips.
 */
export async function searchGlobal(
  restaurantId: number,
  q: string,
  signal?: AbortSignal,
): Promise<SearchResponse> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    'X-Restaurant-ID': String(restaurantId),
  };
  const url = `${API_URL}/api/v1/restaurants/${restaurantId}/search?q=${encodeURIComponent(q)}&limit=5`;
  const res = await fetch(url, { headers, signal });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || body.message || `Search failed (${res.status})`);
  }
  return res.json();
}

// ─── CSV Import (stock + library items) ──────────────────────────────────────

export type CsvImportCategoryInput = {
  name: string;
  items: string[];
};

export type CsvImportStockInput = {
  default_unit?: StockUnit;
  categories: CsvImportCategoryInput[];
};

export type CsvImportLibraryInput = {
  categories: CsvImportCategoryInput[];
};

export type CsvImportSkipped = {
  name: string;
  category: string;
  reason: string;
};

export type CsvImportStockCreated = {
  id: number;
  name: string;
  category: string;
};

export type CsvImportStockResult = {
  created: CsvImportStockCreated[];
  skipped: CsvImportSkipped[];
};

export type CsvImportLibraryCreated = {
  id: number;
  name: string;
  category_id: number;
};

export type CsvImportLibraryCategory = {
  id: number;
  name: string;
};

export type CsvImportLibraryResult = {
  created: CsvImportLibraryCreated[];
  skipped: CsvImportSkipped[];
  categories_created: CsvImportLibraryCategory[];
};

export async function importStockCsv(
  restaurantId: number, payload: CsvImportStockInput
): Promise<CsvImportStockResult> {
  return apiFetch<CsvImportStockResult>(
    `/api/v1/stock/import/csv?restaurant_id=${restaurantId}`, restaurantId,
    { method: 'POST', body: JSON.stringify(payload) }
  );
}

export async function importMenuItemsCsv(
  restaurantId: number, payload: CsvImportLibraryInput
): Promise<CsvImportLibraryResult> {
  return apiFetch<CsvImportLibraryResult>(
    `/api/v1/menu/import/csv?restaurant_id=${restaurantId}`, restaurantId,
    { method: 'POST', body: JSON.stringify(payload) }
  );
}

// ─── Recipe Lab ───────────────────────────────────────────────────────────────

/** Generate one or more recipe drafts by dish name or existing menu item IDs. */
export async function labGenerateDrafts(
  restaurantId: number,
  body: { dish_names?: string[]; menu_item_ids?: string[]; locale?: string }
): Promise<{ drafts: Draft[] }> {
  return apiFetch<{ drafts: Draft[] }>(
    `/api/v1/lab/drafts/generate?restaurant_id=${restaurantId}`, restaurantId,
    { method: 'POST', body: JSON.stringify(body) }
  );
}

/** List recipe drafts, optionally filtered by status. */
export async function labListDrafts(
  restaurantId: number,
  params?: { status?: DraftStatus[] }
): Promise<Draft[]> {
  const qs = new URLSearchParams({ restaurant_id: String(restaurantId) });
  if (params?.status?.length) {
    qs.set('status', params.status.join(','));
  }
  return apiFetch<Draft[]>(`/api/v1/lab/drafts?${qs.toString()}`, restaurantId);
}

/** Fetch a single recipe draft by ID. */
export async function labGetDraft(
  restaurantId: number,
  id: number
): Promise<Draft> {
  return apiFetch<Draft>(
    `/api/v1/lab/drafts/${id}?restaurant_id=${restaurantId}`, restaurantId
  );
}

/** Replace the payload of a draft without changing its status. Returns 204. */
export async function labPatchDraft(
  restaurantId: number,
  id: number,
  payload: DraftPayload
): Promise<void> {
  await apiFetch<void>(
    `/api/v1/lab/drafts/${id}?restaurant_id=${restaurantId}`, restaurantId,
    { method: 'PATCH', body: JSON.stringify(payload) }
  );
}

/** Send a chat message to refine a draft; returns the assistant reply and diff patches. */
export async function labRefineDraft(
  restaurantId: number,
  id: number,
  userMessage: string
): Promise<{ assistant_message: string; patches: LabChatPatch[] }> {
  return apiFetch<{ assistant_message: string; patches: LabChatPatch[] }>(
    `/api/v1/lab/drafts/${id}/refine?restaurant_id=${restaurantId}`, restaurantId,
    { method: 'POST', body: JSON.stringify({ user_message: userMessage }) }
  );
}

/** Commit a draft: create/link stock & prep items and create the menu item. */
export async function labCommitDraft(
  restaurantId: number,
  id: number,
  payload: DraftPayload
): Promise<CommitResult> {
  return apiFetch<CommitResult>(
    `/api/v1/lab/drafts/${id}/commit?restaurant_id=${restaurantId}`, restaurantId,
    { method: 'POST', body: JSON.stringify(payload) }
  );
}

/** Discard a draft. Returns 204. */
export async function labDiscardDraft(
  restaurantId: number,
  id: number
): Promise<void> {
  await apiFetch<void>(
    `/api/v1/lab/drafts/${id}?restaurant_id=${restaurantId}`, restaurantId,
    { method: 'DELETE' }
  );
}

/** Get the restaurant's food cost target percentage (0–100). */
export async function getFoodCostTarget(
  restaurantId: number
): Promise<{ food_cost_target_pct: number }> {
  return apiFetch<{ food_cost_target_pct: number }>(
    `/api/v1/restaurants/settings/food-cost-target?restaurant_id=${restaurantId}`, restaurantId
  );
}

/** Set the restaurant's food cost target percentage (0–100). */
export async function setFoodCostTarget(
  restaurantId: number,
  pct: number
): Promise<{ food_cost_target_pct: number }> {
  return apiFetch<{ food_cost_target_pct: number }>(
    `/api/v1/restaurants/settings/food-cost-target?restaurant_id=${restaurantId}`, restaurantId,
    { method: 'PUT', body: JSON.stringify({ food_cost_target_pct: pct }) }
  );
}

// ─── Recipe-aware Availability ──────────────────────────────────────────────

export type AvailabilityOverride = 'auto' | 'force_available' | 'force_sold_out';
export type AvailabilityState = 'available' | 'low' | 'sold_out' | 'hidden';
export type OutOfStockBehavior = 'sold_out' | 'hide';

/** A reusable availability rule in the restaurant's rule library. */
export interface AvailabilityRule {
  id: number;
  restaurant_id: number;
  name: string;
  track: boolean;
  low_stock_threshold: number;
  out_of_stock_behavior: OutOfStockBehavior;
  show_count: boolean;
  is_default: boolean;
  sort_order: number;
}

export type AvailabilityRuleInput = Omit<AvailabilityRule, 'id' | 'restaurant_id'>;

/** Live availability of one dish, for the per-dish editor panel. */
export interface AvailabilityPreview {
  buildable: number;
  unlimited: boolean;
  bottleneck: string;
  state: AvailabilityState;
  count: number | null;
}

/** List the rule library (seeds starter rules on first access). */
export async function listAvailabilityRules(restaurantId: number): Promise<AvailabilityRule[]> {
  const data = await apiFetch<{ rules: AvailabilityRule[] }>(`/api/v1/availability/rules`, restaurantId);
  return data.rules ?? [];
}

export async function createAvailabilityRule(restaurantId: number, input: AvailabilityRuleInput): Promise<AvailabilityRule> {
  const data = await apiFetch<{ rule: AvailabilityRule }>(`/api/v1/availability/rules`, restaurantId, {
    method: 'POST', body: JSON.stringify(input),
  });
  return data.rule;
}

export async function updateAvailabilityRule(restaurantId: number, id: number, input: AvailabilityRuleInput): Promise<AvailabilityRule> {
  const data = await apiFetch<{ rule: AvailabilityRule }>(`/api/v1/availability/rules/${id}`, restaurantId, {
    method: 'PUT', body: JSON.stringify(input),
  });
  return data.rule;
}

export async function deleteAvailabilityRule(restaurantId: number, id: number): Promise<void> {
  await apiFetch(`/api/v1/availability/rules/${id}`, restaurantId, { method: 'DELETE' });
}

/** Live buildable count + bottleneck + resolved state for a single dish. */
export async function previewItemAvailability(restaurantId: number, itemId: number): Promise<AvailabilityPreview> {
  return apiFetch<AvailabilityPreview>(`/api/v1/availability/items/${itemId}/preview`, restaurantId);
}

// ─── WhatsApp Embedded Signup (ISV / Tech Provider) ────────────────────────────

export interface WhatsAppSender {
  id: number;
  restaurant_id: number;
  waba_id: string;
  phone_number_id: string;
  sender_sid: string;
  sender_number: string;
  display_name: string;
  status: string; // CREATING | ONLINE | OFFLINE | PENDING_VERIFICATION | ...
}

/** Returns the restaurant's connected WhatsApp sender (with live-refreshed status), or null. */
export async function getWhatsAppSender(restaurantId: number): Promise<WhatsAppSender | null> {
  const res = await apiFetch<{ sender: WhatsAppSender | null }>(
    `/api/v1/restaurants/${restaurantId}/whatsapp/sender`,
    restaurantId,
  );
  return res.sender;
}

/** Registers the restaurant's WhatsApp sender after Embedded Signup completes. */
export async function connectWhatsApp(
  restaurantId: number,
  input: { waba_id: string; phone_number_id: string; phone_number: string; display_name: string },
): Promise<WhatsAppSender> {
  return apiFetch<WhatsAppSender>(
    `/api/v1/restaurants/${restaurantId}/whatsapp/connect`,
    restaurantId,
    { method: 'POST', body: JSON.stringify(input) },
  );
}

/** Disconnects the restaurant's WhatsApp sender (deletes the local record). */
export async function disconnectWhatsApp(restaurantId: number): Promise<void> {
  return apiFetch<void>(
    `/api/v1/restaurants/${restaurantId}/whatsapp/sender`,
    restaurantId,
    { method: 'DELETE' },
  );
}

// ─── Social reels (Instagram/TikTok Stories page) ────────────────────────────

export type SocialProvider = 'instagram' | 'tiktok';

export interface SocialConnection {
  connected: boolean;
  server_configured?: boolean;
  provider?: string;
  handle?: string;
  enabled?: boolean;
  last_synced_at?: string | null;
  last_sync_error?: string;
  token_expires_at?: string | null;
  /** Present on the connect response: how many reels the initial sync pulled. */
  synced?: number;
  sync_error?: string;
}

export interface Reel {
  id: number;
  restaurant_id: number;
  provider: string;
  external_id: string;
  media_url: string;
  embed_url: string;
  thumbnail_url: string;
  caption: string;
  permalink: string;
  sort_order: number;
  is_visible: boolean;
  published_at?: string | null;
}

/** Returns the connection status for a social provider (Instagram/TikTok). */
export async function getSocialConnection(
  restaurantId: number,
  provider: SocialProvider,
): Promise<SocialConnection> {
  return apiFetch<SocialConnection>(
    `/api/v1/restaurants/${restaurantId}/social/${provider}`,
    restaurantId,
  );
}

/** Stores a social connection from an FB.login user access token (or an OAuth code). */
export async function connectSocial(
  restaurantId: number,
  provider: SocialProvider,
  input: { access_token?: string; code?: string; redirect_uri?: string },
): Promise<SocialConnection> {
  return apiFetch<SocialConnection>(
    `/api/v1/restaurants/${restaurantId}/social/${provider}/connect`,
    restaurantId,
    { method: 'POST', body: JSON.stringify(input) },
  );
}

/** Disconnects a social provider and removes its synced reels. */
export async function disconnectSocial(
  restaurantId: number,
  provider: SocialProvider,
): Promise<void> {
  return apiFetch<void>(
    `/api/v1/restaurants/${restaurantId}/social/${provider}`,
    restaurantId,
    { method: 'DELETE' },
  );
}

/** Triggers an immediate reel sync from the connected provider. Returns the count. */
export async function syncSocial(
  restaurantId: number,
  provider: SocialProvider,
): Promise<{ synced: number }> {
  return apiFetch<{ synced: number }>(
    `/api/v1/restaurants/${restaurantId}/social/${provider}/sync`,
    restaurantId,
    { method: 'POST' },
  );
}

/** Lists all reels (visible or hidden) for the reels manager. */
export async function listReels(restaurantId: number): Promise<Reel[]> {
  const res = await apiFetch<{ reels: Reel[] }>(
    `/api/v1/restaurants/${restaurantId}/reels`,
    restaurantId,
  );
  return res.reels ?? [];
}

/** Toggles visibility / sort order for a single reel. */
export async function updateReel(
  restaurantId: number,
  reelId: number,
  input: { is_visible?: boolean; sort_order?: number },
): Promise<Reel> {
  return apiFetch<Reel>(
    `/api/v1/restaurants/${restaurantId}/reels/${reelId}`,
    restaurantId,
    { method: 'PATCH', body: JSON.stringify(input) },
  );
}

/** Persists a new reel ordering. */
export async function reorderReels(restaurantId: number, ids: number[]): Promise<void> {
  return apiFetch<void>(
    `/api/v1/restaurants/${restaurantId}/reels-reorder`,
    restaurantId,
    { method: 'PUT', body: JSON.stringify({ ids }) },
  );
}

/** Removes a single reel. */
export async function deleteReel(restaurantId: number, reelId: number): Promise<void> {
  return apiFetch<void>(
    `/api/v1/restaurants/${restaurantId}/reels/${reelId}`,
    restaurantId,
    { method: 'DELETE' },
  );
}

// ─── Menu Item AI Image Generator ───────────────────────────────────────────
// Per-restaurant prompt templates + on-demand text-to-image and image-to-image
// generation against gpt-image-1. Templates can include {{item_name}},
// {{item_description}}, {{category}} placeholders rendered server-side.

export interface MenuImagePrompt {
  id: number;
  restaurant_id: number;
  name: string;
  prompt: string;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface MenuImageGenerationResult {
  generation_id: number;
  image_b64: string;
  rendered_prompt: string;
}

export interface MenuImageConfirmResult {
  image_url: string;
  item: MenuItem;
}

export async function listMenuImagePrompts(restaurantId: number): Promise<MenuImagePrompt[]> {
  const data = await apiFetch<{ prompts: MenuImagePrompt[] }>(
    `/api/v1/menu/image-prompts?restaurant_id=${restaurantId}`,
    restaurantId,
  );
  return data.prompts ?? [];
}

export async function createMenuImagePrompt(
  restaurantId: number,
  input: { name: string; prompt: string; is_default?: boolean },
): Promise<MenuImagePrompt> {
  return apiFetch<MenuImagePrompt>(
    `/api/v1/menu/image-prompts?restaurant_id=${restaurantId}`,
    restaurantId,
    { method: 'POST', body: JSON.stringify(input) },
  );
}

export async function updateMenuImagePrompt(
  restaurantId: number,
  id: number,
  input: Partial<{ name: string; prompt: string; is_default: boolean }>,
): Promise<MenuImagePrompt> {
  return apiFetch<MenuImagePrompt>(
    `/api/v1/menu/image-prompts/${id}?restaurant_id=${restaurantId}`,
    restaurantId,
    { method: 'PUT', body: JSON.stringify(input) },
  );
}

export async function deleteMenuImagePrompt(restaurantId: number, id: number): Promise<void> {
  await apiFetch(
    `/api/v1/menu/image-prompts/${id}?restaurant_id=${restaurantId}`,
    restaurantId,
    { method: 'DELETE' },
  );
}

export async function generateMenuItemImage(
  restaurantId: number,
  itemId: number,
  input: { prompt_id?: number; prompt_override?: string },
): Promise<MenuImageGenerationResult> {
  return apiFetch<MenuImageGenerationResult>(
    `/api/v1/menu/items/${itemId}/ai-image/generate?restaurant_id=${restaurantId}`,
    restaurantId,
    { method: 'POST', body: JSON.stringify(input) },
  );
}

/** Sends a reference image + prompt to /v1/images/edits. Bypasses apiFetch
 *  because the body is multipart, not JSON. */
export async function editMenuItemImage(
  restaurantId: number,
  itemId: number,
  reference: File,
  input: { prompt_id?: number; prompt_override?: string },
): Promise<MenuImageGenerationResult> {
  const form = new FormData();
  form.append('image', reference);
  if (input.prompt_id != null) form.append('prompt_id', String(input.prompt_id));
  if (input.prompt_override) form.append('prompt_override', input.prompt_override);
  const token = getToken();
  const res = await fetch(
    `${API_URL}/api/v1/menu/items/${itemId}/ai-image/edit?restaurant_id=${restaurantId}`,
    {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
    },
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Edit failed' }));
    throw new Error(err.detail || err.error || 'Edit failed');
  }
  return res.json();
}

export async function confirmMenuItemImage(
  restaurantId: number,
  itemId: number,
  input: { generation_id: number; image_b64: string },
): Promise<MenuImageConfirmResult> {
  return apiFetch<MenuImageConfirmResult>(
    `/api/v1/menu/items/${itemId}/ai-image/confirm?restaurant_id=${restaurantId}`,
    restaurantId,
    { method: 'POST', body: JSON.stringify(input) },
  );
}

// --- Delivery Zones ---

export type DeliveryZoneType = 'polygon' | 'radius' | 'cities';

export interface DeliveryZone {
  id: number;
  restaurant_id: number;
  name: string;
  type: DeliveryZoneType;
  is_active: boolean;
  polygon?: [number, number][]; // [lng, lat] pairs
  center_lat?: number;
  center_lng?: number;
  radius_m?: number;
  cities?: string[];
  /** Flat delivery fee charged for this zone. null/undefined = free delivery. */
  delivery_fee?: number | null;
  /** Minimum cart subtotal to deliver here. null/undefined = use the global minimum_order_delivery. */
  min_order?: number | null;
  /** True for a zone that exists only to serve a delivery tour. Such a zone is
   *  invisible to the classic delivery path, so the city stays undeliverable
   *  outside a tour. */
  tour_only?: boolean;
  created_at: string;
}

export interface DeliveryZoneInput {
  name: string;
  type: DeliveryZoneType;
  is_active?: boolean;
  polygon?: [number, number][];
  center_lat?: number;
  center_lng?: number;
  radius_m?: number;
  cities?: string[];
  delivery_fee?: number | null;
  min_order?: number | null;
  /** Omit to leave the flag untouched on update (the server reads it as a
   *  pointer). Send true when creating the zone that backs a delivery tour. */
  tour_only?: boolean;
}

export async function getDeliveryZones(restaurantId: number): Promise<DeliveryZone[]> {
  const data = await apiFetch<{ zones: DeliveryZone[] }>(
    `/api/v1/delivery/zones?restaurant_id=${restaurantId}`, restaurantId
  );
  return data.zones ?? [];
}

export async function createDeliveryZone(restaurantId: number, input: DeliveryZoneInput): Promise<DeliveryZone> {
  return apiFetch<DeliveryZone>(
    `/api/v1/delivery/zones?restaurant_id=${restaurantId}`, restaurantId,
    { method: 'POST', body: JSON.stringify(input) }
  );
}

export async function updateDeliveryZone(restaurantId: number, id: number, input: DeliveryZoneInput): Promise<DeliveryZone> {
  return apiFetch<DeliveryZone>(
    `/api/v1/delivery/zones/${id}?restaurant_id=${restaurantId}`, restaurantId,
    { method: 'PUT', body: JSON.stringify(input) }
  );
}

export async function deleteDeliveryZone(restaurantId: number, id: number): Promise<void> {
  await apiFetch<void>(
    `/api/v1/delivery/zones/${id}?restaurant_id=${restaurantId}`, restaurantId,
    { method: 'DELETE' }
  );
}

// --- Delivery Tours ---
//
// A tour is one delivery round to an extended zone on a given day, served with
// its own carte. The zone (tour_only) and the menu (web_enabled = false) are
// reusable; the tour is the throwaway instance. While its [opens_at, cutoff_at]
// window is open and it is published, its carte shows up as an extra tab on the
// customer site.
//
// The server enforces both invariants and answers 400 otherwise: the zone must
// be tour_only AND active, the menu must NOT be web_enabled. Callers must only
// ever offer the user zones and cartes that satisfy them.

export interface DeliveryTour {
  id: number;
  restaurant_id: number;
  name: string;
  /** URL-safe slug, unique per restaurant, generated from the name at creation
   *  and stable across renames. The tour's dedicated public link is
   *  /r/<restaurant-slug>/tournee/<slug>. */
  slug: string;
  zone_id: number;
  zone?: DeliveryZone;
  menu_id: number;
  menu?: { id: number; name: string };
  /** RFC3339 timestamp at UTC midnight, NOT "YYYY-MM-DD". Read the calendar day
   *  off the first 10 characters; `new Date(...)` shifts it a day in any
   *  negative-offset timezone. */
  delivery_date: string;
  /** RFC3339. Ordering opens at this instant. */
  opens_at: string;
  /** RFC3339. Ordering closes at this instant. Always after opens_at. */
  cutoff_at: string;
  /** Announced delivery window, "HH:MM". null = no window announced. */
  delivery_start?: string | null;
  delivery_end?: string | null;
  /** Overrides the zone's fee. null = fall back to the zone. */
  delivery_fee?: number | null;
  /** Overrides the zone's minimum. null = fall back to the zone, then the global. */
  min_order?: number | null;
  require_prepayment: boolean;
  is_published: boolean;
  created_at: string;
}

export interface DeliveryTourInput {
  name: string;
  zone_id: number;
  menu_id: number;
  /** "YYYY-MM-DD" — the server rejects anything else. */
  delivery_date: string;
  opens_at: string; // RFC3339
  cutoff_at: string; // RFC3339, must be after opens_at
  /** "HH:MM" — REQUIRED, and the server enforces it: a tour with no announced
   *  window produces orders whose scheduled pickup window is NULL, which the
   *  scheduled-order activator (`window_start <= now`) can never select. Those
   *  orders would stay in "Programmées" forever and never reach the kitchen. */
  delivery_start: string;
  delivery_end: string; // "HH:MM", must be after delivery_start
  delivery_fee?: number | null;
  min_order?: number | null;
  require_prepayment: boolean;
  is_published: boolean;
}

export async function getDeliveryTours(restaurantId: number): Promise<DeliveryTour[]> {
  const data = await apiFetch<{ tours: DeliveryTour[] }>(
    `/api/v1/delivery/tours?restaurant_id=${restaurantId}`, restaurantId
  );
  return data.tours ?? [];
}

export async function createDeliveryTour(restaurantId: number, input: DeliveryTourInput): Promise<DeliveryTour> {
  return apiFetch<DeliveryTour>(
    `/api/v1/delivery/tours?restaurant_id=${restaurantId}`, restaurantId,
    { method: 'POST', body: JSON.stringify(input) }
  );
}

export async function updateDeliveryTour(restaurantId: number, id: number, input: DeliveryTourInput): Promise<DeliveryTour> {
  return apiFetch<DeliveryTour>(
    `/api/v1/delivery/tours/${id}?restaurant_id=${restaurantId}`, restaurantId,
    { method: 'PUT', body: JSON.stringify(input) }
  );
}

export async function deleteDeliveryTour(restaurantId: number, id: number): Promise<void> {
  await apiFetch<void>(
    `/api/v1/delivery/tours/${id}?restaurant_id=${restaurantId}`, restaurantId,
    { method: 'DELETE' }
  );
}

// --- Discounts ---

export interface Discount {
  id: number;
  restaurant_id: number;
  code: string;
  name: string;
  description: string;
  type: 'fixed' | 'percent' | 'free_delivery';
  value: number;
  scope: 'whole_sale' | 'category' | 'specific_item';
  scope_ids: number[];
  min_purchase: number;
  starts_at: string | null;
  ends_at: string | null;
  total_cap: number | null;
  per_customer_cap: number | null;
  is_active: boolean;
  redemption_count: number;
  created_at: string;
}

export type DiscountInput = Omit<Discount, 'id' | 'restaurant_id' | 'redemption_count' | 'created_at'>;

export interface DiscountValidation {
  valid: boolean;
  reason?: string;
  discount?: { code: string; name: string; type: string; value: number; scope: string; amount: number; new_total: number };
}

export interface ManualDiscountInput { type: 'fixed' | 'percent'; value: number; reason: string }

export interface ValidateDiscountRequest {
  code: string;
  items: { item_id: number; category_id: number; line_total: number; quantity: number }[];
  delivery_fee: number;
  phone?: string;
}

export async function listDiscounts(restaurantId: number, opts: { active?: boolean } = {}): Promise<Discount[]> {
  const qs = new URLSearchParams({ restaurant_id: String(restaurantId) });
  if (opts.active !== undefined) qs.set('active', String(opts.active));
  const data = await apiFetch<{ discounts: Discount[] }>(`/api/v1/discounts?${qs.toString()}`, restaurantId);
  return data.discounts ?? [];
}

export async function getDiscount(restaurantId: number, id: number): Promise<Discount> {
  const data = await apiFetch<{ discount: Discount }>(`/api/v1/discounts/${id}?restaurant_id=${restaurantId}`, restaurantId);
  return data.discount;
}

export async function createDiscount(restaurantId: number, input: DiscountInput): Promise<Discount> {
  const data = await apiFetch<{ discount: Discount }>(`/api/v1/discounts?restaurant_id=${restaurantId}`, restaurantId, { method: 'POST', body: JSON.stringify(input) });
  return data.discount;
}

export async function updateDiscount(restaurantId: number, id: number, input: Partial<DiscountInput>): Promise<Discount> {
  const data = await apiFetch<{ discount: Discount }>(`/api/v1/discounts/${id}?restaurant_id=${restaurantId}`, restaurantId, { method: 'PUT', body: JSON.stringify(input) });
  return data.discount;
}

export async function deleteDiscount(restaurantId: number, id: number): Promise<void> {
  await apiFetch<void>(`/api/v1/discounts/${id}?restaurant_id=${restaurantId}`, restaurantId, { method: 'DELETE' });
}

export async function validateDiscount(restaurantId: number, req: ValidateDiscountRequest): Promise<DiscountValidation> {
  return apiFetch<DiscountValidation>(`/api/v1/discounts/validate?restaurant_id=${restaurantId}`, restaurantId, { method: 'POST', body: JSON.stringify(req) });
}

/**
 * Geocode an address or city name via the server's free Nominatim-backed endpoint.
 * Returns `{found: false}` on failure so callers can always destructure safely.
 */
export async function geocodeAddress(
  _restaurantId: number,
  address: string,
  city?: string,
): Promise<{ found: boolean; lat?: number; lng?: number }> {
  const q = new URLSearchParams({ address });
  if (city) q.set('city', city);
  try {
    const res = await fetch(`${API_URL}/api/v1/public/geocode?${q.toString()}`);
    if (!res.ok) return { found: false };
    return res.json();
  } catch {
    return { found: false };
  }
}

/**
 * Resolve a delivery address against the restaurant's delivery zones and return
 * the matched zone's fee. Wraps the public `GET /public/delivery/check`. Used to
 * prefill the delivery fee on the manual-order screen (staff can still edit it).
 * Returns `{ deliverable: false }` on any error so callers can degrade to a blank
 * fee field rather than block the order.
 */
export async function checkDeliverable(
  restaurantId: number,
  address: string,
  city?: string,
): Promise<{ deliverable: boolean; resolved?: boolean; delivery_fee?: number }> {
  const q = new URLSearchParams({ restaurant_id: String(restaurantId), address });
  if (city) q.set('city', city);
  try {
    const res = await fetch(`${API_URL}/api/v1/public/delivery/check?${q.toString()}`);
    if (!res.ok) return { deliverable: false };
    return res.json();
  } catch {
    return { deliverable: false };
  }
}

// ---- Catering ----
export type CateringPricingModel = 'per_unit' | 'per_person' | 'custom_quote';

export interface CateringService {
  id: number;
  restaurant_id: number;
  name: string;
  slug: string;
  description: string;
  pricing_model: CateringPricingModel;
  quote_mode: 'auto' | 'review';
  is_active: boolean;
  display_order: number;
}

export interface CateringServiceInput {
  name: string;
  description?: string;
  pricing_model: CateringPricingModel;
  quote_mode?: 'auto' | 'review';
  is_active?: boolean;
  display_order?: number;
}

export interface CateringBranch {
  location: {
    id: number;
    name: string;
    address: string;
    is_active: boolean;
    catering_type: 'standard' | 'labo';
    latitude?: number | null;
    longitude?: number | null;
  };
  service_ids: number[];
}

export interface CateringBranchInput {
  catering_type: 'standard' | 'labo';
  latitude?: number | null;
  longitude?: number | null;
  service_ids: number[];
}

/** List all catering services for a restaurant. */
export async function listCateringServices(restaurantId: number): Promise<CateringService[]> {
  const res = await apiFetch<{ services: CateringService[] }>('/api/v1/catering/services', restaurantId);
  return res.services ?? [];
}

/** Create a catering service. */
export async function createCateringService(restaurantId: number, body: CateringServiceInput): Promise<CateringService> {
  return apiFetch<CateringService>('/api/v1/catering/services', restaurantId, { method: 'POST', body: JSON.stringify(body) });
}

/** Update a catering service. */
export async function updateCateringService(restaurantId: number, id: number, body: CateringServiceInput): Promise<CateringService> {
  return apiFetch<CateringService>(`/api/v1/catering/services/${id}`, restaurantId, { method: 'PUT', body: JSON.stringify(body) });
}

/** Archive (soft-delete) a catering service. */
export async function archiveCateringService(restaurantId: number, id: number): Promise<void> {
  await apiFetch(`/api/v1/catering/services/${id}`, restaurantId, { method: 'DELETE' });
}

/** List branches with their catering capabilities. */
export async function listCateringBranches(restaurantId: number): Promise<CateringBranch[]> {
  const res = await apiFetch<{ branches: CateringBranch[] }>('/api/v1/catering/branches', restaurantId);
  return res.branches ?? [];
}

/** Set a branch's catering type, coordinates, and service capabilities. */
export async function updateCateringBranch(restaurantId: number, locationId: number, body: CateringBranchInput): Promise<CateringBranch> {
  return apiFetch<CateringBranch>(`/api/v1/catering/branches/${locationId}`, restaurantId, { method: 'PUT', body: JSON.stringify(body) });
}

export interface CateringRoutingRule {
  id: number;
  restaurant_id: number;
  service_id: number;
  name: string;
  cities: string[];
  target_location_id: number;
  priority: number;
  is_fallback: boolean;
  is_active: boolean;
}

export interface CateringRoutingRuleInput {
  service_id: number;
  name: string;
  cities: string[];
  target_location_id: number;
  priority?: number;
  is_fallback?: boolean;
  is_active?: boolean;
}

/** List catering routing rules (priority desc, id asc). */
export async function listCateringRoutingRules(restaurantId: number): Promise<CateringRoutingRule[]> {
  const res = await apiFetch<{ routing_rules: CateringRoutingRule[] }>('/api/v1/catering/routing-rules', restaurantId);
  return res.routing_rules ?? [];
}

/** Create a catering routing rule. */
export async function createCateringRoutingRule(restaurantId: number, body: CateringRoutingRuleInput): Promise<CateringRoutingRule> {
  return apiFetch<CateringRoutingRule>('/api/v1/catering/routing-rules', restaurantId, { method: 'POST', body: JSON.stringify(body) });
}

/** Update a catering routing rule. */
export async function updateCateringRoutingRule(restaurantId: number, id: number, body: CateringRoutingRuleInput): Promise<CateringRoutingRule> {
  return apiFetch<CateringRoutingRule>(`/api/v1/catering/routing-rules/${id}`, restaurantId, { method: 'PUT', body: JSON.stringify(body) });
}

/** Delete (soft) a catering routing rule. */
export async function deleteCateringRoutingRule(restaurantId: number, id: number): Promise<void> {
  await apiFetch(`/api/v1/catering/routing-rules/${id}`, restaurantId, { method: 'DELETE' });
}

export type CateringQuoteStatus = 'auto_approved' | 'pending_human_review' | 'approved' | 'rejected';

export type CateringDepositStatus = 'none' | 'pending' | 'paid' | 'refunding' | 'refunded';

export interface CateringQuote {
  id: number;
  restaurant_id: number;
  service_id: number;
  public_token: string;
  customer_name: string;
  customer_phone: string;
  customer_email: string;
  guests: number;
  event_date: string | null;
  event_city: string;
  event_type: string;
  config: unknown;
  total: number;
  status: CateringQuoteStatus;
  review_note: string;
  deposit_status: CateringDepositStatus;
  deposit_amount: number;
  /** Non-empty when a second successful charge landed on an already-paid quote (customer charged twice) and needs refunding. */
  deposit_overcharge_txn_uid: string;
  deposit_refund_txn_uid: string;
  deposit_refunded_amount: number;
  deposit_refunded_at: string | null;
  overcharge_refund_txn_uid: string;
  created_at: string;
}

export interface CateringQuoteReviewInput { total?: number; note?: string }

/** Which charge a refund targets: the primary deposit, or a recorded duplicate charge. */
export type CateringRefundTarget = 'deposit' | 'overcharge';

export interface CateringDepositRefundInput { amount: number; target: CateringRefundTarget }

/** List catering quotes, optionally filtered by status. */
export async function listCateringQuotes(restaurantId: number, status?: CateringQuoteStatus): Promise<CateringQuote[]> {
  const qs = status ? `?status=${status}` : '';
  const res = await apiFetch<{ quotes: CateringQuote[] }>(`/api/v1/catering/quotes${qs}`, restaurantId);
  return res.quotes ?? [];
}

/** Get one catering quote. */
export async function getCateringQuote(restaurantId: number, id: number): Promise<CateringQuote> {
  return apiFetch<CateringQuote>(`/api/v1/catering/quotes/${id}`, restaurantId);
}

/** Approve (optionally adjust total) a catering quote. */
export async function approveCateringQuote(restaurantId: number, id: number, body: CateringQuoteReviewInput): Promise<CateringQuote> {
  return apiFetch<CateringQuote>(`/api/v1/catering/quotes/${id}/approve`, restaurantId, { method: 'POST', body: JSON.stringify(body) });
}

/** Reject a catering quote. */
export async function rejectCateringQuote(restaurantId: number, id: number, body: CateringQuoteReviewInput): Promise<CateringQuote> {
  return apiFetch<CateringQuote>(`/api/v1/catering/quotes/${id}/reject`, restaurantId, { method: 'POST', body: JSON.stringify(body) });
}

/** Refund a catering quote's deposit (or a recorded duplicate charge) via PayPlus, at staff discretion. */
export async function refundCateringDeposit(restaurantId: number, id: number, body: CateringDepositRefundInput): Promise<CateringQuote> {
  return apiFetch<CateringQuote>(`/api/v1/catering/quotes/${id}/refund`, restaurantId, { method: 'POST', body: JSON.stringify(body) });
}

// ---- Catering catalog (Phase 2) ----
export interface CateringCatalogItem {
  id: number;
  restaurant_id: number;
  service_id: number;
  name: string;
  description: string;
  image_url: string;
  base_price: number;
  min_quantity: number;
  min_guests: number;
  event_type: string;
  lead_time_days: number;
  is_active: boolean;
  sort_order: number;
}

export interface CateringCatalogItemInput {
  name: string;
  description?: string;
  image_url?: string;
  base_price: number;
  min_quantity?: number;
  min_guests?: number;
  event_type?: string;
  lead_time_days?: number;
  is_active?: boolean;
  sort_order?: number;
}

export type CateringOptionPriceMode = 'fixed' | 'per_person';

export interface CateringOption {
  id: number;
  restaurant_id: number;
  service_id: number;
  name: string;
  description: string;
  price: number;
  price_mode: CateringOptionPriceMode;
  is_active: boolean;
  sort_order: number;
}

export interface CateringOptionInput {
  name: string;
  description?: string;
  price: number;
  price_mode: CateringOptionPriceMode;
  is_active?: boolean;
  sort_order?: number;
}

/** List catalog items for a catering service. */
export async function listCateringItems(restaurantId: number, serviceId: number): Promise<CateringCatalogItem[]> {
  const res = await apiFetch<{ items: CateringCatalogItem[] }>(`/api/v1/catering/services/${serviceId}/items`, restaurantId);
  return res.items ?? [];
}

/** Create a catalog item under a service. */
export async function createCateringItem(restaurantId: number, serviceId: number, body: CateringCatalogItemInput): Promise<CateringCatalogItem> {
  return apiFetch<CateringCatalogItem>(`/api/v1/catering/services/${serviceId}/items`, restaurantId, { method: 'POST', body: JSON.stringify(body) });
}

/** Update a catalog item. */
export async function updateCateringItem(restaurantId: number, id: number, body: CateringCatalogItemInput): Promise<CateringCatalogItem> {
  return apiFetch<CateringCatalogItem>(`/api/v1/catering/items/${id}`, restaurantId, { method: 'PUT', body: JSON.stringify(body) });
}

/** Archive (soft-delete) a catalog item. */
export async function archiveCateringItem(restaurantId: number, id: number): Promise<void> {
  await apiFetch(`/api/v1/catering/items/${id}`, restaurantId, { method: 'DELETE' });
}

/** List add-on options for a catering service. */
export async function listCateringOptions(restaurantId: number, serviceId: number): Promise<CateringOption[]> {
  const res = await apiFetch<{ options: CateringOption[] }>(`/api/v1/catering/services/${serviceId}/options`, restaurantId);
  return res.options ?? [];
}

/** Create an option under a service. */
export async function createCateringOption(restaurantId: number, serviceId: number, body: CateringOptionInput): Promise<CateringOption> {
  return apiFetch<CateringOption>(`/api/v1/catering/services/${serviceId}/options`, restaurantId, { method: 'POST', body: JSON.stringify(body) });
}

/** Update an option. */
export async function updateCateringOption(restaurantId: number, id: number, body: CateringOptionInput): Promise<CateringOption> {
  return apiFetch<CateringOption>(`/api/v1/catering/options/${id}`, restaurantId, { method: 'PUT', body: JSON.stringify(body) });
}

/** Archive (soft-delete) an option. */
export async function archiveCateringOption(restaurantId: number, id: number): Promise<void> {
  await apiFetch(`/api/v1/catering/options/${id}`, restaurantId, { method: 'DELETE' });
}
