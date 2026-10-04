# Inventaire FoodyAdmin

Audit initial du 4 octobre 2026 : 102 types de routes. Périmètre utilisateur actualisé : 91 routes produit actives, 7 reportées (Traiteur6 et Tournées), 2 éditeurs retirés (Website/V2), 2 aperçus internes conservés hors périmètre produit. Base `bd3b4d9a` (origin/develop). Les routes dynamiques sont regroupées par type.

Les cinq étapes sont distinctes : **I** inventorié, **C** conçu, **M** implémenté, **F** testé fonctionnellement, **V** inspecté visuellement. ◐ signifie partiel, avec un périmètre explicitement décrit ci-dessous. Une propagation de tokens seule ne valide pas M/F/V. Les imports, overlays, états et contrôles locaux sont détaillés dans `surfaces.json`.

## Contrôles communs

Routes restaurant : AuthProvider → RestaurantGuard → PermissionsProvider → PermissionRouteGuard. Les layouts imbriqués ajoutent leurs permissions. Courrier : CourierShell. Chaîne : layout spécifique. Sources métier : API/types, permissions et fonctions existantes, jamais les données de la landing.

| Route / type | Fichier | Overlays et sous-vues repérés | I | C | M | F | V |
|---|---|---|---|---|---|---|---|
| `/[restaurantId]/analytics/customers` | `src/app/[restaurantId]/analytics/customers/page.tsx` | CustomerDetailPanel, DataTable, DataTableBody, DataTableCell, DataTableHead, DataTableHeadCell, DataTableRow | ✓ | ✓ | ◐ | ◐ | ◐ |
| `/[restaurantId]/analytics/items` | `src/app/[restaurantId]/analytics/items/page.tsx` | DataTable, DataTableBody, DataTableCell, DataTableHead, DataTableRow, ItemDetailPanel | ✓ | ✓ | ◐ | ◐ | ◐ |
| `/[restaurantId]/analytics/overview` | `src/app/[restaurantId]/analytics/overview/page.tsx` | Voir composants/imports | ✓ | ✓ | ◐ | ◐ | ◐ |
| `/[restaurantId]/analytics` | `src/app/[restaurantId]/analytics/page.tsx` | Voir composants/imports | ✓ | ✓ | ✓ | ✓ | ◐ |
| `/[restaurantId]/billing` | `src/app/[restaurantId]/billing/page.tsx` | Voir composants/imports | ✓ | ✓ | ✓ | ✓ | ✓ |
| `/[restaurantId]/catering/branches` | `src/app/[restaurantId]/catering/branches/page.tsx` | Voir composants/imports | ✓ | — | — | — | — | Reporté par utilisateur. |
| `/[restaurantId]/catering/events` | `src/app/[restaurantId]/catering/events/page.tsx` | DataTable, DataTableBody, DataTableCell, DataTableHead, DataTableHeadCell, DataTableRow | ✓ | — | — | — | — | Reporté par utilisateur. |
| `/[restaurantId]/catering/quotes` | `src/app/[restaurantId]/catering/quotes/page.tsx` | DataTable, DataTableBody, DataTableCell, DataTableHead, DataTableHeadCell, DataTableHeadSpacerCell, DataTableRow, QuoteReviewModal | ✓ | — | — | — | — | Reporté par utilisateur. |
| `/[restaurantId]/catering/routing` | `src/app/[restaurantId]/catering/routing/page.tsx` | DataTable, DataTableBody, DataTableCell, DataTableHead, DataTableHeadCell, DataTableHeadSpacerCell, DataTableRow, RoutingRuleEditModal | ✓ | — | — | — | — | Reporté par utilisateur. |
| `/[restaurantId]/catering/services/[serviceId]` | `src/app/[restaurantId]/catering/services/[serviceId]/page.tsx` | Voir composants/imports | ✓ | — | — | — | — | Reporté par utilisateur. |
| `/[restaurantId]/catering/services` | `src/app/[restaurantId]/catering/services/page.tsx` | ServiceEditor | ✓ | — | — | — | — | Reporté par utilisateur. |
| `/[restaurantId]/chain/branches` | `src/app/[restaurantId]/chain/branches/page.tsx` | CreateBranchModal, CreateChainModal, EditBranchModal, EditChainModal | ✓ | — | — | — | — |
| `/[restaurantId]/customers` | `src/app/[restaurantId]/customers/page.tsx` | DataTable, DataTableBody, DataTableCell, DataTableHead, DataTableHeadCell, DataTableHeadSpacerCell, DataTableRow, DataTableSelectAllCell, DataTableSelectCell, MergeCustomersModal | ✓ | ✓ | ✓ | ◐ | ◐ |
| `/[restaurantId]/dashboard` | `src/app/[restaurantId]/dashboard/page.tsx` | TopSellersPanel | ✓ | ✓ | ◐ | ◐ | ◐ |
| `/[restaurantId]/delivery/tours` | `src/app/[restaurantId]/delivery/tours/page.tsx` | DataTable, DataTableBody, DataTableCell, DataTableHead, DataTableHeadCell, DataTableRow | ✓ | — | — | — | — | Reporté par utilisateur. |
| `/[restaurantId]/kitchen/availability` | `src/app/[restaurantId]/kitchen/availability/page.tsx` | Voir composants/imports | ✓ | ✓ | ◐ | ◐ | ◐ |
| `/[restaurantId]/kitchen/daily-operations` | `src/app/[restaurantId]/kitchen/daily-operations/page.tsx` | DailyProductionModal, DailyReceiptModal, DeliveryImportModal, KitchenDrawer, NextServicePanel, QuantityEntryDrawer, QuickReceiveModal, QuickSalesModal, SalesImportModal | ✓ | ✓ | ◐ | ◐ | ◐ |
| `/[restaurantId]/kitchen/data` | `src/app/[restaurantId]/kitchen/data/page.tsx` | Voir composants/imports | ✓ | ✓ | ✓ | ✓ | ◐ |
| `/[restaurantId]/kitchen/food-cost/compare` | `src/app/[restaurantId]/kitchen/food-cost/compare/page.tsx` | CostPctBreakdownModal, FoodCostBreakdownModal | ✓ | ✓ | ✓ | ◐ | ◐ |
| `/[restaurantId]/kitchen/food-cost` | `src/app/[restaurantId]/kitchen/food-cost/page.tsx` | MenuItemTabCost, RecipeImportModal | ✓ | ✓ | ◐ | ◐ | ◐ |
| `/[restaurantId]/kitchen/lab` | `src/app/[restaurantId]/kitchen/lab/page.tsx` | IntelligencePanel, ManualValidationPanel, RefineDrawer | ✓ | ✓ | ✓ | ◐ | ◐ |
| `/[restaurantId]/kitchen` | `src/app/[restaurantId]/kitchen/page.tsx` | Voir composants/imports | ✓ | ✓ | ✓ | ✓ | ◐ |
| `/[restaurantId]/kitchen/prep` | `src/app/[restaurantId]/kitchen/prep/page.tsx` | BatchProduceModal, CategoryDrawer, DailyPlanModal, DataTable, DataTableBody, DataTableCell, DataTableHead, DataTableHeadCell, DataTableHeadSpacerCell, DataTableRow, DataTableSelectAllCell, DataTableSelectCell, FullScreenEditor, PrepItemModal, PrepTxModal, RecipeImportModal, RecipeStepsEditor, StockFiltersDrawer, StockItemPickerModal | ✓ | ✓ | ✓ | ◐ | ◐ |
| `/[restaurantId]/kitchen/stock` | `src/app/[restaurantId]/kitchen/stock/page.tsx` | StockItemEditor, StockTransactionDialog, StockHistoryDialog, CategoryDrawer, StockFiltersDrawer, CsvImportModal, IngredientIconPicker, DeliveryImportModal, VoiceRecorder | ✓ | ✓ | ◐ | ◐ | ◐ |
| `/[restaurantId]/kitchen/suppliers` | `src/app/[restaurantId]/kitchen/suppliers/page.tsx` | NeedsTab, OrdersTab, PackagingEditor, ProductEditor, ReceiveOrderModal, SendOrderModal, SupplierFormModal, SupplierHubTabs, SupplierProductsModal, SuppliersTab | ✓ | ✓ | ✓ | ◐ | ◐ |
| `/[restaurantId]/kitchen/supplies` | `src/app/[restaurantId]/kitchen/supplies/page.tsx` | SupplyDetailDrawer, SupplyDocumentViewer, suppression de brouillon | ✓ | ✓ | ◐ | ◐ | ◐ |
| `/[restaurantId]/kitchen/units` | `src/app/[restaurantId]/kitchen/units/page.tsx` | UnitFormModal | ✓ | ✓ | ◐ | ◐ | ◐ |
| `/[restaurantId]/marketing/discounts` | `src/app/[restaurantId]/marketing/discounts/page.tsx` | DataTable, DataTableBody, DataTableCell, DataTableHead, DataTableHeadCell, DataTableHeadSpacerCell, DataTableRow, DiscountEditModal |✓|✓|✓|✓|✓|Liste et modale CRUD FR/EN/HE, mobile, lecture seule/rid2, dates inclusives du restaurant, caps historiques, sélections conservées, récupération sans mutation répétée.23 scénarios compilés ; voir discounts-audit.md pour limites serveur/concurrence.|
| `/[restaurantId]/menu/categories` | `src/app/[restaurantId]/menu/categories/page.tsx` | CategoryEditModal, DataTable, DataTableBody, DataTableCell, DataTableHead, DataTableHeadCell, DataTableHeadSpacerCell, DataTableRow | ✓ | ✓ | ✓ | ◐ | ◐ |
| `/[restaurantId]/menu/image-prompts` | `src/app/[restaurantId]/menu/image-prompts/page.tsx` | DataTable, DataTableBody, DataTableCell, DataTableHead, DataTableHeadCell, DataTableHeadSpacerCell, DataTableRow, PromptEditModal | ✓ | ✓ | ✓ | ◐ | ◐ |
| `/[restaurantId]/menu/import` | `src/app/[restaurantId]/menu/import/page.tsx` | TranslationReviewTable | ✓ | ✓ | ◐ | ◐ | ◐ |
| `/[restaurantId]/menu/items/[itemId]` | `src/app/[restaurantId]/menu/items/[itemId]/page.tsx` | AIImageGeneratorModal, ComboSavingsBreakdownModal, CompositionTab, ItemAvailabilityPanel, ItemAvailabilityPanelHandle, MenuItemTabBar, MenuItemTabCost, MenuItemTabDetails, MenuItemTabOptions, MenuItemTabRecipe, MenuItemTabRecipeHandle, VariantsEditor | ✓ | ✓ | ◐ | ◐ | ◐ |
| `/[restaurantId]/menu/items/new` | `src/app/[restaurantId]/menu/items/new/page.tsx` | ComboSavingsBreakdownModal, CompositionTab, MenuItemTabBar, MenuItemTabDetails, VariantsEditor | ✓ | ✓ | ◐ | ◐ | ◐ |
| `/[restaurantId]/menu/items` | `src/app/[restaurantId]/menu/items/page.tsx` | AssignSetDrawer, CategoryDrawer, CsvImportModal, DataTable, DataTableBody, DataTableCell, DataTableHead, DataTableHeadCell, DataTableHeadSpacerCell, DataTableRow, KPIInfoModal, StockFiltersDrawer | ✓ | ✓ | ◐ | ◐ | ◐ |
| `/[restaurantId]/menu/menus/[menuId]/edit` | `src/app/[restaurantId]/menu/menus/[menuId]/edit/page.tsx` | Voir composants/imports | ✓ | ✓ | ✓ | ◐ | ◐ |
| `/[restaurantId]/menu/menus/[menuId]/group/[groupId]` | `src/app/[restaurantId]/menu/menus/[menuId]/group/[groupId]/page.tsx` | GroupSelectionDialog, ReplaceItemsModal, Modal, ConfirmDialog, LocaleTabs, MenuHoursEditor | ✓ | ✓ | ◐ | ◐ | ◐ |
| `/[restaurantId]/menu/menus/[menuId]` | `src/app/[restaurantId]/menu/menus/[menuId]/page.tsx` | AddRemoveItemsModal, MoveToGroupModal, ReplaceItemsModal | ✓ | ✓ | ✓ | ◐ | ◐ |
| `/[restaurantId]/menu/menus/[menuId]/pos-display` | `src/app/[restaurantId]/menu/menus/[menuId]/pos-display/page.tsx` | PosAddTileModal | ✓ | ✓ | ✓ | ◐ | ◐ |
| `/[restaurantId]/menu/menus` | `src/app/[restaurantId]/menu/menus/page.tsx` | DataTable, DataTableBody, DataTableCell, DataTableHead, DataTableHeadCell, DataTableHeadSpacerCell, DataTableRow, MenuCreateModal, MenuHoursEditor | ✓ | ✓ | ✓ | ◐ | ◐ |
| `/[restaurantId]/menu/modifier-sets/[setId]` | `src/app/[restaurantId]/menu/modifier-sets/[setId]/page.tsx` | CenteredModalShell, LocaleTabs | ✓ | ✓ | ◐ | ◐ | ◐ |
| `/[restaurantId]/menu/modifier-sets` | `src/app/[restaurantId]/menu/modifier-sets/page.tsx` | Voir composants/imports | ✓ | ✓ | ✓ | ◐ | ◐ |
| `/[restaurantId]/menu/modifiers` | `src/app/[restaurantId]/menu/modifiers/page.tsx` | CreateModifierModal, DataTable, DataTableBody, DataTableCell, DataTableHead, DataTableHeadCell, DataTableHeadSpacerCell, DataTableRow | ✓ | ✓ | ✓ | ◐ | ◐ |
| `/[restaurantId]/menu/options/[optionSetId]` | `src/app/[restaurantId]/menu/options/[optionSetId]/page.tsx` | CenteredModalShell, LocaleTabs | ✓ | ✓ | ◐ | ◐ | ◐ |
| `/[restaurantId]/menu/options/new` | `src/app/[restaurantId]/menu/options/new/page.tsx` | CenteredModalShell, LocaleTabs | ✓ | ✓ | ◐ | ◐ | ◐ |
| `/[restaurantId]/menu/options` | `src/app/[restaurantId]/menu/options/page.tsx` | Voir composants/imports | ✓ | ✓ | ✓ | ◐ | ◐ |
| `/[restaurantId]/menu` | `src/app/[restaurantId]/menu/page.tsx` | Voir composants/imports | ✓ | ✓ | ✓ | ✓ | ◐ |
| `/[restaurantId]/menu/rotation` | `src/app/[restaurantId]/menu/rotation/page.tsx` | Voir composants/imports | ✓ | ✓ | ✓ | ◐ | ◐ |
| `/[restaurantId]/orders/[orderId]` | `src/app/[restaurantId]/orders/[orderId]/page.tsx` | Voir composants/imports | ✓ | ✓ | ◐ | ◐ | ◐ |
| `/[restaurantId]/orders/all` | `src/app/[restaurantId]/orders/all/page.tsx` | CancelOrderDialog, ConfirmDialog, ConfirmWeightsModal, CorrectPaymentMethodDialog, DataTable, DataTableBody, DataTableCell, DataTableHead, DataTableHeadCell, DataTableRow, EditCustomerDialog, EditOrderDrawer, OrderDetailModal, OrdersTableConfig, OrdersTableSkeleton, OverridePaymentDialog, OverrideStatusDialog, TakePaymentDialog | ✓ | ✓ | ◐ | ◐ | ◐ |
| `/[restaurantId]/orders/courier-mode` | `src/app/[restaurantId]/orders/courier-mode/page.tsx` | Voir composants/imports | ✓ | — | — | — | — |
| `/[restaurantId]/orders/deliveries` | `src/app/[restaurantId]/orders/deliveries/page.tsx` | Voir composants/imports | ✓ | — | — | — | — |
| `/[restaurantId]/orders/new` | `src/app/[restaurantId]/orders/new/page.tsx` | NewOrderCheckoutDrawer, NewOrderComboModal, NewOrderItemModal | ✓ | ✓ | ◐ | ◐ | ◐ |
| `/[restaurantId]/orders` | `src/app/[restaurantId]/orders/page.tsx` | Voir composants/imports | ✓ | ✓ | ✓ | ✓ | ◐ |
| `/[restaurantId]/orders/production` | `src/app/[restaurantId]/orders/production/page.tsx` | Voir composants/imports | ✓ | — | — | — | — |
| `/[restaurantId]/reels` | `src/app/[restaurantId]/reels/page.tsx` | Voir composants/imports | ✓ | ✓ | ✓ | ✓ | ✓ |
| `/[restaurantId]/restaurant/floor-plans/[planId]` | `src/app/[restaurantId]/restaurant/floor-plans/[planId]/page.tsx` | SectionModal, TableEditorModal | ✓ | — | — | — | — |
| `/[restaurantId]/restaurant/floor-plans/new` | `src/app/[restaurantId]/restaurant/floor-plans/new/page.tsx` | Voir composants/imports | ✓ | — | — | — | — |
| `/[restaurantId]/restaurant/floor-plans` | `src/app/[restaurantId]/restaurant/floor-plans/page.tsx` | Voir composants/imports | ✓ | — | — | — | — |
| `/[restaurantId]/restaurant/sections` | `src/app/[restaurantId]/restaurant/sections/page.tsx` | CreateSectionModal | ✓ | ✓ | ✓ | ◐ | ◐ |
| `/[restaurantId]/restaurant/table-qr/customize` | `src/app/[restaurantId]/restaurant/table-qr/customize/page.tsx` | QrTypographyPanel | ✓ | — | — | — | — |
| `/[restaurantId]/restaurant/table-qr` | `src/app/[restaurantId]/restaurant/table-qr/page.tsx` | QrDrawer, SelectedTable, TableEditorModal | ✓ | — | — | — | — |
| `/[restaurantId]/restaurant/table-qr/print` | `src/app/[restaurantId]/restaurant/table-qr/print/page.tsx` | PrintableTable | ✓ | — | — | — | — |
| `/[restaurantId]/restaurant/table-status` | `src/app/[restaurantId]/restaurant/table-status/page.tsx` | Voir composants/imports | ✓ | ✓ | ✓ | ◐ | ◐ |
| `/[restaurantId]/restaurant/workflow` | `src/app/[restaurantId]/restaurant/workflow/page.tsx` | Voir composants/imports | ✓ | ✓ | ✓ | ✓ | ✓ |
| `/[restaurantId]/roles` | `src/app/[restaurantId]/roles/page.tsx` | Voir composants/imports | ✓ | ✓ | ◐ | ◐ | ◐ |
| `/[restaurantId]/settings/ai-assistant` | `src/app/[restaurantId]/settings/ai-assistant/page.tsx` | Voir composants/imports | ✓ | ✓ | ◐ | ◐ | ◐ |
| `/[restaurantId]/settings/branding` | `src/app/[restaurantId]/settings/branding/page.tsx` | Voir composants/imports | ✓ | ✓ | ✓ | ◐ | ◐ |
| `/[restaurantId]/settings/cibus` | `src/app/[restaurantId]/settings/cibus/page.tsx` | Voir composants/imports | ✓ | ✓ | ✓ | ◐ | ◐ |
| `/[restaurantId]/settings/delivery` | `src/app/[restaurantId]/settings/delivery/page.tsx` | Voir composants/imports | ✓ | ✓ | ✓ | ✓ | ✓ | Zones, cartes, minimum séparé, reprise et permissions ; 27 scénarios compilés (lot74). |
| `/[restaurantId]/settings/devices` | `src/app/[restaurantId]/settings/devices/page.tsx` | ConfirmDialog, DeviceDrawerContent, Modal | ✓ | ✓ | ✓ | ✓ | ✓ | Inventaire mobile/RTL, détails C2, filtres/tri/colonnes/pagination, permissions cumulatives, brouillons/polling, actions partielles et récupération. 22 scénarios compilés ; limites matérielles et concurrence dans devices-audit.md. |
| `/[restaurantId]/settings/language` | `src/app/[restaurantId]/settings/language/page.tsx` | TranslationReviewTable | ✓ | ✓ | ◐ | ◐ | ◐ |
| `/[restaurantId]/settings/message-templates` | `src/app/[restaurantId]/settings/message-templates/page.tsx` | TemplateEditor | ✓ | ✓ | ◐ | ◐ | ◐ |
| `/[restaurantId]/settings/notifications` | `src/app/[restaurantId]/settings/notifications/page.tsx` | Voir composants/imports | ✓ | ✓ | ◐ | ◐ | ◐ |
| `/[restaurantId]/settings/opening-hours` | `src/app/[restaurantId]/settings/opening-hours/page.tsx` | Voir composants/imports | ✓ | ✓ | ✓ | ◐ | ◐ |
| `/[restaurantId]/settings/orders/[section]` | `src/app/[restaurantId]/settings/orders/[section]/page.tsx` | Voir composants/imports | ✓ | ✓ | ✓ | ✓ | ✓ |
| `/[restaurantId]/settings/orders` | `src/app/[restaurantId]/settings/orders/page.tsx` | Voir composants/imports | ✓ | ✓ | ✓ | ✓ | ✓ |
| `/[restaurantId]/settings` | `src/app/[restaurantId]/settings/page.tsx` | Voir composants/imports | ✓ | ✓ | ✓ | ◐ | ◐ |
| `/[restaurantId]/settings/payments` | `src/app/[restaurantId]/settings/payments/page.tsx` | Voir composants/imports | ✓ | ✓ | ✓ | ◐ | ◐ |
| `/[restaurantId]/settings/printers` | `src/app/[restaurantId]/settings/printers/page.tsx` | AssignmentEditor, ConfirmDialog, FullScreenEditor, ProfileDrawer, ProfileEditor | ✓ | ✓ | ✓ | ✓ | ✓ | Liste/cartes, détail exhaustif, éditeur commun FR/EN/HE, catégories dédiées aux droits imprimantes, affectations indisponibles conservées, gardes et récupération. 25 scénarios compilés ; limites concurrence dans printer-profiles-audit.md. |
| `/[restaurantId]/settings/scheduled-orders` | `src/app/[restaurantId]/settings/scheduled-orders/page.tsx` | Voir composants/imports | ✓ | ✓ | ✓ | ◐ | ◐ |
| `/[restaurantId]/settings/security` | `src/app/[restaurantId]/settings/security/page.tsx` | Voir composants/imports | ✓ | ✓ | ◐ | ◐ | ◐ |
| `/[restaurantId]/settings/stock/availability` | `src/app/[restaurantId]/settings/stock/availability/page.tsx` | Voir composants/imports | ✓ | ✓ | ◐ | ◐ | ◐ |
| `/[restaurantId]/settings/stock` | `src/app/[restaurantId]/settings/stock/page.tsx` | Voir composants/imports | ✓ | ✓ | ◐ | ◐ | ◐ |
| `/[restaurantId]/settings/stock/units` | `src/app/[restaurantId]/settings/stock/units/page.tsx` | Voir composants/imports | ✓ | ✓ | ◐ | ◐ | ◐ |
| `/[restaurantId]/settings/table-assistance` | `src/app/[restaurantId]/settings/table-assistance/page.tsx` | Voir composants/imports | ✓ | ✓ | ◐ | ◐ | ◐ |
| `/[restaurantId]/settings/team` | `src/app/[restaurantId]/settings/team/page.tsx` | Voir composants/imports | ✓ | ✓ | ◐ | ◐ | ◐ |
| `/[restaurantId]/settings/whatsapp` | `src/app/[restaurantId]/settings/whatsapp/page.tsx` | Voir composants/imports | ✓ | ✓ | ◐ | ◐ | ◐ |
| `/[restaurantId]/staff/devices` | `src/app/[restaurantId]/staff/devices/page.tsx` | DataTable, DataTableBody, DataTableCell, DataTableHead, DataTableHeadCell, DataTableHeadSpacerCell, DataTableRow | ✓ | ✓ | ◐ | ◐ | ◐ |
| `/[restaurantId]/staff` | `src/app/[restaurantId]/staff/page.tsx` | DataTable, DataTableBody, DataTableCell, DataTableHead, DataTableHeadCell, DataTableHeadSpacerCell, DataTableRow | ✓ | ✓ | ◐ | ◐ | ◐ |
| `/[restaurantId]/staff/shifts` | `src/app/[restaurantId]/staff/shifts/page.tsx` | DataTable, DataTableBody, DataTableCell, DataTableHead, DataTableHeadCell, DataTableRow | ✓ | ✓ | ◐ | ◐ | ◐ |
| `/[restaurantId]/staff/table-service` | `src/app/[restaurantId]/staff/table-service/page.tsx` | DataTable, DataTableBody, DataTableCell, DataTableHead, DataTableHeadCell, DataTableHeadSpacerCell, DataTableRow, RestaurantTableRef, TableAssignmentModal | ✓ | ✓ | ◐ | ◐ | ◐ |
| `/[restaurantId]/website` | `src/app/[restaurantId]/website/page.tsx` | AddSectionModal, BannerDesignerPanel, BrandingPanel, CheckoutEditor, CoverBackgroundEditor, MenuSubTab, NavbarPanel, OrderPageInfoEditor, PageCommercePanel, SectionListPanel, SectionSettingsPanel, TemplatePickerModal, ThemesPanel, TypographyPanel | ✓ | — | — | — | — | Éditeur supprimé ; redirection V3. |
| `/[restaurantId]/website-v2` | `src/app/[restaurantId]/website-v2/page.tsx` | AddPagePanel, BaseThemePanel, BrandingPanel, CheckoutEditor, CheckoutSubTab, ContactPanel, DomainPanel, FooterPanel, NavbarPanel, PageEditor, SectionSettingsPanel, SitePanel, ThemesPanel, TypographyPanel | ✓ | — | — | — | — | Éditeur supprimé ; redirection V3. |
| `/[restaurantId]/website-v3` | `src/app/[restaurantId]/website-v3/page.tsx` | Voir composants/imports | ✓ | — | — | — | — |
| `/chain/[chainId]/dashboard` | `src/app/chain/[chainId]/dashboard/page.tsx` | DataTable, DataTableBody, DataTableCell, DataTableHead, DataTableHeadCell, DataTableRow | ✓ | — | — | — | — |
| `/design-system/order-detail` | `src/app/design-system/order-detail/page.tsx` | Voir composants/imports | ✓ | — | — | — | — | Outil interne dev-only, hors périmètre produit. |
| `/design-system` | `src/app/design-system/page.tsx` | Voir composants/imports | ✓ | — | — | — | — | Outil interne dev-only, hors périmètre produit. |
| `/login` | `src/app/login/page.tsx` | Voir composants/imports | ✓ | ✓ | ✓ | ◐ | ◐ |
| `/` | `src/app/page.tsx` | Voir composants/imports | ✓ | ✓ | ✓ | ✓ | ◐ |
| `/reset-password` | `src/app/reset-password/page.tsx` | Voir composants/imports | ✓ | ✓ | ✓ | ◐ | ◐ |
| `/select-restaurant` | `src/app/select-restaurant/page.tsx` | Voir composants/imports | ✓ | ✓ | ✓ | ◐ | ◐ |
| `/setup-account` | `src/app/setup-account/page.tsx` | Voir composants/imports | ✓ | ✓ | ✓ | ◐ | ◐ |

