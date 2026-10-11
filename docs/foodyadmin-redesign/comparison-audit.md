# Comparateur de coûts

Route `/[restaurantId]/kitchen/food-cost/compare?ids=…`, deux à six articles. Sources proches lues : espace food cost, CostPctBreakdownModal, PrepCostBreakdownModal, FullScreenEditor, Modal. Cible : extension du tableau financier produit de FoodyLanding avec les mêmes tokens et densité, pas une composition marketing.

## Contrats conservés

`getAllCategories` lit les catégories globales du restaurant ; recettes et overrides sont chargés par identifiant. `computeItemCostSummary` reste inchangé : première variante active, prix absolu/override, quantités et conversions, TVA propre à chaque stock, calcul de préparation et marge. Le ratio garde le seuil métier 35 %. Le dialogue de ratio reçoit toujours le prix stocké TTC afin de le normaliser lui-même. Les liens vers la recette d’article et la préparation `?edit=` restent en place, avec les permissions existantes.

## Implémentation

- Espace plein écran partagé, focus/Escape, tableau natif avec en-têtes et région horizontale au clavier. Colonne de métriques fixe en début de ligne et défilement local, FR/EN/HE. Nom complet, nombres isolés et pourcentages localisés.
- Chargement erreur/reprise distinct du vide, ingrédients/options requis, réponse périmée ignorée après changement de sélection ou établissement. Un article absent bloque explicitement la comparaison. Identifiants positifs entiers dédupliqués ; limites deux à six ; contexte d’URL conservé à la fermeture.
- Repères « plus bas/plus élevé » textuels. Les recettes absentes et préparations signalées ne sont plus présentées comme gagnantes à coût zéro. Les valeurs/calculs restent visibles et inchangés ; toutes les égalités extrêmes partagent le repère.
- Détail des coûts : Modal partagé, tableau avec coût immédiatement après l’ingrédient et total toujours visible hors défilement. Unités et quantités inchangées, devise du restaurant, coût unitaire à quatre décimales, pas d’euro/shekel codé en dur.

## Vérification ciblée

12 scénarios passent en développement : neuf comparateur, deux régressions préparation FR/HE et un contrôle du choix persistant d’aide mobile. Les parcours comparent la TVA 0/18 %, une variante à 59 TTC/50 HT, le ratio, les chargements incomplets, les liens invalides, les permissions et réponses retardées. Calculs/focus FR mobile et HE sombre réellement inspectés ; aucun appel serveur réel. Checkpoint compilé complet : 291/291, exit 0, 597 tests unitaires, 6 139 clés et lint/types/build réussis.

Le même lot replie par défaut l’aide des préparations sur mobile tout en honorant le choix enregistré, améliore les cibles et tokens de l’aide partagée, et applique `dir=auto` aux textes des instructions.
