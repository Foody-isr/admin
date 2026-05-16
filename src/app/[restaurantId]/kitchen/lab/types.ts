export type ComponentKind = 'stock_existing' | 'stock_new' | 'prep_existing' | 'prep_new';
export type DraftStatus = 'generating' | 'ready' | 'error' | 'committed' | 'discarded';

export interface Component {
  kind: ComponentKind;
  tmp_id?: string;
  stock_item_id?: string;
  prep_item_id?: string;
  name_he?: string;
  name_en?: string;
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
}

export interface CostSummary {
  total_estimated_cost: number;
  target_food_cost?: number;
  food_cost_pct?: number;
  selling_price?: number;
  suggested_min_price?: number;
  target_pct: number;
  verdict: 'ok' | 'over_budget' | 'no_price' | 'loss_making';
}

export interface RecipeStep {
  order: number;
  instruction_he: string;
  instruction_en: string;
}

export interface MenuItemHeader {
  name_he: string;
  name_en: string;
}

export interface DraftPayload {
  menu_item: MenuItemHeader;
  components: Component[];
  recipe_steps: RecipeStep[];
  cost_summary: CostSummary;
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
  chat_history?: ChatMessage[];
  committed_at?: string;
  committed_menu_item_id?: number;
  created_at: string;
  updated_at: string;
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