## Composants imbriqués et overlays

Inventaire statique de tous les composants : chaque fichier ci-dessous reste à inspecter dans son contexte métier ; ce repérage ne constitue pas une vérification.

- `src/components/BranchSwitcher.tsx`
- `src/components/DateRangePicker.tsx`
- `src/components/FoodySpinner.tsx`
- `src/components/FormField.tsx`
- `src/components/FormModal.tsx`
- `src/components/FormSection.tsx`
- `src/components/IdleModal.tsx`
- `src/components/MenuGroupPicker.tsx`
- `src/components/Modal.tsx`
- `src/components/PageHeader.tsx`
- `src/components/PermissionGate.tsx`
- `src/components/PermissionRouteGuard.tsx`
- `src/components/SearchableListField.tsx`
- `src/components/SearchableSelect.tsx`
- `src/components/Sidebar.tsx`
- `src/components/StatusPill.tsx`
- `src/components/SubNav.tsx`
- `src/components/TopBar.tsx`
- `src/components/VoiceRecorder.tsx`
- `src/components/ai/AiChat.tsx`
- `src/components/ai/AiDrawer.tsx`
- `src/components/ai/AiMessage.tsx`
- `src/components/ai/AiWelcome.tsx`
- `src/components/brand/FoodyAdminBrand.tsx`
- `src/components/brand/FoodyLogo.tsx`
- `src/components/catering/CateringFlowEditor.tsx`
- `src/components/catering/CateringFormulaComposer.tsx`
- `src/components/catering/CateringGroupArticlesEditor.tsx`
- `src/components/catering/CateringItemGalleryEditor.tsx`
- `src/components/catering/CateringLocaleFields.tsx`
- `src/components/catering/CateringOffersManager.tsx`
- `src/components/catering/CateringPricingEditor.tsx`
- `src/components/common/ActionsDropdown.tsx`
- `src/components/common/CenteredModalShell.tsx`
- `src/components/common/DesktopOnly.tsx`
- `src/components/common/HorizontalScrollRail.tsx`
- `src/components/common/KPIInfoModal.tsx`
- `src/components/common/PushResync.tsx`
- `src/components/common/RowActionsMenu.tsx`
- `src/components/common/ServiceWorkerRegister.tsx`
- `src/components/customers/CustomerDeliveryFields.tsx`
- `src/components/data-table/DataTable.tsx`
- `src/components/delivery/CourierAddressEditor.tsx`
- `src/components/delivery/CourierItineraryView.tsx`
- `src/components/delivery/CourierShell.tsx`
- `src/components/delivery/DeliveryMap.tsx`
- `src/components/delivery/DispatcherView.tsx`
- `src/components/delivery/NavigationAppMenu.tsx`
- `src/components/delivery/RouteSettingsEditor.tsx`
- `src/components/delivery/ZoneMap.tsx`
- `src/components/ds/Avatar.tsx`
- `src/components/ds/Badge.tsx`
- `src/components/ds/Button.tsx`
- `src/components/ds/Card.tsx`
- `src/components/ds/Chip.tsx`
- `src/components/ds/ConfirmDialog.tsx`
- `src/components/ds/Drawer.tsx`
- `src/components/ds/EmptyState.tsx`
- `src/components/ds/Field.tsx`
- `src/components/ds/FullScreenEditor.tsx`
- `src/components/ds/Input.tsx`
- `src/components/ds/Kpi.tsx`
- `src/components/ds/Menu.tsx`
- `src/components/ds/PageHead.tsx`
- `src/components/ds/Section.tsx`
- `src/components/ds/Skeleton.tsx`
- `src/components/ds/Table.tsx`
- `src/components/ds/Tabs.tsx`
- `src/components/food-cost/CostPctBreakdownModal.tsx`
- `src/components/food-cost/FoodCostBreakdownModal.tsx`
- `src/components/food-cost/MenuItemIngredientsEditor.tsx`
- `src/components/food-cost/PrepCostBreakdownModal.tsx`
- `src/components/help/FeatureIntro.tsx`
- `src/components/help/InfoTip.tsx`
- `src/components/help/LearnMore.tsx`
- `src/components/i18n/LocaleEditingBanner.tsx`
- `src/components/i18n/LocaleTabs.tsx`
- `src/components/i18n/LocalizedOrderNameField.tsx`
- `src/components/import/CsvImportModal.tsx`
- `src/components/kitchen/DailyActionModals.tsx`
- `src/components/kitchen/KitchenDayReview.tsx`
- `src/components/kitchen/KitchenDrawer.tsx`
- `src/components/kitchen/NextServicePanel.tsx`
- `src/components/kitchen/ProductionBoard.tsx`
- `src/components/kitchen/ProductionObjectives.tsx`
- `src/components/kitchen/QuantityEntryDrawer.tsx`
- `src/components/kitchen/SalesLinkEditor.tsx`
- `src/components/kitchen/SalesWorkspace.tsx`
- `src/components/marketing/DiscountEditModal.tsx`
- `src/components/menu/ArticlesKpiRow.tsx`
- `src/components/menu/AssignSetDrawer.tsx`
- `src/components/menu/AvailabilityPill.tsx`
- `src/components/menu/BatchPicker.tsx`
- `src/components/menu/CategoryDrawer.tsx`
- `src/components/menu/PosAddTileModal.tsx`
- `src/components/menu/PosTile.tsx`
- `src/components/menu/PosTileCanvas.tsx`
- `src/components/menu/PosTileInspector.tsx`
- `src/components/menu-item/AIImageGeneratorModal.tsx`
- `src/components/menu-item/AvailabilityCapacityCard.tsx`
- `src/components/menu-item/CreatePrepSheet.tsx`
- `src/components/menu-item/CreateStockSheet.tsx`
- `src/components/menu-item/CustomerFactsEditor.tsx`
- `src/components/menu-item/ItemAvailabilityPanel.tsx`
- `src/components/menu-item/MenuItemForm.tsx`
- `src/components/menu-item/MenuItemRecipeTab.tsx`
- `src/components/menu-item/MenuItemShell.tsx`
- `src/components/menu-item/MenuItemSummaryRail.tsx`
- `src/components/menu-item/MenuItemTabBar.tsx`
- `src/components/menu-item/MenuItemTabCost.tsx`
- `src/components/menu-item/MenuItemTabDetails.tsx`
- `src/components/menu-item/MenuItemTabOptions.tsx`
- `src/components/menu-item/MenuItemTabRecipe.tsx`
- `src/components/menu-item/RecipeComposer.tsx`
- `src/components/menu-item/RecipeTable.tsx`
- `src/components/menu-item/RecipeUnitSelect.tsx`
- `src/components/menu-item/TabBar.tsx`
- `src/components/menu-item/VariantsEditor.tsx`
- `src/components/menu-item/WhatIfSimulator.tsx`
- `src/components/menu-item/combo/CarteCatalog.tsx`
- `src/components/menu-item/combo/ComboSavingsBreakdownModal.tsx`
- `src/components/menu-item/combo/CompositionTab.tsx`
- `src/components/menu-item/combo/CustomerOutcomePreview.tsx`
- `src/components/menu-item/combo/OptionRow.tsx`
- `src/components/menu-item/combo/OptionRowWithVariants.tsx`
- `src/components/menu-item/combo/PricingCard.tsx`
- `src/components/menu-item/combo/StepCard.tsx`
- `src/components/menu-item/combo/Thumb.tsx`
- `src/components/menu-item/combo/TypePickerCards.tsx`
- `src/components/menu-item/combo/TypeSwitchConfirm.tsx`
- `src/components/menu-item/combo/VariantSubRow.tsx`
- `src/components/orders/CancelOrderDialog.tsx`
- `src/components/orders/CashTag.tsx`
- `src/components/orders/ConfirmWeightsModal.tsx`
- `src/components/orders/CorrectPaymentMethodDialog.tsx`
- `src/components/orders/CustomerPicker.tsx`
- `src/components/orders/DraftRestoredBanner.tsx`
- `src/components/orders/EditCustomerDialog.tsx`
- `src/components/orders/EditOrderDrawer.tsx`
- `src/components/orders/FulfillmentSection.tsx`
- `src/components/orders/NewOrderCheckoutDrawer.tsx`
- `src/components/orders/NewOrderComboModal.tsx`
- `src/components/orders/NewOrderItemModal.tsx`
- `src/components/orders/OrderColumnPicker.tsx`
- `src/components/orders/OrdersOperationsRail.tsx`
- `src/components/orders/OverridePaymentDialog.tsx`
- `src/components/orders/OverrideStatusDialog.tsx`
- `src/components/orders/SerieChangeDialog.tsx`
- `src/components/orders/TakePaymentDialog.tsx`
- `src/components/orders/WhatsAppDeliveryReminderDialog.tsx`
- `src/components/orders/WhatsAppRecapDialog.tsx`
- `src/components/orders/detail/CommandBar.tsx`
- `src/components/orders/detail/OrderDetailHead.tsx`
- `src/components/orders/detail/OrderDetailModal.tsx`
- `src/components/orders/detail/OrderDetailShell.tsx`
- `src/components/orders/detail/center/TicketComboBlock.tsx`
- `src/components/orders/detail/center/TicketItems.tsx`
- `src/components/orders/detail/center/TicketLineRow.tsx`
- `src/components/orders/detail/context/CustomerHistoryStrip.tsx`
- `src/components/orders/detail/context/CustomerPanel.tsx`
- `src/components/orders/detail/context/DeliveryPanel.tsx`
- `src/components/orders/detail/context/InvoicePanel.tsx`
- `src/components/orders/detail/context/MoneyPanel.tsx`
- `src/components/orders/detail/context/NotesPanel.tsx`
- `src/components/orders/detail/context/OrderReferences.tsx`
- `src/components/orders/detail/menus/OrderOverflowMenu.tsx`
- `src/components/orders/detail/menus/SendToCustomerMenu.tsx`
- `src/components/orders/detail/primitives/ContextBlock.tsx`
- `src/components/orders/detail/primitives/DetailSkeleton.tsx`
- `src/components/orders/detail/primitives/HairlineRule.tsx`
- `src/components/orders/detail/primitives/Money.tsx`
- `src/components/orders/detail/spine/ActivityTimeline.tsx`
- `src/components/orders/detail/spine/CancellationCallout.tsx`
- `src/components/orders/detail/spine/ScheduledCallout.tsx`
- `src/components/orders/detail/spine/WorkflowStepper.tsx`
- `src/components/production/DateStepper.tsx`
- `src/components/production/ProductionMatrix.tsx`
- `src/components/production/ProductionMobile.tsx`
- `src/components/production/ProductionOrderDetail.tsx`
- `src/components/production/ProductionShoppingList.tsx`
- `src/components/production/ProductionToPrepare.tsx`
- `src/components/qr/QrCard.tsx`
- `src/components/qr/QrTypographyPanel.tsx`
- `src/components/recipe/RecipeStepsEditor.tsx`
- `src/components/search/SearchModal.tsx`
- `src/components/search/SearchTriggerButton.tsx`
- `src/components/settings/SettingsShell.tsx`
- `src/components/settings/SettingsWorkspace.tsx`
- `src/components/settings/StockSettingsNav.tsx`
- `src/components/staff/TableAssignmentModal.tsx`
- `src/components/stock/IngredientIconPicker.tsx`
- `src/components/stock/StockFiltersDrawer.tsx`
- `src/components/stock/StockItemPickerModal.tsx`
- `src/components/stock/StockKpiRow.tsx`
- `src/components/stock/StockQuantityForm.tsx`
- `src/components/stock/VatRateSelect.tsx`
- `src/components/suppliers/SupplierHubTabs.tsx`
- `src/components/tables/TableEditorModal.tsx`
- `src/components/translations/TranslationReviewTable.tsx`
- `src/components/ui/NumberInput.tsx`
- `src/components/ui/alert-dialog.tsx`
- `src/components/ui/alert.tsx`
- `src/components/ui/aspect-ratio.tsx`
- `src/components/ui/avatar.tsx`
- `src/components/ui/badge.tsx`
- `src/components/ui/breadcrumb.tsx`
- `src/components/ui/button.tsx`
- `src/components/ui/card.tsx`
- `src/components/ui/checkbox.tsx`
- `src/components/ui/collapsible.tsx`
- `src/components/ui/context-menu.tsx`
- `src/components/ui/dialog.tsx`
- `src/components/ui/dropdown-menu.tsx`
- `src/components/ui/hover-card.tsx`
- `src/components/ui/input.tsx`
- `src/components/ui/label.tsx`
- `src/components/ui/menubar.tsx`
- `src/components/ui/navigation-menu.tsx`
- `src/components/ui/pagination.tsx`
- `src/components/ui/popover.tsx`
- `src/components/ui/progress.tsx`
- `src/components/ui/radio-group.tsx`
- `src/components/ui/scroll-area.tsx`
- `src/components/ui/select.tsx`
- `src/components/ui/separator.tsx`
- `src/components/ui/sheet.tsx`
- `src/components/ui/sidebar.tsx`
- `src/components/ui/skeleton.tsx`
- `src/components/ui/slider.tsx`
- `src/components/ui/switch.tsx`
- `src/components/ui/table.tsx`
- `src/components/ui/tabs.tsx`
- `src/components/ui/textarea.tsx`
- `src/components/ui/toggle-group.tsx`
- `src/components/ui/toggle.tsx`
- `src/components/ui/tooltip.tsx`
- `src/components/website/CheckoutEditor.tsx`
- `src/components/website/CheckoutPreviewIframe.tsx`
- `src/components/website/ConfirmationEditor.tsx`
- `src/components/website/CoverFocalPicker.tsx`
- `src/components/website/NavbarPanel.tsx`
- `src/components/website/OrderPageInfoEditor.tsx`
- `src/components/website/PageCommerce.tsx`
- `src/components/website/PageCommercePanel.tsx`
- `src/components/website/SectionEditors.tsx`
- `src/components/website/SelectionOverlay.tsx`
- `src/components/website-menu/BannerDesignerPanel.tsx`
- `src/components/website-menu/BrandingPanel.tsx`
- `src/components/website-menu/CoverBackgroundEditor.tsx`
- `src/components/website-menu/FontSelect.tsx`
- `src/components/website-menu/FontUploadPanel.tsx`
- `src/components/website-menu/MyFontsManager.tsx`
- `src/components/website-menu/ThemesPanel.tsx`
- `src/components/website-menu/TypographyPanel.tsx`
- `src/components/website-v3/BranchWebsitePresence.tsx`
- `src/components/website-v3/BuilderShell.tsx`
- `src/components/website-v3/CategoryBarStateEditor.tsx`
- `src/components/website-v3/CategoryNavigationEditor.tsx`
- `src/components/website-v3/ChainOrderEntryEditor.tsx`
- `src/components/website-v3/CheckoutSettingsEditor.tsx`
- `src/components/website-v3/CommerceSelector.tsx`
- `src/components/website-v3/FeatureCardsAppearanceEditor.tsx`
- `src/components/website-v3/FooterEditor.tsx`
- `src/components/website-v3/Inspector.tsx`
- `src/components/website-v3/MenuHighlightsAppearanceEditor.tsx`
- `src/components/website-v3/MobileUnavailable.tsx`
- `src/components/website-v3/NavigationCtaEditor.tsx`
- `src/components/website-v3/OrderDiscoveryAppearanceEditor.tsx`
- `src/components/website-v3/PageAddress.tsx`
- `src/components/website-v3/PageDialog.tsx`
- `src/components/website-v3/PageInspector.tsx`
- `src/components/website-v3/PageRail.tsx`
- `src/components/website-v3/PreviewCanvas.tsx`
- `src/components/website-v3/SectionContentEditors.tsx`
- `src/components/website-v3/SectionInspector.tsx`
- `src/components/website-v3/SiteInspector.tsx`
- `src/components/website-v3/WebsiteV3Builder.tsx`
- `src/components/website-v3/controls.tsx`

