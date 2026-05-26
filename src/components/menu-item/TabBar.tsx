// Top-level sections on the menu-item edit/create pages. The set shown depends
// on `item_type`: articles get details/recipe/availability; combos get
// details/composition/availability. `MenuItemTabBar` and the pages share this
// single source so `composition` is a valid section even though it's combo-only.
//
// "details" renders as the customer-facing "Article" tab (identity + price +
// sizes + modifiers). "recipe" also carries the folded-in cost readout.
// `modifiers` and `cost` were removed in the editor simplification — their
// content now lives inside the `details` and `recipe` tabs respectively.
export type MenuItemSection =
  | 'details'
  | 'composition'
  | 'recipe'
  | 'availability';
