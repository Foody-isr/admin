# Correspondance avec FoodyLanding

Référence : sources locales non déployées de `../foodylanding`, branche `feat/landing-israel-redesign`, relues le 4 octobre 2026. La landing reste en lecture seule. Ne pas prendre son ancienne version publiée comme cible.

| Source utilisée | Produit / état | Destination Admin | À reprendre et adaptation |
|---|---|---|---|
| `components/brand/FoodyLogo.tsx`, identité C2 | Wordmark, symbole et composition vectoriels | Accès, navigation, favicon, chargement | Géométrie conservée, couleur du mot héritée du thème, symbole #eb5204 ; aucune inversion RTL |
| `marketing/ProductDemo.tsx`, onglet Caisse | FoodyPOS, catalogue et ticket | Nouvelle commande, détail commande, catalogue | Surface blanche, titre/contexte, séparateurs fins, panneau de ticket. La navigation POS n'est pas transposée au back-office |
| Même composant, onglet Production | Admin/cuisine, plan et avancement | Production, préparations | Résumé bleu pâle, quantités lisibles, lignes séparées, statut textuel. Conserver unités, dates et actions réelles |
| Même composant, onglet Food cost | Cuisine, coût d'une recette | Coûts et marges, recette article | Valeur structurante, ventilation tabulaire, coûts distincts du bénéfice net ; pas de pourcentage fictif |
| `marketing/Experience.tsx`, `companion` | Compagnon cuisine, ouverture/service/clôture | Opérations quotidiennes | Navigation des phases et tâches lisibles. Siri reste une capacité de l'iPad, aucun faux micro dans l'admin |
| `Experience.tsx`, `recipe` | Cuisine, ingrédients et coût matière | Fiche recette, food cost | Hiérarchie de chiffres, lignes fines et accent fonctionnel |
| `Experience.tsx`, `chains` | Réseau, plans par établissement | Chaînes, branches, production | Blocs par établissement, quantités et avancement réel |
| `Experience.tsx`, `ordering`, `service`, `retail` | Boutique client / POS / terminal | Références de marque uniquement | Ni navigation client ni boutons simulés importés dans l'admin |
| `Experience.tsx`, `cloud`, `payments` | Illustration d'architecture | Aucune copie directe | Schémas marketing, pas de capacités d'administration supplémentaires |

## Fondations mesurées dans les sources

Manrope 400/600/800 (latin), Heebo 400/600/800 (hébreu), versions locales accompagnées de leurs licences OFL. Encre #171717, blanc #fff, surface secondaire #f5f6f7, navigation #f8f9fa, lignes #e9edef, orange #eb5204, bleu #dceaff, marine #153b5b. Contrôles 6 px, surfaces 8 px. La démonstration est réduite : ses textes de 10–11 px sont portés à 12–14 px dans l'outil de travail.

Les cadres noirs de tablette, grandes ombres, photographies et fonds promotionnels restent dans la landing. Aucune référence directe du dashboard complet, des paramètres ou du thème sombre : prolonger le système documenté plutôt que prétendre reproduire une capture inexistante. Les anciennes références `foody-os-handoff` ne sont plus la direction artistique.

## Vérification

Les références sont des captures de `.demo-workspace`, sans décor du site : `evidence/landing-pos.png`, `landing-production.png` et `landing-food-cost.png`. Elles ont été vues dans le navigateur local puis comparées aux rendus admin.

| Référence | État admin inspecté | Correspondance et adaptation | Limite actuelle |
|---|---|---|---|
| Caisse, catalogue/ticket | `new-order-mobile.png`, `new-order-he-dark.png`, `checkout-mobile.png`, `order-detail-fr.png` | Catalogue et ticket distincts, séparateurs sobres, chiffres tabulaires. Deux vues tactiles sur mobile pour préserver la lisibilité ; la sidebar reste celle d’un back-office | Rendu et ajout/quantité/fermeture vérifiés. Paiements et variantes complexes non exhaustifs |
| Production | `kitchen-fr.png`, `kitchen-he-dark.png` | Résumé bleu, production par lignes, quantités et unités. Pas de compte d’avancement inventé ; les informations affichées viennent des contrats cuisine | Sous-vues production/réception/clôture à terminer |
| Food cost | `food-cost-comparable.png`, résumé capturé à 935 px, comme la référence | Jauge puis prix de vente, coût matière et marge. Le vrai produit conserve cible 35 %, TVA et variantes ; la démo illustre 30 %. Titres portés à 12–14 px pour un outil de travail | Sélection, recette, vide/retry inspectés. Comparaison et simulateur non exhaustifs |
| Identité C2 | Sidebar, accès et chargement des captures admin | Wordmark et symbole réutilisés, géométrie non retournée en RTL. Même Manrope/Heebo locale | Icônes existantes intégrées à ce worktree conservées |

Dashboard, paramètres, rapports, personnel et rôles n’ont pas de maquette directe sur la landing. Ils prolongent les mêmes espacements, surfaces bleues de synthèse, contrôles, labels et dialogues. Le sombre dérive des tokens documentés ; il ne prétend pas reproduire une référence sombre absente. Les captures restent des preuves locales avec données synthétiques, pas une validation de tous les parcours.

Les écrans d’accès et de choix d’établissement emploient le wordmark C2 et le symbole C2 sans transformation RTL. Les captures `login-he-dark.png`, `setup-platform-mobile.png` et `restaurant-picker-mobile.png` montrent les adaptations réelles ; aucune composition de ces formulaires n’est attribuée à une démonstration métier absente de la landing. Les bibliothèques utilisent les mêmes surfaces, typographie et dialogues, avec des résumés bleus réservés au contexte utile.

Les listes de cartes et leur contenu prolongent les surfaces blanches/sombres, en-têtes bleus et densité de catalogue des démonstrations produit. Les horaires, groupes et dialogues sont des adaptations administratives : aucune maquette équivalente complète n’est présente sur la landing. Les couleurs POS enregistrées restent des données de configuration, distinctes des tokens de l’administration.

### Éditeur des groupes

Extension du langage produit local : surfaces neutres, résumé bleu réservé aux affectations, actions orange, sections de formulaire peu arrondies. FoodyLanding ne fournit pas de maquette de cette édition ; la disposition est adaptée aux traductions et opérations réelles. Les captures `group-*` documentent mobile, RTL sombre, sélecteurs et confirmations. Les images du groupe restent des contenus restaurant, distincts du logo C2 global.


### Recette, disponibilité et création d’ingrédients

La ventilation en lignes et les coûts lisibles reprennent les références `Experience.recipe` et `ProductDemo.food-cost`. La création de préparation utilise le résumé bleu pâle pour le coût total et unitaire. Les éditeurs d’instructions, de stock et les dialogues n’ont pas de maquette directe : ils prolongent les mêmes polices, surfaces, contrôles et espacements, en gardant les vrais modes de stock et de disponibilité. Les captures `existing-item-recipe-*`, `existing-item-availability-*` et `existing-item-create-*` documentent les adaptations mobile et RTL sombre.


### Images et import de recettes

Aucune maquette d’import ou de génération d’image n’est présentée dans la landing locale. Ces sous-vues prolongent donc ses surfaces blanches/sombres, bords fins, rayons modérés, titres Manrope/Heebo et actions orange. Les modèles et fichiers restent des outils réels : l’illustration ne remplace aucune fonction. Les modèles de démonstration et réponses de génération des tests sont synthétiques.