## Portée exacte de la migration

- `/login` : Identité C2, champ de mot de passe accessible et hiérarchie de titres. Connexion erronée puis correcte vers le sélecteur ; FR mobile et HE sombre. Authentification biométrique réelle hors fixture.
- `/select-restaurant` : Identité C2 et cartes accessibles RTL/mobile ; chargement, détails partiellement indisponibles avec reprise et établissement toujours accessible. Navigation multi-restaurant et rejet de session absente vérifiés. Redirection mono-restaurant conservée, à tester individuellement.
- `/reset-password` : Formulaire C2 responsive, affichage du mot de passe, validation du lien et concordance, erreur conservant le brouillon et reprise, langue sans perte de saisie, session et redirection multi-restaurant. Cas sans lien/expiré ; FR mobile et HE sombre. Contrat serveur inchangé.
- `/setup-account` : Assistant C2 propriétaire/salarié : mot de passe, profil, restaurant/POS ou code caisse privé. Formulaires clavier, champs liés, erreurs/reprise, payloads distincts et déconnexion du salarié vérifiés. Succès propriétaire et téléchargement absent explicite ; FR mobile et HE sombre.
- `/[restaurantId]/dashboard` : Hiérarchie et comparaisons réelles ; cinq configurations et état vide. Panneaux secondaires à terminer.
- `/[restaurantId]/orders/all` : Liste/détail, permissions et retour de recherche testés. Mutations avancées à vérifier.
- `/[restaurantId]/orders/[orderId]` : Ticket et contexte refondus ; retour conservant les filtres. Paiement/remboursement non exercés.
- `/[restaurantId]/orders/new` : Catalogue/ticket mobile et desktop RTL ; quantité et ouverture/fermeture checkout testées, aucune commande créée.
- `/[restaurantId]/menu/items` : Liste/KPI/actions et retour de sauvegarde. Aides des quatre KPI en FR/EN/HE avec focus clavier ; libellés Actifs/Inactifs fidèles au filtre is_active existant. Sous-vues restantes et actions de masse à vérifier.
- `/[restaurantId]/menu/items/[itemId]` : Éditeur et sous-vues : chargement récupérable, brouillons, modificateurs, recette, disponibilité, images IA et import. Composition : création implicite et ajout filtré, variants/default/deltas, source groupe avec reprise, limites, lecture seule et confirmation de retrait. Coût : calculs traduits, préparation, simulation responsive, permissions, reprise partielle sans répétition confirmée et rafraîchissement préservant le brouillon. FR mobile/HE sombre inspectés ; disponibilité au poids/par variante et audits avancés restent ouverts.
- `/[restaurantId]/menu/options` : Liste, chargement, erreur, confirmation de suppression. Annulation/focus testés ; écritures non testées.
- `/[restaurantId]/menu/modifier-sets` : Même liste partagée, confirmation nommée ; rendu cinq configurations.
- `/[restaurantId]/menu/options/new` : Éditeur et langue sur mobile/RTL sombre. Persistance/erreurs à terminer.
- `/[restaurantId]/menu/options/[optionSetId]` : Éditeur et grilles à défilement contenu. Persistance/erreurs à terminer.
- `/[restaurantId]/menu/modifier-sets/[setId]` : Éditeur et grilles à défilement contenu. Persistance/erreurs à terminer.
- `/[restaurantId]/settings` : Formulaire réellement persisté, état modifié, retry et sortie annulée testés ; limites précisées dans known-issues.
- `/[restaurantId]/kitchen/daily-operations` : Résumé production et thème alignés ; parcours production/réception/clôture non exhaustifs.
- `/[restaurantId]/kitchen/food-cost` : Sélection, mobile/RTL/grand écran, vide et erreur recette. Calculs détaillés et simulateur partagés refondus ; sauvegarde, permissions, changement de sélection protégé, reprises et rafraîchissement vérifiés. Comparaison et autres sous-vues restent ouvertes.
- `/[restaurantId]/analytics/overview` : Vue d’ensemble : hiérarchie, erreurs/retry, comparaisons sans base fictive et tableau du graphique. FR mobile et HE sombre vérifiés ; exports et croisements avancés à approfondir.
- `/[restaurantId]/analytics/items` : Liste et panneau de détail : résumés, recherche, erreurs/retry, combo, graphique avec tableau de valeurs, clavier/focus, FR mobile et HE sombre. Pagination/tri et variations étendues du calendrier à approfondir.
- `/[restaurantId]/analytics/customers` : Liste et profil analytique : recherche, rétention, tableaux, graphique mensuel, erreurs/retry et focus. FR mobile et HE sombre ; pas de gestion des fiches clients dans cette route.
- `/[restaurantId]/staff` : Liste adaptative, invitation, choix de rôle, confirmation de retrait et résultat réel de l’e-mail. Échec/reprise invitation, rôle inchangé sur erreur, annulation de retrait et lecture seule testés sur fixtures.
- `/[restaurantId]/roles` : Cartes et matrice de permissions, groupes partiellement sélectionnés, formulaire, confirmation d’abandon/suppression. Noms système préservés, payload exact, erreurs et lecture seule testés. FR mobile et HE sombre.
- `/[restaurantId]/staff/shifts` : Rapport adaptatif, dates et agrégats distincts du chargement/erreur. Portée ISO de la période et refus d’une réponse périmée testés ; FR mobile et HE sombre.
- `/[restaurantId]/staff/devices` : Accès POS : statuts, informations d’autorisation et confirmation de révocation. Annulation/focus, erreur dans le dialogue et reprise testés sur fixture ; FR mobile et HE sombre.
- `/[restaurantId]/staff/table-service` : Modes natifs au clavier et affectations salles/sections/tables sur mobile et RTL sombre. Mode conservé sur échec, brouillon protégé et payload d’affectation exact testés sur fixtures.

