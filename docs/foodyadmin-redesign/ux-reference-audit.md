# Gabarit des listes et navigation intégrée — 4 octobre 2026

## Référence et périmètre

La nouvelle référence est la série de captures Square fournie par l’utilisateur. Elle remplace la direction visuelle issue de FoodyLanding pour ce lot. À la suite de la capture de 21 h 31, le logo est retiré de la navigation de l’application et le favicon utilise le symbole Foody C2 noir. L’accès au profil est conservé dans le pied de la sidebar. Les écrans d’authentification conservent leur identité.

Articles possède les six contrôles demandés : recherche, catégorie, état, tous les filtres, actions, création. Les KPI, onglets de catégories et second bandeau d’actions sont retirés des listes concernées. Les filtres, actions groupées et outils existants restent fonctionnels dans leurs nouveaux emplacements.

Le gabarit partagé couvre les listes Articles, Catégories, Cartes, Options, Ensembles de modificateurs, anciens modificateurs, Stock, Préparations, Livraisons fournisseurs, Fournisseurs, Bons de commande, Commandes, Clients, Réductions, Personnel, Équipe et rôles, Services, Accès POS, Appareils et Profils d’imprimante. Les libellés suivent les données de chaque liste. Les listes sans catégorie, état ou création métier conservent seulement les contrôles applicables ; aucune fonction fictive n’est ajoutée pour atteindre six boutons.

Les rapports analytiques, éditeurs et vues de planification gardent leurs outils propres. Traiteur et Tournées restent reportés selon les instructions antérieures. Les travaux antérieurs sur la production ne sont pas déclarés terminés par ce lot.

## Géométrie et interactions

Sur desktop 1440 px : sidebar 280 px, début du contenu à 312 px, barre à 48 px du haut, contrôles de 48 px et intervalles de 8 px. Recherche de 240 px en pilule, filtres rectangulaires de rayon 12 px, Actions en gris et création en noir. Tableaux blancs, séparateurs horizontaux, en-têtes et corps de 14 px. Pagination partagée. Les colonnes conservent les champs réels de Foody.

La police utilisée est Arial avec Heebo en repli, une approximation de la référence : aucun fichier de la police exacte Square n’a été fourni. Les couleurs fonctionnelles de disponibilité et d’alerte restent sémantiques, comme les états de la référence ; surfaces, navigation, marque et actions sont monochromes.

Le menu État applique immédiatement les choix. Catégorie et Tous les filtres utilisent un panneau latéral de 464 px avec navigation interne, recherche, réinitialisation et application explicite. Fermer ou Échap abandonne les modifications ; le focus revient au déclencheur. Une régression dédiée couvre une période de services abandonnée puis un filtre de rôle appliqué.

Les paramètres restent dans la sidebar principale. Compte, Restaurant, Commandes et livraison, Paiements, Appareils, Communications et Organisation regroupent les destinations existantes selon les permissions. Horaires, délais, parcours des commandes et service à table appartiennent au restaurant. Les URL restent compatibles, les formulaires et gardes de brouillon sont conservés.

## Vérification

- Validation complète du service : lint (20 avertissements préexistants), TypeScript et build de production réussis.
- 641 tests unitaires réussis ; 6 729 clés FR/EN/HE synchronisées.
- 189 scénarios navigateur ciblés réussis sur le build compilé : `evidence/ux-reference/compiled-results.json`.
- 19 scénarios fournisseurs réussissent également sur le même build compilé : `evidence/ux-reference/suppliers-compiled-results.json`.
- Après les dernières corrections, 31 scénarios passent sur le build final : les fondations UX rejouées, l’accès équipe sans droits de paramètres généraux et six parcours d’historique de livraisons. Résultat : `evidence/ux-reference/final-targeted-results.json`. Ce ciblage recouvre une partie des 189 scénarios et ne doit pas être additionné comme un ensemble disjoint.
- Géométrie des six contrôles, filtres immédiats et différés, navigation intégrée, permissions, sélections, pagination, brouillons, erreurs et reprises sans répétition des écritures sont couverts. Les scénarios utilisent exclusivement des API synthétiques, sans validation de matériel ou de services externes réels.
- Captures inspectées : Articles FR desktop, filtre Catégorie, FR mobile, paramètres intégrés ; liste fournisseurs FR mobile ; variantes HE sombre également capturées et contrôlées pour le débordement horizontal.

Ces résultats ciblés ne remplacent pas une nouvelle exécution de toute la suite historique. Les anciens nombres 505/505 et autres checkpoints des documents voisins restent des preuves historiques, pas une validation exhaustive de ce nouveau gabarit.

## Livraison

### Complément : colonnes Articles et marque dans la navigation

- Articles possède un « + » circulaire de 22 px dans une cible de 32 px, à l’extrémité de l’en-tête. Il ouvre un menu de cases à cocher : images, catégorie, disponibilité, prix. Le nom de l’article reste visible ; seuls les champs réels du tableau Foody sont proposés.
- La préférence Articles est personnelle, indexée par utilisateur et restaurant dans ce navigateur. Une valeur invalide rétablit les valeurs par défaut ; un échec d’enregistrement est signalé dans le menu. Aucun endpoint métier n’est appelé pour ce réglage.
- Les lignes de variantes suivent les colonnes visibles. La création rapide conserve ses champs catégorie et prix dans une ligne commune, même lorsque ces colonnes sont masquées. La remise à zéro restaure les quatre options.
- Commandes reprend le même déclencheur circulaire, tout en conservant son ordre des colonnes, ses permissions et son enregistrement partagé au niveau du restaurant.
- Vérification du complément : lint, TypeScript et build réussis ; 16 tests unitaires ciblés ; 6 732 clés de traduction synchronisées ; 32 scénarios navigateur sur le build compilé (`evidence/ux-reference/columns-compiled-results.json`), dont les 25 fondations UX rejouées et sept nouveaux scénarios. Captures FR et HE contrôlées.
- Le favicon SVG noir possède une nouvelle URL versionnée ; les icônes orange ne sont plus déclarées comme favicons de navigateur. Les icônes d’installation PWA et Apple restent distinctes.

Le premier lot est déjà en développement via PR #452. Ce lot UX est local dans `foodyadmin-redesign`, branche `feat/admin-landing-alignment-next`, sans nouveau commit, push ou déploiement. Aucun fichier d’environnement ou autre service n’est modifié.
