export type ComponentKind = 'stock_existing' | 'stock_new' | 'prep_existing' | 'prep_new';
export type DraftStatus = 'generating' | 'ready' | 'error' | 'committed' | 'discarded';
export type RecipeObjective = 'document_recipe' | 'optimize_profit' | 'refresh_menu' | 'seasonal' | 'use_stock' | 'signature';
export type StockPolicy = 'existing_only' | 'prefer_existing' | 'allow_new';

export interface RecipeBrief {
  objective: RecipeObjective;
  stock_policy: StockPolicy;
  creativity: number;
  season?: string;
  max_prep_time_mins?: number;
  dietary?: string[];
  must_use?: string[];
  exclude?: string[];
  notes?: string;
}

export interface Component {
  kind: ComponentKind;
  tmp_id?: string;
  stock_item_id?: string;
  prep_item_id?: string;
  name_he?: string;
  name_primary?: string;
  category?: string;
  yield_per_batch?: number;
  yield_unit?: string;
  qty: number;
  unit: string;
  ingredients?: Component[];
  // Server-computed:
  cost_per_unit?: number;
  line_cost?: number;
  is_price_estimated?: boolean;
  price_confidence?: 'high' | 'medium' | 'low';
  target_cost_per_unit?: number;
  waste_pct?: number;
  cost_status?: 'verified' | 'estimated' | 'unknown';
  cost_source?: 'stock' | 'preparation' | 'market_estimate' | 'missing';
  available_quantity?: number;
  available_units?: string[];
}

export interface CostSummary {
  total_estimated_cost: number;
  target_food_cost?: number;
  food_cost_pct?: number;
  selling_price?: number;
  suggested_min_price?: number;
  target_pct: number;
  verdict: 'ok' | 'over_budget' | 'no_price' | 'loss_making';
  verified_cost: number;
  estimated_cost: number;
  unknown_cost_count: number;
  cost_status: 'verified' | 'estimated' | 'incomplete';
  contribution_margin?: number;
  margin_pct?: number;
}

export interface MenuContextItem {
  id: string;
  name: string;
  category?: string;
  price: number;
  sales_90_days: number;
  revenue_90_days: number;
  ingredients?: string[];
}

export interface MenuContext {
  restaurant_name?: string;
  currency: string;
  average_price: number;
  min_price: number;
  max_price: number;
  items?: MenuContextItem[];
  top_ingredients?: string[];
  current_item?: MenuContextItem;
}

export interface CreativeSummary {
  rationale?: string;
  menu_fit_notes?: string;
  seasonality_notes?: string;
  plating_notes?: string;
  alternatives?: string[];
}

export interface Recommendation {
  code: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  message: string;
  impact_value?: number;
}

export interface DraftMetrics {
  stock_reuse_pct: number;
  menu_fit_score: number;
  operational_score: number;
  complexity_score: number;
  prep_count: number;
  ingredient_count: number;
  recommendations?: Recommendation[];
}

export interface RecipeStep {
  order: number;
  instruction_he: string;
  instruction_primary: string;
}

export interface MenuItemHeader {
  name_he: string;
  name_primary: string;
}

export interface DraftPayload {
  creation_mode?: 'ai' | 'manual';
  has_existing_recipe?: boolean;
  menu_item: MenuItemHeader;
  components: Component[];
  recipe_steps: RecipeStep[];
  cost_summary: CostSummary;
  brief: RecipeBrief;
  context: MenuContext;
  creative: CreativeSummary;
  metrics: DraftMetrics;
  revision: number;
  selected_image_url?: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export interface Draft {
  id: number;
  restaurant_id: number;
  dish_name: string;
  menu_item_id?: number;
  status: DraftStatus;
  error_message?: string;
  payload?: DraftPayload;
  brief?: RecipeBrief;
  chat_history?: ChatMessage[];
  committed_at?: string;
  committed_menu_item_id?: number;
  created_at: string;
  updated_at: string;
}

export interface RecipeVersion {
  id: number;
  restaurant_id: number;
  menu_item_id: number;
  draft_id?: number;
  version: number;
  objective: RecipeObjective;
  change_summary: string;
  payload: DraftPayload;
  food_cost: number;
  selling_price: number;
  cost_status: CostSummary['cost_status'];
  created_by_id: number;
  created_at: string;
}

export interface DraftImageResult {
  generation_id: number;
  image_b64: string;
  rendered_prompt: string;
  recipe_revision: number;
}

export interface ChatPatch {
  op: 'set_qty' | 'swap_ingredient' | 'add' | 'remove' | 'regenerate_subtree';
  path: string;
  value?: Component;
  new_qty?: number;
  new_unit?: string;
}

export interface CommitResult {
  menu_item_id: string;
  created: { stock_items: string[]; prep_items: string[] };
  linked: { stock_items: string[]; prep_items: string[] };
}