- `/[restaurantId]/menu/categories` : Liste/tableau adaptatifs, création/édition nom et image, confirmation suppression/abandon, erreurs/reprise et lecture seule. Image persistée immédiatement explicitée ; payload du nom conservé, sans modifier les groupes des cartes. FR mobile et HE sombre.

- `/[restaurantId]/menu/modifiers` : Bibliothèque historique par article : liste responsive, création et suppression confirmée, erreurs/reprise, lecture seule. Prix en delta décimal négatif, action et obligation transmis exactement. FR mobile et HE sombre.

- `/[restaurantId]/menu/image-prompts` : Bibliothèque et éditeur de modèles traduits FR/EN/HE, formulaire adaptatif, variables intactes, modèle par défaut, brouillon protégé, création/suppression, erreurs et lecture seule. FR mobile et HE sombre ; aucune génération externe exécutée.

- `/[restaurantId]/menu/rotation` : Planning adaptatif sur quatre semaines, groupes et choix d’article en dialogues clavier, confirmations et erreurs/reprise, lecture seule. Début de semaine dimanche/lundi, payloads, création implicite avec premier article disponible et échecs conservant la valeur confirmée vérifiés ; FR mobile et HE sombre.
- `/[restaurantId]/menu/menus` : Liste/cartes et filtres par nom/canal, création avec horaires communs, menus clavier, confirmation, réorganisation clavier/drag/annulation. Erreurs/reprise, lecture seule, FR mobile et HE sombre. Création partielle réessayée sans doublon.
- `/[restaurantId]/menu/menus/[menuId]/edit` : Formulaire de disponibilité, canaux, rotation, points de vente actifs/inactifs sélectionnés et horaires de nuit. Chargement complet requis avant sauvegarde, confirmation de sortie et signalement des sauvegardes partielles ; reprise et lecture seule testées, FR mobile et HE sombre.
- `/[restaurantId]/menu/menus/[menuId]` : Détail des cartes, groupes repliables au clavier, sélection multiple mobile, réorganisation sans drag, ajout/retrait, déplacement et remplacement en dialogues. Erreurs/reprise sans répéter les étapes réussies, disponibilités globales et bornes de séries futures conservées, lecture seule. FR mobile et HE sombre inspectés ; 10 scénarios inclus dans la validation navigateur compilée (108 tests réussis).
- `/[restaurantId]/menu/menus/[menuId]/pos-display` : Éditeur POS plein écran avec canevas à quatre colonnes en défilement contenu, inspecteur accessible sur mobile, aperçu et navigation des groupes, ajout de tuiles, clavier, traductions FR/EN/HE. Brouillon protégé, erreurs/reprise, sauvegarde exacte des tailles/couleurs/positions, fallback de groupe et renommage immédiat distinct. FR mobile et HE sombre inspectés ; 8 nouveaux scénarios ciblés réussis (10 avec 2 régressions cartes).

