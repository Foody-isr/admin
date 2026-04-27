// Top-level sections on the menu-item edit/create pages. The set shown depends
// on `item_type`: articles get details/modifiers/recipe/cost; combos get
// details/composition/cost. `MenuItemTabBar` and the pages share this single
// source so `composition` is a valid section even though it's combo-only.
export type MenuItemSection =
  | 'details'
  | 'modifiers'
  | 'composition'
  | 'recipe'
  | 'cost';
