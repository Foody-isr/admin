# Fournisseurs — audit préparatoire

État au 4 octobre 2026, avant migration individuelle de `kitchen/suppliers`.

La navigation `SupplierHubTabs` est déjà alignée avec l’historique. Le reste de la page (2 677 lignes) n’est pas encore compté comme migré. Aucun appel à un fournisseur réel pendant cet audit.

## Surfaces et points à traiter

- `SuppliersPage` : chargement groupé non gardé contre changement d’établissement, aucune reprise initiale ; mutations de suppression/annulation natives et erreurs non affichées. Conserver `tab` et les autres paramètres utiles lors du changement d’onglet. Ajouter confirmation nommée, verrou et réception de l’écriture avant rechargement.
- `NeedsTab` et `WeeklyDeliveryRail` : seuils/horaires existants à conserver, noms tronqués, contrôles parfois inférieurs à 44 px, couleurs `brand-50` en sombre. Ne pas déplacer les calculs de date locale à la timezone restaurant sans traiter explicitement ce changement métier.
- `SuppliersTab` / `OrdersTab` : recherche sans nom accessible, actions icônes ambiguës, détail des commandes historiques limité dans l’existant. Ne pas inventer d’édition d’une commande reçue.
- `SupplierFormModal` : contact, nom/traductions, canal/langue, créneaux, notes. Ajouter soumission native, erreur, reprise et garde du brouillon. Les créneaux ont dimanche=0 ; les heures et jours de cutoff gardent leurs valeurs.
- `SupplierProductsModal` / `ProductEditor` : le lecteur pouvait atteindre des boutons de mutation ; appliquer `kitchen.manage`. Chargement/erreur distincts du vide, édition dans un dialogue imbriqué, suppression confirmée ; conserver lien stock, unité, prix et traductions.
- `OrderComposer` : dialogue artisanal sans focus trap, Escape direct, préférences d’unités en échec transformées en `[]`, erreurs création non gérées et changements de fournisseur destructifs pour le brouillon. Migrer sur `FullScreenEditor`. Conserver strictement `buildOrderUnitOptions`, `preferredOrderUnit`, `orderQuantityInBase`, `convertOrderUnit` et `PackagingEditor`.
- `SendOrderModal` : préparation traduite déclenche le POST existant ; messages modifiables écrasés lors de changement langue/date, pas de garde ni reçus de persistance/envoi. WhatsApp ouvre un URL puis demande confirmation explicite ; e-mail envoie un document généré serveur et ne transmet **pas** la zone de texte. Rendre cette différence explicite. Ne pas affirmer l’envoi depuis le seul `window.open`.
- `ReceiveOrderModal` : valeurs reçues par ligne en unités de base, 0 accepté ; nommer les champs, expliquer l’impact, garder les valeurs après erreur et ne pas renvoyer une réception confirmée pour recharger.

## Contrats serveur inspectés, lecture seule

`foodyserver/cmd/server/main.go:1857–1886` : scope restaurant imposé, mutations et refresh-translations exigent `kitchen.manage`.

`internal/suppliers/service.go` :

- `DeleteSupplier` (256) retire les liens supplier/id du stock et les créneaux, puis le fournisseur. Ne pas promettre que les produits et anciennes commandes sont physiquement supprimés.
- `ReceivePurchaseOrder` (1079) accepte seulement le statut `sent`, ajoute les quantités positives au stock lié, remplace le coût unitaire par celui du bon, applique le conditionnement choisi comme défaut, crée les mouvements et marque le bon reçu. Les fiches stock manquantes sont ignorées côté serveur : limite préexistante à documenter.
- `DeletePurchaseOrder` (1167) refuse tout statut autre que `draft`.
- `SendOrderEmail` (1322) prépare les traductions, exige une date, génère son HTML puis envoie et marque `sent`. L’interface ne peut pas garantir l’absence de doublon après une réponse perdue ou une erreur de statut après envoi : aucune idempotence serveur.

Références de composants comparables : `StockItemEditor`, `StockTransactionDialogs`, `CsvImportModal`, `MenuCreateModal` et `CategoryDrawer`. Reprendre leurs primitives et leurs verrous ; ne pas modifier les calculs pour simplifier l’UI.

## Couverture prévue

Trois onglets FR mobile/HE sombre, création/édition fournisseur (créneaux et traductions), suppression/annulation avec erreur, catalogue produits et lecture seule, changement de fournisseur/brouillon, préférences en erreur, conditionnements/quantités payload exact, création suivie de GET en erreur, réception 0/partielle et retry GET, WhatsApp simulé et e-mail entièrement intercepté. Captures réelles de l’interface sur données synthétiques ; aucun message externe.

## Migration implémentée et passage ciblé

Les surfaces ci-dessus ont été reprises : chargeurs gardés, dialogues partagés, permissions, brouillons, reçus de mutations, prévisualisation e-mail en lecture seule, confirmation WhatsApp explicite et navigation conservant le contexte. Les calculs de conditionnement sont inchangés. Le 4 octobre, 19 scénarios ciblés réussissent (56285.823 ms), sans échec ni scénario ignoré ; preuve `evidence/supplier-targeted-results.json`. Captures FR mobile, HE sombre et EN ordinateur, formulaires et éditeur produit, compositeur, réception et envoi inspectées. La régression compilée complète confirme ensuite 264 scénarios réussis, sans échec ni scénario ignoré.

Les échecs initiaux des tests provenaient notamment de sélecteurs qui utilisaient des libellés non exacts ; les tests définitifs ciblent les rôles/noms accessibles. Le contrôle du contexte d’URL a conduit à préserver les paramètres des liens d’onglets. Aucun envoi WhatsApp/e-mail réel, aucune préparation IA distante.