- `/[restaurantId]/menu/menus/[menuId]/group/[groupId]` : Éditeur création/édition : traductions, canaux, parent, horaires, image immédiate, catégories, sélection/remplacement/retrait et semaines. Erreurs/reprise, brouillons, lecture seule et focus imbriqué ; 11 nouveaux scénarios et 2 régressions cartes réussis en développement. FR mobile et HE sombre inspectés. Contrats et bornes métier conservés ; catégorie et groupe clairement distincts.

- `/[restaurantId]/menu/items/new` : Création d’article : formulaire responsive, groupes, variantes et modificateurs, confirmation de type, prix au poids et brouillon local. Création partielle réessayée sans doublon. Compositeur partagé refondu et premier choix de combo vérifié dans le POST de création. Import/IA propres à la création restent à approfondir.

Image IA et import de recette de l’article : sous-vues migrées et vérifiées au checkpoint de 169 scénarios. L’import partagé couvre aussi création/remplacement de préparation ; cela ne compte pas la page préparations comme migrée. Le lot suivant a migré le compositeur et les sous-dialogues de coût, avec 8 et 13 scénarios ciblés respectivement ; ils sont inclus dans la validation complète de 190 scénarios réussis sur build compilé.

### Unités et réglages de stock

- `/[restaurantId]/kitchen/units` : Bibliothèque et conversions dépliables, création/édition avec brouillon, reprise après échec, suppression avec impact réel, permissions et erreurs de chargement distinctes. FR mobile et HE sombre ; alias paramètres vérifié. Renommage explicité sans migration automatique des recettes.
- `/[restaurantId]/settings/stock/units` : Alias de la bibliothèque cuisine : navigation active, édition, erreurs et lecture seule vérifiées ; même composant et mêmes contrats.
- `/[restaurantId]/kitchen/availability` : Liste et formulaire des règles, seuil 0 visible, champs conservés quand le suivi est masqué, remplacement de la règle par défaut, suppression bloquée par conflit serveur, brouillon/erreurs/lecture seule. FR mobile et HE sombre ; alias paramètres vérifié.
- `/[restaurantId]/settings/stock/availability` : Alias des règles cuisine : navigation active, défaut, lecture seule et erreur/vide vérifiés ; mêmes composants et contrats.
- `/[restaurantId]/settings/stock` : Unités par défaut, explication du moteur de disponibilité et réglage historique conservé. Chargement avec reprise, états de sauvegarde, erreur conservant la saisie, reset et garde des liens internes. FR mobile et HE sombre ; retour navigateur SPA à approfondir.

### Import de livraison et historique

- `/[restaurantId]/kitchen/stock` : revue scan/voix avec contrôles partagés, analyses interrompues conservées, lignes signalées à vérifier, champs ignorés verrouillés, fichier validé, brouillons mis à jour via le PUT existant conservant le document. Reprise de confirmation, suppression du brouillon et rafraîchissement séparés. Note vocale locale réécoutable, permission refusée/réponse tardive et garde de fermeture testées sans microphone réel.
- `/[restaurantId]/kitchen/supplies` : Historique des réceptions et brouillons : filtres nommés, indicateurs mobiles, erreurs/reprise sans faux vide, détail responsive, suppression confirmée avec reprise, document image/PDF et ouverture externe. FR mobile et HE sombre ; permissions et liens de reprise vérifiés sur fixtures. Valorisation au coût actuel et limite des 100 réceptions explicitées ; fichiers PDF réels et réponses serveur hors fixture non vérifiés.
- `/[restaurantId]/kitchen/daily-operations` : l’import partagé attend le rafraîchissement et propose une reprise après erreur sans double mouvement de stock. Les autres overlays de production restent à terminer.

- `/[restaurantId]/kitchen/lab` : Entrées manuelle/IA, file partagée, autosauvegarde sérialisée, édition, bibliothèques, affinage, images, import/dictée, cible, restauration et commit. 24 scénarios isolés, FR mobile et HE sombre inspectés. IA/micro/serveur réels et garde globale SPA non validés.

- `/[restaurantId]/customers` : Liste, profil/adresse invité, autorisation espèces, ajout, fusion, détachement et suggestions de doublons. 20 scénarios compilés, FR mobile et HE sombre inspectés. Reprises par étapes confirmées ; limites alias espèces et réponse perdue conservées dans l’audit.

### Modèles de messages et clés d’accès

- `/[restaurantId]/settings/message-templates` : Deux modèles FR/EN/HE : brouillons conservés pendant PUT et entre langues, source confirmée avant GET, reprise GET seule, traduction partielle, reset confirmé, limite UTF-8, aperçu fictif et tokens clavier. FR mobile/HE sombre inspectés. Dix tests adjacents et 22 scénarios compte compilés ; aucune messagerie réelle ni garde globale SPA.
- `/[restaurantId]/settings/security` : Clés utilisateur : chargement/reprise, liste indépendante du support plateforme, inscription avec nom gelé, suppression confirmée, hint local dernière clé, erreurs et annulations. FR mobile/HE sombre ; authentificateur virtuel isolé, aucun protocole/API changé.

### Notifications et WhatsApp

- `/[restaurantId]/settings/notifications` : Navigateur, préférences et appareils séparés ; reprise GET, inscription établissement vérifiée, contrôles nommés, retraits confirmés, arrêts serveur/local distingués et sérialisés avec réparation. 22 scénarios compilés ; FR mobile et HE sombre inspectés. Push/SW synthétiques ; unicité endpoint backend et concurrence inter-onglets non modifiées.
- `/[restaurantId]/settings/whatsapp` : Connexion/OTP/polling séparés, Meta borné à une inscription lancée et une origine HTTPS Facebook, revue numéro/nom, reprise GET après réponse perdue, relance et déconnexion confirmées. 17 scénarios compilés et trois unitaires ; FR mobile/HE sombre inspectés. SDK/API synthétiques, effets externes et idempotence serveur non garantis.
